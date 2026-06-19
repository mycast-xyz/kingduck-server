import * as cheerio from 'cheerio';
import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { axiosGetWithRetry } from '../../utils/httpRetry';
import logger from '../../../utils/logger';
import { prisma } from '../../../utils/prisma';
import { crawlProgress } from '../../crawlProgress';

/**
 * 젠레스 존 제로(ZZZ) 추천 빌드 스크래퍼 — genshin.gg/zzz(커뮤니티 큐레이션) 소스.
 *
 * star-rail BuildScraper와 동일한 genshin.gg HTML 구조(`.character-info-build-section`)를 쓴다.
 * 캐릭터별 "추천 W-엔진 / 추천 드라이브 디스크 / 추천 파티"를 가져와 character.metadata에 병합한다.
 *   - metadata.recommendedWEngines : W-Engine item originalId 배열 → 프론트 MainItemView
 *   - metadata.driveDiscs          : { Set4IDList, Set2IDList } → 프론트 BuildRecommendationView
 *   - metadata.teams               : [{ name, slots:[{main:charOriginalId, backups:[]}] }] → TeamRecommendationView
 *   - metadata.recommendedSource   : 'genshin.gg'
 *
 * 언어 브리지(EN↔KO): zzz.gg에 영문 로케일이 없어 genshin.gg(영문) ↔ 우리 DB(한국어)를 직접 잇지 못한다.
 *   → Enka Network 공개 store(github raw)의 다국어 텍스트맵으로 영문명→한국어명을 만든 뒤, 한국어명으로
 *     DB 아이템/캐릭터를 매칭한다. (검증: 캐릭 49/51, 무기/디스크 전건 매핑)
 *   - W-엔진/디스크 : Enka weapons/equipments → en→ko → DB item(name) → originalId
 *   - 캐릭터        : genshin.gg 슬러그 → Enka avatar en→ko → DB character(name) → originalId
 *                    (실패 시 avatar Image의 IconRole 번호 = DB originalId 폴백, 섹션 제목 폴백)
 *
 * 주의) syncCharacters는 metadata를 통째로 덮으므로 기존 metadata(skills 등)를 읽어 병합한 전체를 반환한다.
 *   추천은 패치마다 변하는 큐레이션이라 "참고용".
 */
const GG_LIST = 'https://genshin.gg/zzz/';
const GG_BASE = 'https://genshin.gg/zzz/characters';
const ENKA_BASE =
  'https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/zzz';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// genshin.gg 슬러그(영숫자 정규화) → Enka 영문명 보정.
const CHAR_ALIAS: Record<string, string> = {
  janedoe: 'jane', // genshin.gg "Jane Doe" vs Enka "Jane"
};

export class ZzzBuildScraper extends ScraperBase {
  constructor() {
    super('zzz');
  }

