import * as cheerio from 'cheerio';
import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { axiosGetWithRetry } from '../../utils/httpRetry';
import logger from '../../../utils/logger';
import { prisma } from '../../../utils/prisma';
import { fetchPageConfig, SRS_BASE } from '../../utils/srsPageConfig';
import { crawlProgress } from '../../crawlProgress';

/**
 * 스타레일 추천 빌드 스크래퍼 — genshin.gg/star-rail(커뮤니티 큐레이션) 소스.
 *
 * 원신 GenshinBuildScraper와 동일한 도메인·HTML 구조를 사용한다(genshin.gg). 캐릭터별
 * "추천 광추 / 추천 유물세트 / 추천 차원유물(장신구)"를 가져와 character.metadata에 병합한다.
 *   - metadata.lightcones : 광추 item originalId 배열  → 프론트 MainItemView(광추 카드)
 *   - metadata.relics     : { Set4IDList, Set2IDList } → 프론트 BuildRecommendationView(유물 세트)
 *   - metadata.teams      : 파티(소스에 구조화된 팀 데이터 없음 → 기존값 보존, 보통 빈 배열)
 *   - metadata.recommendedSource : 'genshin.gg'
 *
 * 이름 매핑(우리 DB는 한국어):
 *   - 광추  : SRS /en/equipment(영문 광추명 → pageId=originalId)로 영문명→id
 *   - 유물  : SRS /en/relics(영문 세트명 → pageId=originalId)로 영문명→id
 *   - 캐릭터: SRS /en/characters(영문명 → rankKey=originalId). genshin.gg 슬러그(하이픈 제거)를
 *            정규화해 매칭, 실패 시 빌드 섹션 제목("X Best ...")의 표시명으로 폴백.
 *
 * 주의) syncCharacters는 metadata를 통째로 덮어쓰므로, 기존 metadata(skills/stats/eidolons 등)를
 *   읽어 병합한 전체를 반환한다(GenshinBuildScraper와 동일 원칙). 추천 데이터는 패치마다 변하는
 *   큐레이션이라 "참고용"이다.
 */
const GG_LIST = 'https://genshin.gg/star-rail/';
const GG_BASE = 'https://genshin.gg/star-rail/characters';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// genshin.gg 슬러그(하이픈 제거) → SRS 영문명 정규화 보정(철자/기호 차이).
const CHAR_ALIAS: Record<string, string> = {
  boothiill: 'boothill', // genshin.gg 슬러그 오타(i 중복)
  topazandnumby: 'topaznumby', // "Topaz and Numby" vs SRS "Topaz & Numby"
};

export class StarRailBuildScraper extends ScraperBase {
  constructor() {
    super('starrail');
  }

