import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { ImageDownloader } from '../../utils/ImageDownloader';
import logger from '../../../utils/logger';
import {
  fetchPageConfig,
  srsAssetUrl,
  SRS_BASE,
  mapPathToEn,
} from '../../utils/srsPageConfig';
import { crawlProgress } from '../../crawlProgress';

/**
 * 광추(LightCone) 스크래퍼 — starrailstation.com 소스.
 *
 * 기존 hakush(api.hakush.in) 소스가 소실되어 SRS PAGE_CONFIG로 교체.
 * 출력 metadata 형태는 hakush 시절과 동일하게 유지한다(프론트 계약 보존):
 *   { originalId, cardImageUrl, type:'LightCone', rarity, path, refinements, stats }
 *
 * - 목록: https://starrailstation.com/kr/equipment  (entries, pageId=인게임 ID=originalId)
 * - 상세: https://starrailstation.com/kr/lightcone/{pageId}
 */
export class LightConeScraper extends ScraperBase {
  private readonly LIST_URL = `${SRS_BASE}/kr/equipment`;
  private readonly DETAIL_BASE = `${SRS_BASE}/kr/lightcone`;

  constructor() {
    super('starrail');
  }

  async scrape(limit?: number): Promise<ScrapedData[]> {
    logger.info('Starting Star Rail LightCone scraping (StarRailStation)...');
    const results: ScrapedData[] = [];

    // 1. 목록 PAGE_CONFIG (실패 시 throw → 상위에서 FAILED 기록)
    const listConfig = await fetchPageConfig(this.LIST_URL);
    let entries: any[] = Array.isArray(listConfig.entries)
      ? listConfig.entries
      : [];
    if (entries.length === 0) {
      throw new Error('LightCone list has 0 entries (SRS 구조 변경 의심)');
    }
    if (limit) entries = entries.slice(0, limit);
    logger.info(`Found ${entries.length} lightcones from StarRailStation.`);

    let processed = 0;
    let detailErrors = 0;
    for (const entry of entries) {
      if (crawlProgress.shouldStop()) break; // 사용자 중단 요청
      crawlProgress.report(processed, entries.length, entry.name);
      processed++;
      const pageId = entry.pageId;
      if (!pageId) {
        logger.warn(`LightCone entry missing pageId: ${entry.name}`);
        continue;
      }
      logger.info(
        `[SR-LC] ${processed}/${entries.length} (${pageId}) - ${((processed / entries.length) * 100).toFixed(1)}%`,
      );

      try {
        // 2. 상세 PAGE_CONFIG
        const detailUrl = `${this.DETAIL_BASE}/${pageId}`;
        const detail = await fetchPageConfig(detailUrl);

        const name = detail.name || entry.name || `LC_${pageId}`;
        const rarity = detail.rarity ?? entry.rarity ?? 3;
        // 광추 path도 프론트 item 필터가 영문 키로 매칭 → 한국어(공허) → 영문(Warlock)
        const path = mapPathToEn(
          detail.baseType?.name || entry.baseType?.name,
        );

        // 3. 이미지 — 아이콘 + 대형 카드(art)
        const localIconUrl = await this.downloadAsset(
          detail.iconPath || detail.mediumIconPath,
          `icon_${pageId}`,
        );
        const localCardUrl = await this.downloadAsset(
          detail.artPath || detail.iconPath,
          `card_${pageId}`,
        );

        results.push({
          name,
          sourceUrl: detailUrl,
          imageUrl: localIconUrl,
          rarity,
          metadata: {
            originalId: String(pageId),
            cardImageUrl: localCardUrl,
            type: 'LightCone',
            rarity,
            path,
            description: detail.descHash,
            refinements: this.processRefinements(detail.skill),
            stats: this.processStats(detail.levelData),
          },
        });
      } catch (innerErr) {
        detailErrors++;
        logger.error(`Failed to process LightCone ${pageId}:`, innerErr);
      }
    }

    // 전부 실패하면 silent 0건이 아니라 명시적 실패(B-H6)
    if (results.length === 0 && detailErrors > 0) {
      throw new Error(
        `All ${detailErrors} lightcone detail fetches failed (SRS 장애/구조 변경 의심)`,
      );
    }
    if (detailErrors > 0) {
      logger.warn(
        `LightCone scrape partial: ${results.length} ok / ${detailErrors} failed`,
      );
    }
    return results;
  }

  /** SRS CDN 자산 다운로드 → 로컬 webp 상대경로(없으면 null) */
  private async downloadAsset(
    iconPath: string | undefined | null,
    fileName: string,
  ): Promise<string | null> {
    const url = srsAssetUrl(iconPath);
    if (!url) return null;
    return ImageDownloader.downloadAndSave(
      url,
      'starrail',
      'lightcone',
      fileName,
    );
  }

  /**
   * 중첩(superimpose) 스킬 → hakush 시절 `refinements` 형태로 변환.
   * { name, desc, levels: { '1': number[], ... } }
   */
  private processRefinements(skill: any): any {
    if (!skill) return null;
    const levels: Record<string, number[]> = {};
    if (Array.isArray(skill.levelData)) {
      for (const lv of skill.levelData) {
        const key = String(lv.level ?? Object.keys(levels).length + 1);
        levels[key] = Array.isArray(lv.params) ? lv.params : [];
      }
    }
    return {
      name: skill.name,
      desc: skill.descHash,
      levels,
    };
  }

  /**
   * 승급(promotion)별 스탯 → hakush 시절 `stats` 형태로 변환.
   * { growth: { hp, atk, def }, promotions: [{ promotion, maxLevel, hp, atk, def }] }
   */
  private processStats(levelData: any[]): any {
    if (!Array.isArray(levelData) || levelData.length === 0) return null;

    const base = levelData[0];
    const growth = {
      hp: base.hpAdd,
      atk: base.attackAdd,
      def: base.defenseAdd,
    };

    const promotions = levelData.map((d) => ({
      promotion: d.promotion || 0,
      maxLevel: d.maxLevel,
      hp: d.hpBase,
      atk: d.attackBase,
      def: d.defenseBase,
    }));

    return { growth, promotions };
  }
}