  async scrape(limit?: number): Promise<ScrapedData[]> {
    logger.info('Starting ZZZ Build scraping (genshin.gg/zzz)...');
    const game = await prisma.game.findUnique({ where: { slug: 'zzz' } });
    if (!game) throw new Error('ZZZ game record not found in database!');

    // 1. Enka 다국어 브리지(en→ko)
    const enka = await this.loadEnka();
    logger.info(
      `Loaded Enka maps — weapons:${enka.weaponEnToKo.size} suits:${enka.suitEnToKo.size} avatars:${enka.avatarEnToKo.size}`,
    );

    // 2. DB 아이템/캐릭터 — 한국어명 정규화 키로 매칭
    const items = await prisma.item.findMany({
      where: { gameId: game.id, type: { in: ['W-Engine', 'DriveDisc'] } },
      select: { name: true, originalId: true, type: true },
    });
    const wEngineByKo = new Map<string, string>();
    const diskByKo = new Map<string, string>();
    for (const it of items) {
      if (!it.originalId || !it.name) continue;
      if (it.type === 'W-Engine') wEngineByKo.set(this.norm(it.name), it.originalId);
      else if (it.type === 'DriveDisc') diskByKo.set(this.norm(it.name), it.originalId);
    }
    if (wEngineByKo.size === 0 && diskByKo.size === 0)
      throw new Error('ZZZ 아이템이 DB에 없음 — item 크롤을 먼저 실행하세요.');

    const chars = await prisma.character.findMany({
      where: { gameId: game.id },
      select: { name: true, originalId: true, metadata: true },
    });
    const charByKo = new Map<string, { name: string; originalId: string; metadata: any }>();
    const charByOriginalId = new Map<string, { name: string; originalId: string; metadata: any }>();
    for (const c of chars) {
      if (!c.originalId) continue;
      const rec = {
        name: c.name,
        originalId: c.originalId,
        metadata:
          c.metadata && typeof c.metadata === 'object'
            ? (c.metadata as Record<string, any>)
            : {},
      };
      if (c.name) charByKo.set(this.norm(c.name), rec);
      charByOriginalId.set(c.originalId.toLowerCase(), rec);
    }

    // 3. genshin.gg/zzz 슬러그
    let slugs = await this.fetchValidSlugs();
    if (slugs.length === 0)
      throw new Error('genshin.gg/zzz 슬러그 0건(목록 구조 변경 의심)');
    if (limit) slugs = slugs.slice(0, limit);
    logger.info(`Found ${slugs.length} genshin.gg/zzz character slugs.`);

    const results: ScrapedData[] = [];
    let processed = 0;
    let matched = 0;
    let ggErrors = 0;
    const unmappedChars: string[] = [];
    const unmappedWE = new Set<string>();
    const unmappedDisk = new Set<string>();

    for (const slug of slugs) {
      if (crawlProgress.shouldStop()) break; // 사용자 중단 요청
      crawlProgress.report(processed, slugs.length, slug);
      processed++;
      try {
        const html = await this.fetchGg(slug);
        if (!html) {
          ggErrors++;
          continue;
        }

        const dbChar = this.resolveChar(slug, html, enka, charByKo, charByOriginalId);
        if (!dbChar) {
          unmappedChars.push(slug);
          continue;
        }

        const parsed = this.parseBuild(html);

        // W-엔진 영문명 → ko → DB originalId
        const recommendedWEngines = this.mapNames(
          parsed.wEngines,
          enka.weaponEnToKo,
          wEngineByKo,
          unmappedWE,
        );
        // 드라이브 디스크 세트 영문명 → ko → DB originalId
        const diskIds = this.mapNames(
          parsed.disks,
          enka.suitEnToKo,
          diskByKo,
          unmappedDisk,
        );
        const teams = this.parseTeams(html, enka, charByKo, charByOriginalId);

        if (
          recommendedWEngines.length === 0 &&
          diskIds.length === 0 &&
          teams.length === 0
        )
          continue;
        matched++;

        const existingMeta = dbChar.metadata;
        const driveDiscs =
          diskIds.length > 0
            ? { Set4IDList: diskIds, Set2IDList: [] as string[] }
            : existingMeta.driveDiscs || {};

        const metadata = {
          ...existingMeta,
          originalId: dbChar.originalId,
          recommendedWEngines:
            recommendedWEngines.length > 0
              ? recommendedWEngines
              : existingMeta.recommendedWEngines || [],
          driveDiscs,
          teams: teams.length > 0 ? teams : existingMeta.teams || [],
          recommendedStats: parsed.stats,
          recommendedSource: 'genshin.gg',
        };

        results.push({
          name: dbChar.name,
          sourceUrl: `${GG_BASE}/${slug}/`,
          metadata,
        });
        logger.info(
          `[ZZZ-Build] ${processed}/${slugs.length} ${dbChar.name} (${dbChar.originalId}): ${recommendedWEngines.length} W-Engines, ${diskIds.length} disks, ${teams.length} teams`,
        );
      } catch (e) {
        ggErrors++;
        logger.warn(`Build scrape failed for slug ${slug}`);
      }
    }

    if (unmappedChars.length)
      logger.warn(`[ZZZ-Build] 캐릭터 매핑 실패 ${unmappedChars.length}: ${unmappedChars.join(', ')}`);
    if (unmappedWE.size)
      logger.warn(`[ZZZ-Build] W-엔진 매핑 실패 ${unmappedWE.size}: ${[...unmappedWE].join(', ')}`);
    if (unmappedDisk.size)
      logger.warn(`[ZZZ-Build] 디스크 매핑 실패 ${unmappedDisk.size}: ${[...unmappedDisk].join(', ')}`);

    if (results.length === 0)
      throw new Error(
        `ZZZ build scrape produced 0 results (genshin.gg 구조 변경/슬러그 불일치 의심, ggErrors=${ggErrors})`,
      );
    logger.info(
      `ZZZ build: ${matched} matched / ${ggErrors} errors / ${slugs.length} total`,
    );
    return results;
  }

  // -------------------------------------------------------------- Enka bridge