  async scrape(limit?: number): Promise<ScrapedData[]> {
    logger.info('Starting Star Rail Build scraping (genshin.gg/star-rail)...');
    const game = await prisma.game.findUnique({ where: { slug: 'starrail' } });
    if (!game) throw new Error('Star Rail game record not found in database!');

    // 1. SRS 영문 매핑 테이블 — 광추/유물/캐릭터 (영문명 정규화 → originalId)
    const lightConeNameToId = await this.buildNameToId(
      `${SRS_BASE}/en/equipment`,
      (e) => e.pageId,
    );
    const relicNameToId = await this.buildNameToId(
      `${SRS_BASE}/en/relics`,
      (e) => e.pageId,
    );
    const charNameToId = await this.buildNameToId(
      `${SRS_BASE}/en/characters`,
      (e) => e.rankKey,
    );
    logger.info(
      `Loaded EN maps — lightcones:${lightConeNameToId.size} relics:${relicNameToId.size} chars:${charNameToId.size}`,
    );

    // 2. DB 캐릭터(originalId → {name, metadata}) — 병합용 기존 metadata 보존
    const dbChars = await prisma.character.findMany({
      where: { gameId: game.id },
      select: { name: true, originalId: true, metadata: true },
    });
    const dbCharMap = new Map<string, { name: string; metadata: any }>();
    for (const c of dbChars) {
      if (c.originalId)
        dbCharMap.set(String(c.originalId), {
          name: c.name,
          metadata:
            c.metadata && typeof c.metadata === 'object'
              ? (c.metadata as Record<string, any>)
              : {},
        });
    }

    // 3. genshin.gg/star-rail 캐릭터 슬러그 목록
    let slugs = await this.fetchValidSlugs();
    if (slugs.length === 0)
      throw new Error('genshin.gg/star-rail 슬러그 0건(목록 구조 변경 의심)');
    if (limit) slugs = slugs.slice(0, limit);
    logger.info(`Found ${slugs.length} genshin.gg/star-rail character slugs.`);

    const results: ScrapedData[] = [];
    let processed = 0;
    let matched = 0;
    let ggErrors = 0;
    const unmappedLC = new Set<string>();
    const unmappedRelic = new Set<string>();
    const unmappedChars: string[] = [];

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

        // 캐릭터 → originalId 매핑(슬러그 우선, 제목 표시명 폴백)
        const originalId = this.resolveCharId(slug, html, charNameToId);
        if (!originalId || !dbCharMap.has(originalId)) {
          unmappedChars.push(slug);
          continue;
        }
        const dbChar = dbCharMap.get(originalId)!;

        const parsed = this.parseBuild(html);

        // 광추 영문명 → originalId(숫자)
        const lightcones = parsed.lightcones
          .map((n) => {
            const id = lightConeNameToId.get(this.norm(n));
            if (!id) unmappedLC.add(n);
            return id;
          })
          .filter((x): x is string => !!x)
          .map((x) => Number(x));

        // 유물세트(4pc) / 차원유물(2pc) 영문명 → originalId(숫자)
        const set4 = parsed.relics
          .map((n) => {
            const id = relicNameToId.get(this.norm(n));
            if (!id) unmappedRelic.add(n);
            return id;
          })
          .filter((x): x is string => !!x)
          .map((x) => Number(x));
        const set2 = parsed.ornaments
          .map((n) => {
            const id = relicNameToId.get(this.norm(n));
            if (!id) unmappedRelic.add(n);
            return id;
          })
          .filter((x): x is string => !!x)
          .map((x) => Number(x));

        const dedupe = (arr: number[]) => Array.from(new Set(arr));
        const lcIds = dedupe(lightcones);
        const set4Ids = dedupe(set4);
        const set2Ids = dedupe(set2);

        if (lcIds.length === 0 && set4Ids.length === 0 && set2Ids.length === 0)
          continue;
        matched++;

        const existingMeta = dbChar.metadata;
        // 유물은 BuildRecommendationView의 HSR 경로({Set4IDList,Set2IDList})로 가공 →
        //   기존 relic 세트 아이템(2pc/4pc 효과 툴팁)을 그대로 재사용한다.
        const relics =
          set4Ids.length > 0 || set2Ids.length > 0
            ? { Set4IDList: set4Ids, Set2IDList: set2Ids }
            : existingMeta.relics || {};

        const metadata = {
          ...existingMeta,
          originalId, // syncCharacters 매칭 키 보존
          lightcones: lcIds.length > 0 ? lcIds : existingMeta.lightcones || [],
          relics,
          teams: existingMeta.teams || [],
          recommendedSource: 'genshin.gg',
        };

        results.push({
          name: dbChar.name,
          sourceUrl: `${GG_BASE}/${slug}/`,
          metadata,
        });
        logger.info(
          `[SR-Build] ${processed}/${slugs.length} ${dbChar.name} (${originalId}): ${lcIds.length} lightcones, ${set4Ids.length}+${set2Ids.length} relic/ornament sets`,
        );
      } catch (e) {
        ggErrors++;
        logger.warn(`Build scrape failed for slug ${slug}`);
      }
    }

    if (unmappedChars.length)
      logger.warn(
        `[SR-Build] 캐릭터 매핑 실패 ${unmappedChars.length}: ${unmappedChars.join(', ')}`,
      );
    if (unmappedLC.size)
      logger.warn(
        `[SR-Build] 광추 매핑 실패 ${unmappedLC.size}: ${[...unmappedLC].join(', ')}`,
      );
    if (unmappedRelic.size)
      logger.warn(
        `[SR-Build] 유물 매핑 실패 ${unmappedRelic.size}: ${[...unmappedRelic].join(', ')}`,
      );

    if (results.length === 0) {
      throw new Error(
        `Star Rail build scrape produced 0 results (genshin.gg 구조 변경/슬러그 불일치 의심, ggErrors=${ggErrors})`,
      );
    }
    logger.info(
      `Star Rail build: ${matched} matched / ${ggErrors} errors / ${slugs.length} total`,
    );
    return results;
  }

  /**
   * SRS 영문 PAGE_CONFIG의 entries에서 {정규화 영문명 → String(idSelector)} 맵을 만든다.
   * idSelector 예: 광추/유물=pageId, 캐릭터=rankKey.
   */
  private async buildNameToId(
    url: string,
    idSelector: (e: any) => any,
  ): Promise<Map<string, string>> {
    const config = await fetchPageConfig(url);
    const entries: any[] = Array.isArray(config.entries) ? config.entries : [];
    const map = new Map<string, string>();
    for (const e of entries) {
      const id = idSelector(e);
      if (e?.name && id != null) map.set(this.norm(e.name), String(id));
    }
    return map;
  }

  /** genshin.gg/star-rail 목록 페이지에서 유효 캐릭터 슬러그 수집. */
  private async fetchValidSlugs(): Promise<string[]> {
    try {
      const res = await axiosGetWithRetry<string>(GG_LIST, {
        timeout: 15000,
        headers: { 'User-Agent': UA },
        responseType: 'text',
      });
      const html = typeof res.data === 'string' ? res.data : '';
      const set = new Set<string>();
      // 슬러그에 점(.)이 들어가는 경우가 있다(예: silverwolflv.999 = 은랑 LV.999 전용 빌드 페이지).
      // 점을 빼면 잘려서 폴백 페이지로 가버리므로 반드시 포함.
      const re = /href="\/star-rail\/characters\/([a-z0-9.-]+)\/?"/g;
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
   * 캐릭터 슬러그 → originalId. 슬러그(하이픈 제거) 정규화 매칭 우선,
   * 별칭 보정, 실패 시 빌드 섹션 제목("X Best ...")의 표시명으로 폴백.
   */
  private resolveCharId(
    slug: string,
    html: string,
    charNameToId: Map<string, string>,
  ): string | null {
    // 점·하이픈 등 비영숫자를 모두 제거해 SRS 맵 키(norm(name))와 정렬.
    // (silverwolflv.999 → silverwolflv999 = SRS "Silver Wolf LV.999" rankKey 1506)
    const slugNorm = this.norm(slug);
    const aliasKey = CHAR_ALIAS[slugNorm];
    const bySlug =
      charNameToId.get(slugNorm) ||
      (aliasKey ? charNameToId.get(aliasKey) : undefined);
    if (bySlug) return bySlug;

    // 폴백: "<표시명> Best <섹션>" 제목에서 표시명 추출 후 매칭
    const m = html.match(/character-info-build-section-title">([^<]+?) Best /);
    if (m) {
      const byTitle = charNameToId.get(this.norm(m[1]));
      if (byTitle) return byTitle;
    }
    return null;
  }

  /**
   * 빌드 섹션 파싱 → 광추/유물(4pc)/차원유물(2pc) 영문명.
   * 섹션 제목으로 분류: "... Best Light Cone(s)" / "... Best Relics" / "... Best Ornaments".
   */
  private parseBuild(html: string): {
    lightcones: string[];
    relics: string[];
    ornaments: string[];
  } {
    const $ = cheerio.load(html);
    const lightcones: string[] = [];
    const relics: string[] = [];
    const ornaments: string[] = [];

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
      if (names.length === 0) return;

      if (title.includes('light cone') || title.includes('lightcone')) {
        lightcones.push(...names);
      } else if (title.includes('ornament')) {
        ornaments.push(...names);
      } else if (title.includes('relic')) {
        relics.push(...names);
      }
    });

    return { lightcones, relics, ornaments };
  }

  /** 이름 정규화(매핑 키): 소문자 + 영숫자만. HTML 태그(<nobr> 등)·기호 차이 흡수. */
  private norm(name: string): string {
    return name
      .toLowerCase()
      .replace(/<[^>]+>/g, '')
      .replace(/[^a-z0-9]/g, '');
  }
}
