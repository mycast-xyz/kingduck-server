import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { ImageDownloader } from '../../utils/ImageDownloader';
import { axiosGetWithRetry } from '../../utils/httpRetry';
import logger from '../../../utils/logger';
import { prisma } from '../../../utils/prisma';
import { crawlProgress } from '../../crawlProgress';

/**
 * 원신 무기 스크래퍼 — Ambr(gi.yatta.moe) 소스. character.ts와 동일 패턴.
 *
 *   - 목록:  https://gi.yatta.moe/api/v2/kr/weapon          → data.items { id: {...} }
 *   - 상세:  https://gi.yatta.moe/api/v2/kr/weapon/{id}      → affix/upgrade/description 등
 *   - 이미지: https://gi.yatta.moe/assets/UI/{icon}.png       (icon: UI_EquipIcon_*)
 *
 * DataSyncService.syncItems 계약(gameId, type, originalId 매칭)에 맞춰
 * metadata.originalId / metadata.type='weapon' / name / rarity / imageUrl / metadata 보장.
 *
 * 무기타입(weaponType)은 character.ts와 동일하게 영문 키로 저장하고,
 * 프론트 필터 호환을 위해 path 슬롯에도 동일 키를 채운다.
 */

// Ambr weaponType → 프론트/Path 필터용 깔끔한 영문 키 (character.ts와 동일)
const WEAPON_TYPE_MAP: Record<string, string> = {
  WEAPON_SWORD_ONE_HAND: 'Sword',
  WEAPON_CLAYMORE: 'Claymore',
  WEAPON_POLE: 'Polearm',
  WEAPON_BOW: 'Bow',
  WEAPON_CATALYST: 'Catalyst',
};

const AMBR_BASE = 'https://gi.yatta.moe';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export class GenshinWeaponScraper extends ScraperBase {
  private readonly LIST_URL = `${AMBR_BASE}/api/v2/kr/weapon`;
  private readonly DETAIL_BASE = `${AMBR_BASE}/api/v2/kr/weapon`;

  constructor() {
    super('genshin');
  }

  async scrape(limit?: number): Promise<ScrapedData[]> {
    logger.info('Starting Genshin Weapon scraping (Ambr/gi.yatta.moe)...');
    const results: ScrapedData[] = [];

    const game = await prisma.game.findUnique({ where: { slug: 'genshin' } });
    if (!game) {
      throw new Error('Genshin game record not found in database!');
    }

    // 1. 목록
    const listRes = await axiosGetWithRetry<any>(this.LIST_URL, {
      timeout: 20000,
      headers: { 'User-Agent': UA },
    });
    const items = listRes.data?.data?.items;
    if (!items || typeof items !== 'object') {
      throw new Error('Weapon list empty/malformed (Ambr 구조 변경 의심)');
    }
    let entries = Object.values<any>(items);
    if (entries.length === 0) {
      throw new Error('Weapon list has 0 entries (Ambr 구조 변경 의심)');
    }
    if (limit) entries = entries.slice(0, limit);
    logger.info(`Found ${entries.length} weapons from Ambr.`);

    let processed = 0;
    let detailErrors = 0;
    for (const entry of entries) {
      processed++;
      if (crawlProgress.shouldStop()) break; // 사용자 중단 요청
      crawlProgress.report(processed, entries.length, entry.name);
      const originalId = String(entry.id ?? '');
      if (!originalId) {
        logger.warn(`Weapon entry missing id: ${entry.name}`);
        continue;
      }
      logger.info(
        `[GI-Weapon] ${processed}/${entries.length} ${entry.name} (${originalId}) - ${((processed / entries.length) * 100).toFixed(1)}%`,
      );

      try {
        // 상세 — 설명/스탯 raw 확보(부분 실패 허용)
        const detailUrl = `${this.DETAIL_BASE}/${originalId}`;
        const detailRes = await axiosGetWithRetry<any>(detailUrl, {
          timeout: 20000,
          headers: { 'User-Agent': UA },
        });
        const d = detailRes.data?.data ?? {};

        const name = d.name || entry.name || `Weapon_${originalId}`;
        const rarity = Number(d.rank ?? entry.rank ?? 1);
        const weaponKey =
          WEAPON_TYPE_MAP[d.type || entry.type] ||
          String(d.type || entry.type || '');
        const specialProp = String(d.specialProp ?? entry.specialProp ?? '');
        const icon = String(d.icon || entry.icon || '');
        const description = String(d.description ?? '');

        // 이미지: 아이콘(weapon_{id}). 카드 슬롯도 동일 아이콘으로 채워둠.
        const localImageUrl = await this.dlIcon(icon, `weapon_${originalId}`);

        const metadata: Record<string, any> = {
          originalId,
          type: 'weapon',
          rarity,
          weaponType: weaponKey,
          path: weaponKey,
          specialProp,
          cardImageUrl: localImageUrl,
          description,
          affix: d.affix ?? null,
          stats: d.upgrade ?? null,
          ascension: d.ascension ?? null,
        };

        results.push({
          name,
          sourceUrl: detailUrl,
          imageUrl: localImageUrl,
          rarity,
          weaponType: weaponKey,
          description,
          metadata,
        });
      } catch (innerErr) {
        detailErrors++;
        logger.error(`Failed to process weapon ${originalId}:`, innerErr);
      }
    }

    if (results.length === 0 && detailErrors > 0) {
      throw new Error(
        `All ${detailErrors} weapon detail fetches failed (Ambr 장애/구조 변경 의심)`,
      );
    }
    if (detailErrors > 0) {
      logger.warn(
        `Genshin weapon scrape partial: ${results.length} ok / ${detailErrors} failed`,
      );
    }
    return results;
  }

  private async dlIcon(
    icon: string | undefined | null,
    fileName: string,
    category = 'item',
  ): Promise<string | null> {
    if (!icon) return null;
    const url = `${AMBR_BASE}/assets/UI/${icon}.png`;
    return ImageDownloader.downloadAndSave(url, 'genshin', category, fileName);
  }
}