  private async loadEnka(): Promise<{
    weaponEnToKo: Map<string, string>;
    suitEnToKo: Map<string, string>;
    avatarEnToKo: Map<string, { ko: string; icon: string | null }>;
  }> {
    const [locs, weapons, equipments, avatars] = await Promise.all([
      this.fetchJson(`${ENKA_BASE}/locs.json`),
      this.fetchJson(`${ENKA_BASE}/weapons.json`),
      this.fetchJson(`${ENKA_BASE}/equipments.json`),
      this.fetchJson(`${ENKA_BASE}/avatars.json`),
    ]);
    const en: Record<string, string> = locs?.en || {};
    const ko: Record<string, string> = locs?.ko || {};

    const weaponEnToKo = new Map<string, string>();
    const wItems = weapons?.Items || weapons || {};
    for (const id in wItems) {
      const k = wItems[id]?.ItemName;
      if (k && en[k] && ko[k]) weaponEnToKo.set(this.norm(en[k]), ko[k]);
    }
    const suitEnToKo = new Map<string, string>();
    const suits = equipments?.Suits || {};
    for (const id in suits) {
      const k = suits[id]?.Name;
      if (k && en[k] && ko[k]) suitEnToKo.set(this.norm(en[k]), ko[k]);
    }
    const avatarEnToKo = new Map<string, { ko: string; icon: string | null }>();
    for (const id in avatars || {}) {
      const k = avatars[id]?.Name;
      if (!k || !en[k]) continue;
      const m = (avatars[id]?.Image || '').match(/(IconRole\w+)\.png/);
      avatarEnToKo.set(this.norm(en[k]), { ko: ko[k], icon: m ? m[1] : null });
    }
    return { weaponEnToKo, suitEnToKo, avatarEnToKo };
  }

  private async fetchJson(url: string): Promise<any> {
    const res = await axiosGetWithRetry<any>(url, {
      timeout: 20000,
      headers: { 'User-Agent': UA },
    });
    return res.data;
  }

  // --------------------------------------------------------------- resolution

  /** 영문명 배열 → (Enka en→ko) → (DB ko→originalId). 중복 제거, 매핑 실패는 unmapped에 누적. */
  private mapNames(
    enNames: string[],
    enToKo: Map<string, string>,
    koToId: Map<string, string>,
    unmapped: Set<string>,
  ): string[] {
    const ids: string[] = [];
    for (const n of enNames) {
      const ko = enToKo.get(this.norm(n));
      const id = ko ? koToId.get(this.norm(ko)) : undefined;
      if (id) {
        if (!ids.includes(id)) ids.push(id);
      } else {
        unmapped.add(n);
      }
    }
    return ids;
  }

