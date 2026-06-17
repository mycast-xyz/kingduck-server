import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { ImageDownloader } from '../../utils/ImageDownloader';
import { axiosGetWithRetry } from '../../utils/httpRetry';
import logger from '../../../utils/logger';
import { prisma } from '../../../utils/prisma';

/**
 * 원신 재료(아이템) 스크래퍼 — Ambr(gi.yatta.moe) 소스.
 *
 *   - 목록:  https://gi.yatta.moe/api/v2/kr/material        → data.items { id: {...} }  (~764개)
 *   - 이미지: https://gi.yatta.moe/assets/UI/{icon}.png      (icon: UI_ItemIcon_*)
 *
 * 상세 호출은 하지 않는다(764개 — 성능). 목록 엔트리 필드만 사용.
 *
 * metadata 계약(syncItems 매칭 (gameId, type, originalId)과 호환):
 *   - originalId : Ambr material id(문자열) — syncItems 매칭 키
 *   - type       : 'material' — 모든 재료를 일관되게 통일(매칭 안정성). Item.type 컬럼으로 들어감.
 *   - subType    : Ambr 세부 분류(systemAccess/avatar/weapon 등) 보존
 *   - rarity     : rank(없으면 1)
 *   - recipe     : 가공 레시피(없으면 null)
 *   - cardImageUrl: 다운로드한 로컬 이미지 URL
 */

const AMBR_BASE = 'https://gi.yatta.moe';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export class GenshinMaterialScraper extends ScraperBase {
  private readonly LIST_URL = `${AMBR_BASE}/api/v2/kr/material`;

  constructor() {
    super('genshin');
  }

  async scrape(limit?: number): Promise<ScrapedData[]> {
    logger.info('Starting Genshin Material scraping (Ambr/gi.yatta.moe)...');
    const results: ScrapedData[] = [];

    const game = await prisma.game.findUnique({ where: { slug: 'genshin' } });
    if (!game) {
      throw new Error('Genshin game record not found in database!');
    }

    // 1. 목록 (상세 호출 없음)
    const listRes = await axiosGetWithRetry<any>(this.LIST_URL, {
      timeout: 20000,
      headers: { 'User-Agent': UA },
    });
    const items = listRes.data?.data?.items;
    if (!items || typeof items !== 'object') {
      throw new Error('Material list empty/malformed (Ambr 구조 변경 의심)');
    }
    let entries = Object.values<any>(items);
    if (entries.length === 0) {
      throw new Error('Material list has 0 entries (Ambr 구조 변경 의심)');
    }
    if (limit) entries = entries.slice(0, limit);
    logger.info(`Found ${entries.length} materials from Ambr.`);

    let processed = 0;
    let errors = 0;
    for (const entry of entries) {
      processed++;
      const originalId = String(entry.id ?? '');
      if (!originalId) {
        logger.warn(`Material entry missing id: ${entry.name}`);
        continue;
      }

      // 진행률 로그는 스팸을 줄이기 위해 25개마다 한 번만.
      if (processed % 25 === 0) {
        logger.info(
          `[GI-Material] ${processed}/${entries.length} - ${((processed / entries.length) * 100).toFixed(1)}%`,
        );
      }

      try {
        const name = entry.name || `Material_${originalId}`;
        const rarity = Number(entry.rank ?? 1);
        const icon = String(entry.icon || '');

        // 이미지(일부 아이콘은 404 → null 허용)
        const localImageUrl = await this.dlIcon(icon, `material_${originalId}`);

        const metadata: Record<string, any> = {
          originalId,
          type: 'material',
          subType: entry.type,
          rarity,
          recipe: entry.recipe ?? null,
          cardImageUrl: localImageUrl,
        };

        results.push({
          name,
          sourceUrl: this.LIST_URL,
          imageUrl: localImageUrl,
          rarity,
          description: '',
          metadata,
        });
      } catch (innerErr) {
        errors++;
        logger.error(`Failed to process material ${originalId}:`, innerErr);
      }
    }

    if (results.length === 0 && errors > 0) {
      throw new Error(
        `All ${errors} material entries failed (Ambr 장애/구조 변경 의심)`,
      );
    }
    if (errors > 0) {
      logger.warn(
        `Genshin material scrape partial: ${results.length} ok / ${errors} failed`,
      );
    }
    return results;
  }

  private async dlIcon(
    icon: string | undefined | null,
    fileName: string,
  ): Promise<string | null> {
    if (!icon) return null;
    const url = `${AMBR_BASE}/assets/UI/${icon}.png`;
    return ImageDownloader.downloadAndSave(url, 'genshin', 'item', fileName);
  }
}
