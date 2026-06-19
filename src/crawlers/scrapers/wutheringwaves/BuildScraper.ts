import * as cheerio from 'cheerio';
import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { axiosGetWithRetry } from '../../utils/httpRetry';
import logger from '../../../utils/logger';
import { prisma } from '../../../utils/prisma';

/**
 * 명조(WuWa) 추천 빌드 스크래퍼 — wuthering.gg/ko(커뮤니티 큐레이션) 소스.
 *
 * genshin/starrail/zzz BuildScraper와 동형(슬러그 목록 → 캐릭터 페이지 cheerio 파싱)이지만, wuthering.gg는
 * 한국어 SSR이라 캐릭터/무기 매핑에 별도 언어 브리지가 거의 필요 없다(에코만 예외).
 *   - recommendedWeapons : 추천 무기(한국어명) → DB item(Weapon) originalId 배열 → 프론트 MainItemView
 *   - echoSets           : 추천 에코(영문명) → DB echo로 매핑한 카드 { relics:[{name,icon,items,desc}] }
 *                          → 프론트 BuildRecommendationView(비-HSR 경로, listData.relics)
 *   - recommendedEchoes  : 추천 에코 originalId 배열(보조/보존 키)
 *   - recommendedSonata  : 소나타(에코 세트) 효과 텍스트 배열(참고용)
 *   - recommendedSource  : 'wuthering.gg'
 *
 * 언어 매핑:
 *   - 캐릭터 : 페이지 <h1>(한국어명) → DB character(name) → originalId. (슬러그는 영문이라 H1이 가장 안전)
 *   - 무기   : 페이지의 추천 무기명(한국어) → DB item(Weapon name) → originalId
 *   - 에코   : 페이지의 추천 에코명(영문) → encore.moe /en/echo(영문명→Id) → Id == DB echo originalId.
 *             (DB 에코는 한국어명이라 직접 매칭 불가 → 영문 브리지. 표시는 DB 한국어명/아이콘 사용)
 *
 * 주의) syncCharacters를 쓰지 않는다. wuwa 캐릭터는 Element type이 'element'/'weapon'이고 metadata에
 *   element/path 키가 없어, syncCharacters('DamageType'/'Path' 해석)가 돌면 elementId/pathId를 비우거나
 *   중복 Element를 만든다. 따라서 save()가 metadata만 read-merge해 다른 컬럼/키를 보존한다(nikke detail 동형).
 *   추천은 패치마다 변하는 큐레이션이라 "참고용".
 */
const GG_LIST = 'https://wuthering.gg/ko/characters';
const GG_BASE = 'https://wuthering.gg/ko/characters';
const ENCORE_EN_ECHO = 'https://api.encore.moe/en/echo';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wuthering.gg 슬러그/표시명 보정(필요 시). 현재는 H1(한국어) 매칭이 주력이라 비어있음.
const CHAR_ALIAS: Record<string, string> = {};

type RecoMeta = {
  originalId: string;
  recommendedWeapons: string[];
  recommendedEchoes: string[];
  echoSets: { relics: { name: string; icon: string; items: string[]; desc: string }[] };
  recommendedSonata: string[];
  recommendedSource: string;
};

export class WutheringWavesBuildScraper extends ScraperBase {
  constructor() {
    super('wutheringwaves');
  }