  /** genshin.gg 슬러그 → DB 캐릭터. en→ko 우선, IconRole 폴백, 섹션 제목 폴백. */
  private resolveChar(
    slug: string,
    html: string,
    enka: { avatarEnToKo: Map<string, { ko: string; icon: string | null }> },
    charByKo: Map<string, { name: string; originalId: string; metadata: any }>,
    charByOriginalId: Map<string, { name: string; originalId: string; metadata: any }>,
  ): { name: string; originalId: string; metadata: any } | null {
    const tryKey = (key: string) => {
      const e = enka.avatarEnToKo.get(key);
      if (!e) return null;
      const byKo = e.ko ? charByKo.get(this.norm(e.ko)) : undefined;
      if (byKo) return byKo;
      if (e.icon) {
        const byIcon = charByOriginalId.get(e.icon.toLowerCase());
        if (byIcon) return byIcon;
      }
      return null;
    };
    const slugNorm = this.norm(slug);
    const r = tryKey(slugNorm) || (CHAR_ALIAS[slugNorm] ? tryKey(CHAR_ALIAS[slugNorm]) : null);
    if (r) return r;
    // 폴백: "<표시명> Best <섹션>" 제목 표시명으로 재시도
    const m = html.match(/character-info-build-section-title">([^<]+?) Best /);
    if (m) {
      const byTitle = tryKey(this.norm(m[1]));
      if (byTitle) return byTitle;
    }
    return null;
  }

  // ------------------------------------------------------------------ parsing

  private async fetchValidSlugs(): Promise<string[]> {
    try {
      const res = await axiosGetWithRetry<string>(GG_LIST, {
        timeout: 15000,
        headers: { 'User-Agent': UA },
        responseType: 'text',
      });
      const html = typeof res.data === 'string' ? res.data : '';
      const set = new Set<string>();
      // 슬러그에 점(.)이 들어갈 수 있으므로 반드시 포함(star-rail 교훈).
      const re = /href="\/zzz\/characters\/([a-z0-9.-]+)\/?"/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html))) set.add(m[1]);
      return Array.from(set);
    } catch {
      return [];
    }
  }

  private async fetchGg(slug: string): Promise<string | null> {
    try {
      await this.delay(150);
      const res = await axiosGetWithRetry<string>(`${GG_BASE}/${slug}/`, {
        timeout: 15000,
        headers: { 'User-Agent': UA },
        responseType: 'text',
      });
      return typeof res.data === 'string' ? res.data : null;
    } catch {
      return null;
    }
  }

  /**
   * 빌드 섹션 파싱 → W-엔진/디스크 영문명 + 메인/서브 스탯 텍스트.
   * 섹션 제목으로 분류: "... Best W-Engines ..." / "... Best Disk Drives ..." / "... Best Main/Substats".
   */
  private parseBuild(html: string): {
    wEngines: string[];
    disks: string[];
    stats: { main: string[]; sub: string[] };
  } {
    const $ = cheerio.load(html);
    const wEngines: string[] = [];
    const disks: string[] = [];
    const stats = { main: [] as string[], sub: [] as string[] };

    $('.character-info-build-section').each((_, sec) => {
      const title = $(sec)
        .find('.character-info-build-section-title')
        .first()
        .text()
        .toLowerCase();
      const names: string[] = [];
      $(sec)
        .find('.character-info-weapon-name')
        .each((_i, el) => {
          const t = $(el).text().trim();
          if (t) names.push(t);
        });

      if (title.includes('w-engine') || title.includes('w-engines')) {
        wEngines.push(...names);
      } else if (title.includes('disk')) {
        disks.push(...names);
      } else if (title.includes('substat')) {
        stats.sub.push(...names);
      } else if (title.includes('main stat')) {
        stats.main.push(...names);
      }
    });
    return {
      wEngines: Array.from(new Set(wEngines)),
      disks: Array.from(new Set(disks)),
      stats,
    };
  }

  /**
   * "Best {Char} Team" 섹션 → TeamRecommendationView 형태.
   *   [{ name, slots:[{ main: charOriginalId, backups: [] }] }]
   * 멤버 img alt에 캐릭터명 + 속성/직업명이 섞여 오므로 캐릭터 매핑 성공한 것만 채택(나머지 자동 제외).
   */
  private parseTeams(
    html: string,
    enka: { avatarEnToKo: Map<string, { ko: string; icon: string | null }> },
    charByKo: Map<string, { name: string; originalId: string; metadata: any }>,
    charByOriginalId: Map<string, { name: string; originalId: string; metadata: any }>,
  ): any[] {
    const $ = cheerio.load(html);
    const teams: any[] = [];
    $('.character-teams .character-team').each((_, t) => {
      const name = $(t).find('.character-team-name').first().text().trim();
      const ids: string[] = [];
      $(t)
        .find('.character-team-characters [alt]')
        .each((_i, el) => {
          const alt = ($(el).attr('alt') || '').trim();
          if (!alt) return;
          const e = enka.avatarEnToKo.get(this.norm(alt));
          if (!e) return; // 속성/직업 아이콘 alt → 매핑 안 됨 → 제외
          const c =
            (e.ko ? charByKo.get(this.norm(e.ko)) : undefined) ||
            (e.icon ? charByOriginalId.get(e.icon.toLowerCase()) : undefined);
          if (c && !ids.includes(c.originalId)) ids.push(c.originalId);
        });
      if (ids.length > 0)
        teams.push({ name, slots: ids.map((id) => ({ main: id, backups: [] })) });
    });
    return teams;
  }

  /**
   * 이름 정규화(매핑 키). 한국어↔한국어, 영문↔영문 양쪽을 매칭하므로 ASCII만 남기면 안 된다
   * (한글이 통째로 지워져 전부 빈 문자열로 충돌). 유니코드 글자/숫자만 남기고 공백·기호·가운뎃점(·)
   * ·하이픈 등을 제거한다.
   */
  private norm(name: string): string {
    return (name || '')
      .normalize('NFC')
      .toLowerCase()
      .replace(/<[^>]+>/g, '')
      .replace(/[^\p{L}\p{N}]/gu, '');
  }
}
