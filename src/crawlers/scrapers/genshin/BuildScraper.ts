import * as cheerio from 'cheerio';
import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { axiosGetWithRetry } from '../../utils/httpRetry';
import logger from '../../../utils/logger';
import { prisma } from '../../../utils/prisma';

/**
 * 원신 추천 빌드 스크래퍼 — genshin.gg(커뮤니티 큐레이션) 소스.
 *
 * 캐릭터별 "추천 무기"를 가져와 character.metadata.recommendedWeapons(originalId 배열)로 병합한다.
 * 프론트 MainItemView가 ID 배열을 받아 무기 카드를 렌더하므로(이미 genshin 지원 추가됨),
 * starrail의 광추 추천과 동일한 틀로 노출된다.
 *
 * 이름 매핑: genshin.gg는 영문명("Staff of Homa")이고 우리 DB 무기는 한글이므로,
 *   Ambr 영문 엔드포인트(/api/v2/en/weapon)의 {영문명 → id}로 originalId를 찾는다.
 * genshin.gg 슬러그: Ambr 영문 avatar route(예 "Kamisato Ayaka")를 소문자-하이픈으로 변환.
 *
 * 주의) syncCharacters는 metadata를 통째로 덮어쓰므로, 기존 metadata를 읽어 병합한 전체를 반환한다
 *   (skills/ascension 등 보존). 추천 무기/성유물은 패치마다 변하는 큐레이션이라 "참고용"이다.
 *   성유물·파티 추천은 후속(성유물은 DB 미보유, 파티는 genshin.gg 캐릭터 페이지에 없음).
 */
const AMBR_BASE = 'https://gi.yatta.moe';
const GG_BASE = 'https://genshin.gg/characters';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export class GenshinBuildScraper extends ScraperBase {
  constructor() {
    super('genshin');
  }

  async scrape(limit?: number): Promise<ScrapedData[]> {
    logger.info('Starting Genshin Build scraping (genshin.gg)...');
    const game = await prisma.game.findUnique({ where: { slug: 'genshin' } });
    if (!game) throw new Error('Genshin game record not found in database!');

    // 1. Ambr 영문 무기명 → originalId 맵
    const wRes = await axiosGetWithRetry<any>(`${AMBR_BASE}/api/v2/en/weapon`, {
      timeout: 20000,
      headers: { 'User-Agent': UA },
    });
    const wItems = wRes.data?.data?.items || {};
    const weaponNameToId = new Map<string, string>();
    for (const w of Object.values<any>(wItems)) {
      if (w?.name) weaponNameToId.set(this.norm(w.name), String(w.id));
    }
    logger.info(`Loaded ${weaponNameToId.size} EN weapon names from Ambr.`);

    // 2. Ambr 영문 avatar: originalId → route(영문명, genshin.gg 슬러그용)
    const aRes = await axiosGetWithRetry<any>(`${AMBR_BASE}/api/v2/en/avatar`, {
      timeout: 20000,
      headers: { 'User-Agent': UA },
    });
    const aItems = aRes.data?.data?.items || {};
    const idToRoute = new Map<string, string>();
    for (const a of Object.values<any>(aItems)) {
      if (a?.id && a?.route) idToRoute.set(String(a.id), String(a.route));
    }

    // 3. DB의 genshin 캐릭터 순회
    let characters = await prisma.character.findMany({
      where: { gameId: game.id },
      select: { id: true, name: true, originalId: true, metadata: true },
    });
    if (limit) characters = characters.slice(0, limit);

    const results: ScrapedData[] = [];
    let processed = 0;
    let matched = 0;
    let ggErrors = 0;
    for (const ch of characters) {
      processed++;
      const originalId = String(
        ch.originalId ?? (ch.metadata as any)?.originalId ?? '',
      );
      const route = idToRoute.get(originalId);
      if (!originalId || !route) continue;

      const slug = this.toSlug(route);
      try {
        const html = await this.fetchGg(slug);
        if (!html) {
          ggErrors++;
          continue;
        }
        const weaponNames = this.parseBestWeapons(html);
        const ids = weaponNames
          .map((n) => weaponNameToId.get(this.norm(n)))
          .filter((x): x is string => !!x);

        if (ids.length === 0) continue;
        matched++;

        const existingMeta =
          ch.metadata && typeof ch.metadata === 'object'
            ? (ch.metadata as Record<string, any>)
            : {};
        const metadata = {
          ...existingMeta,
          originalId,
          recommendedWeapons: ids,
          recommendedSource: 'genshin.gg',
        };

        results.push({
          name: ch.name,
          sourceUrl: `${GG_BASE}/${slug}/`,
          metadata,
        });
        logger.info(
          `[GI-Build] ${processed}/${characters.length} ${ch.name}: ${ids.length} weapons`,
        );
      } catch (e) {
        ggErrors++;
        logger.warn(`Build scrape failed for ${ch.name} (${slug})`);
      }
    }

    if (results.length === 0) {
      throw new Error(
        `Genshin build scrape produced 0 results (genshin.gg 구조 변경/슬러그 불일치 의심, ggErrors=${ggErrors})`,
      );
    }
    logger.info(
      `Genshin build: ${matched} matched / ${ggErrors} errors / ${characters.length} total`,
    );
    return results;
  }

  private async fetchGg(slug: string): Promise<string | null> {
    try {
      await this.delay(150);
      const res = await axiosGetWithRetry<string>(`${GG_BASE}/${slug}/`, {
        timeout: 15000,
        headers: { 'User-Agent': UA },
        responseType: 'text',
        // 404 등은 재시도 없이 즉시 실패 처리(axiosGetWithRetry가 4xx는 fail-fast)
      });
      return typeof res.data === 'string' ? res.data : null;
    } catch {
      return null;
    }
  }

  /** "Best Weapons" 섹션의 무기명을 순위 순서대로 추출. */
  private parseBestWeapons(html: string): string[] {
    const $ = cheerio.load(html);
    let names: string[] = [];
    $('.character-build-section').each((_, sec) => {
      const title = $(sec).find('.character-build-section-title').text();
      if (/Best Weapons/i.test(title)) {
        $(sec)
          .find('.character-build-weapon-name')
          .each((_i, el) => {
            const t = $(el).text().trim();
            if (t) names.push(t);
          });
      }
    });
    // 중복 제거(순서 유지)
    return Array.from(new Set(names));
  }

  /** Ambr route("Kamisato Ayaka") → genshin.gg 슬러그("kamisato-ayaka"). */
  private toSlug(route: string): string {
    return route
      .toLowerCase()
      .replace(/['"]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /** 이름 정규화(매핑 키): 소문자 + 영숫자만. "Primordial Jade Winged-Spear" 류 일치 향상. */
  private norm(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
}