  async scrape(limit?: number): Promise<ScrapedData[]> {
    logger.info('Starting Wuthering Waves Build scraping (wuthering.gg/ko)...');
    const game = await prisma.game.findUnique({
      where: { slug: 'wutheringwaves' },
    });
    if (!game) throw new Error('Wuthering Waves game record not found in DB!');

    // 1. DB 무기/에코/캐릭터 매핑 테이블
    const items = await prisma.item.findMany({
      where: { gameId: game.id, type: { in: ['Weapon', 'Echo'] } },
      select: { name: true, originalId: true, type: true, imageUrl: true },
    });
    const weaponByName = new Map<string, string>();
    const echoById = new Map<string, { name: string; imageUrl: string | null }>();
    for (const it of items) {
      if (!it.originalId) continue;
      if (it.type === 'Weapon' && it.name)
        weaponByName.set(this.norm(it.name), it.originalId);
      else if (it.type === 'Echo')
        echoById.set(String(it.originalId), {
          name: it.name,
          imageUrl: it.imageUrl,
        });
    }
    if (weaponByName.size === 0)
      throw new Error('WuWa 무기가 DB에 없음 — weapon 크롤을 먼저 실행하세요.');

    // 영문 에코명 → Id(= DB originalId) 브리지. DB에 존재하는 Id만 채택.
    const echoEnToId = await this.loadEchoBridge(echoById);
    logger.info(
      `Loaded maps — weapons:${weaponByName.size} echoes:${echoById.size} enEchoBridge:${echoEnToId.size}`,
    );

    const chars = await prisma.character.findMany({
      where: { gameId: game.id },
      select: { name: true, originalId: true },
    });
    const charByName = new Map<string, { name: string; originalId: string }>();
    for (const c of chars) {
      if (c.originalId && c.name)
        charByName.set(this.norm(c.name), {
          name: c.name,
          originalId: String(c.originalId),
        });
    }

    // 2. 슬러그 목록
    let slugs = await this.fetchValidSlugs();
    if (slugs.length === 0)
      throw new Error('wuthering.gg 슬러그 0건(목록 구조 변경 의심)');
    if (limit) slugs = slugs.slice(0, limit);
    logger.info(`Found ${slugs.length} wuthering.gg character slugs.`);

    const results: ScrapedData[] = [];
    let processed = 0;
    let matched = 0;
    let ggErrors = 0;
    const unmappedChars: string[] = [];
    const unmappedWeapon = new Set<string>();
    const unmappedEcho = new Set<string>();

    for (const slug of slugs) {
      processed++;
      try {
        const html = await this.fetchGg(slug);
        if (!html) {
          ggErrors++;
          continue;
        }

        const dbChar = this.resolveChar(slug, html, charByName);
        if (!dbChar) {
          unmappedChars.push(slug);
          continue;
        }

        const parsed = this.parseBuild(html);

        // 무기(한국어명) → originalId
        const recommendedWeapons: string[] = [];
        for (const w of parsed.weapons) {
          const id = weaponByName.get(this.norm(w));
          if (id) {
            if (!recommendedWeapons.includes(id)) recommendedWeapons.push(id);
          } else unmappedWeapon.add(w);
        }

        // 에코(영문명) → Id → DB 카드(한국어명/아이콘)
        const recommendedEchoes: string[] = [];
        const relics: RecoMeta['echoSets']['relics'] = [];
        for (const e of parsed.echoes) {
          const id = echoEnToId.get(this.norm(e.name));
          const dbEcho = id ? echoById.get(id) : undefined;
          if (id && dbEcho) {
            if (!recommendedEchoes.includes(id)) {
              recommendedEchoes.push(id);
              relics.push({
                name: dbEcho.name,
                icon: dbEcho.imageUrl || '',
                items: [id],
                desc: e.cost ? `코스트 ${e.cost}` : '',
              });
            }
          } else unmappedEcho.add(e.name);
        }

        if (
          recommendedWeapons.length === 0 &&
          relics.length === 0 &&
          parsed.sonata.length === 0
        )
          continue;
        matched++;

        const metadata: RecoMeta = {
          originalId: dbChar.originalId,
          recommendedWeapons,
          recommendedEchoes,
          echoSets: { relics },
          recommendedSonata: parsed.sonata,
          recommendedSource: 'wuthering.gg',
        };

        results.push({
          name: dbChar.name,
          sourceUrl: `${GG_BASE}/${slug}`,
          originalId: dbChar.originalId,
          metadata,
        });
        logger.info(
          `[WW-Build] ${processed}/${slugs.length} ${dbChar.name} (${dbChar.originalId}): ${recommendedWeapons.length} weapons, ${relics.length} echoes, ${parsed.sonata.length} sonata`,
        );
      } catch (e) {
        ggErrors++;
        logger.warn(`Build scrape failed for slug ${slug}`);
      }
    }

    if (unmappedChars.length)
      logger.warn(
        `[WW-Build] 캐릭터 매핑 실패 ${unmappedChars.length}: ${unmappedChars.join(', ')}`,
      );
    if (unmappedWeapon.size)
      logger.warn(
        `[WW-Build] 무기 매핑 실패 ${unmappedWeapon.size}: ${[...unmappedWeapon].join(', ')}`,
      );
    if (unmappedEcho.size)
      logger.warn(
        `[WW-Build] 에코 매핑 실패 ${unmappedEcho.size}: ${[...unmappedEcho].join(', ')}`,
      );

    if (results.length === 0)
      throw new Error(
        `WuWa build scrape produced 0 results (wuthering.gg 구조 변경/슬러그 불일치 의심, ggErrors=${ggErrors})`,
      );
    logger.info(
      `WuWa build: ${matched} matched / ${ggErrors} errors / ${slugs.length} total`,
    );
    return results;
  }

  /**
   * scrape 결과를 캐릭터 metadata에 read-merge한다(추천 키만 갱신, 그 외 보존).
   * syncCharacters를 쓰지 않는 이유는 클래스 주석 참고(elementId/pathId·Element type 보존).
   */
  async save(data: ScrapedData[]): Promise<void> {
    const game = await prisma.game.findUnique({
      where: { slug: 'wutheringwaves' },
    });
    if (!game) throw new Error('Wuthering Waves game record not found in DB!');

    let updated = 0;
    for (const item of data) {
      try {
        const originalId = String(item.originalId ?? item.metadata?.originalId);
        const existing = await prisma.character.findFirst({
          where: { gameId: game.id, originalId },
          select: { id: true, metadata: true },
        });
        if (!existing) {
          logger.warn(`[WW-Build] character originalId=${originalId} not found, skip`);
          continue;
        }
        const existingMeta =
          existing.metadata && typeof existing.metadata === 'object'
            ? (existing.metadata as Record<string, any>)
            : {};
        const m = item.metadata as RecoMeta;
        const merged = {
          ...existingMeta,
          recommendedWeapons: m.recommendedWeapons,
          recommendedEchoes: m.recommendedEchoes,
          echoSets: m.echoSets,
          recommendedSonata: m.recommendedSonata,
          recommendedSource: m.recommendedSource,
        };
        await prisma.character.update({
          where: { id: existing.id },
          data: { metadata: merged },
        });
        updated++;
      } catch (e) {
        logger.error(`[WW-Build] save failed for ${item.name}:`, e);
      }
    }
    logger.info(`[WW-Build] save complete: ${updated} characters updated.`);
  }

  // ---------------------------------------------------------------- bridges

  /** encore.moe /en/echo → {정규화 영문명 → Id}. DB에 존재하는 Id만 채택(중복명은 DB 보유분 우선). */
  private async loadEchoBridge(
    echoById: Map<string, any>,
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    try {
      const res = await axiosGetWithRetry<any>(ENCORE_EN_ECHO, {
        timeout: 20000,
        headers: { 'User-Agent': UA },
      });
      const list: any[] = res.data?.Echo || [];
      for (const e of list) {
        if (!e?.Name || e.Id == null) continue;
        const id = String(e.Id);
        if (!echoById.has(id)) continue; // DB에 없는 변형 Id는 제외
        const key = this.norm(e.Name);
        if (!map.has(key)) map.set(key, id); // 동명이 여러 Id면 첫(DB 보유) 채택
      }
    } catch (e) {
      logger.warn('[WW-Build] encore /en/echo bridge load failed', e);
    }
    return map;
  }

  // --------------------------------------------------------------- fetching

  private async fetchValidSlugs(): Promise<string[]> {
    try {
      const res = await axiosGetWithRetry<string>(GG_LIST, {
        timeout: 15000,
        headers: { 'User-Agent': UA },
        responseType: 'text',
      });
      const html = typeof res.data === 'string' ? res.data : '';
      const set = new Set<string>();
      // 슬러그에 점(.)이 들어갈 수 있어 반드시 포함(star-rail/zzz 교훈).
      const re = /href="\/ko\/characters\/([a-z0-9.-]+)\/?"/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html))) set.add(m[1]);
      return Array.from(set);
    } catch {
      return [];
    }
  }

  private async fetchGg(slug: string): Promise<string | null> {
    try {
      await this.delay(200);
      const res = await axiosGetWithRetry<string>(`${GG_BASE}/${slug}`, {
        timeout: 15000,
        headers: { 'User-Agent': UA },
        responseType: 'text',
      });
      return typeof res.data === 'string' ? res.data : null;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------- parsing

  /** 페이지 <h1>(한국어명) → DB 캐릭터. 실패 시 슬러그(영문) 정규화 폴백. */
  private resolveChar(
    slug: string,
    html: string,
    charByName: Map<string, { name: string; originalId: string }>,
  ): { name: string; originalId: string } | null {
    const $ = cheerio.load(html);
    const h1 = $('h1').first().text().trim();
    if (h1) {
      const byName = charByName.get(this.norm(h1));
      if (byName) return byName;
    }
    const slugNorm = this.norm(slug);
    return (
      charByName.get(slugNorm) ||
      (CHAR_ALIAS[slugNorm] ? charByName.get(CHAR_ALIAS[slugNorm]) : undefined) ||
      null
    );
  }

  /**
   * 빌드 섹션 파싱:
   *   - weapons : .character-weapon .name (추천 무기, 한국어)
   *   - echoes  : .echoes-build .echo-choice 의 .echo-name(영문) + .cost
   *   - sonata  : .sonata-effects .effect (세트 효과 텍스트)
   * 셀렉터가 비면 빈 배열(DOM 변경에 방어적).
   */
  private parseBuild(html: string): {
    weapons: string[];
    echoes: { name: string; cost: string }[];
    sonata: string[];
  } {
    const $ = cheerio.load(html);
    const weapons: string[] = [];
    $('.character-weapon .name').each((_i, el) => {
      const t = $(el).text().trim();
      if (t) weapons.push(t);
    });

    const echoes: { name: string; cost: string }[] = [];
    $('.echoes-build .echo-choice').each((_i, el) => {
      const name = $(el).find('.echo-name').first().text().trim();
      const cost = $(el).find('.cost').first().text().trim();
      if (name) echoes.push({ name, cost });
    });

    const sonata: string[] = [];
    $('.sonata-effects .effect').each((_i, el) => {
      const t = $(el)
        .text()
        .trim()
        .replace(/^[•·\s]+/, '');
      if (t) sonata.push(t);
    });

    return {
      weapons: Array.from(new Set(weapons)),
      echoes,
      sonata: Array.from(new Set(sonata)),
    };
  }

  /**
   * 이름 정규화(매핑 키): NFC + 소문자 + 태그 제거 + 유니코드 글자/숫자만.
   * 한국어(무기/캐릭터)와 영문(에코, é 포함)을 모두 매칭하므로 ASCII로 축소하면 안 된다(zzz norm과 동일).
   */
  private norm(name: string): string {
    return (name || '')
      .normalize('NFC')
      .toLowerCase()
      .replace(/<[^>]+>/g, '')
      .replace(/[^\p{L}\p{N}]/gu, '');
  }
}
