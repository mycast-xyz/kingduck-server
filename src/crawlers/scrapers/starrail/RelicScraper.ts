import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { ImageDownloader } from '../../utils/ImageDownloader';
import logger from '../../../utils/logger';
import { prisma } from '../../../utils/prisma';
import { fetchPageConfig, srsAssetUrl, SRS_BASE } from '../../utils/srsPageConfig';
import { crawlProgress } from '../../crawlProgress';

/**
 * 유물(RelicSet) 스크래퍼 — starrailstation.com 단독 소스.
 *
 * 기존엔 hakush(구조) + SRS(이미지) 병용이었으나 hakush 소실로 **SRS 단독**으로 전환.
 * SRS /kr/relics가 세트 이름·세트보너스(2pc/4pc)·파츠·이미지를 모두 제공한다.
 *
 * 출력 metadata 형태는 기존과 동일(프론트 BuildRecommendationView 호환):
 *   { originalId, type:'RelicSet', '2pc':{desc,params}, '4pc':{desc,params}, parts, srsIconPath }
 *
 * - 목록: https://starrailstation.com/kr/relics   (entries: pageId=세트ID=originalId)
 * - 상세: https://starrailstation.com/kr/relics/{pageId}  (pieces lore 보강)
 */
export class RelicScraper extends ScraperBase {
  private readonly LIST_URL = `${SRS_BASE}/kr/relics`;
  private readonly DETAIL_BASE = `${SRS_BASE}/kr/relics`;

  constructor() {
    super('starrail');
  }

  async scrape(limit?: number): Promise<ScrapedData[]> {
    logger.info('Starting Star Rail Relic scraping (StarRailStation)...');
    const results: ScrapedData[] = [];

    const game = await prisma.game.findUnique({ where: { slug: 'starrail' } });
    if (!game) {
      throw new Error('Star Rail game record not found in database!');
    }

    // 1. 목록
    const listConfig = await fetchPageConfig(this.LIST_URL);
    let entries: any[] = Array.isArray(listConfig.entries)
      ? listConfig.entries
      : [];
    if (entries.length === 0) {
      throw new Error('Relic list has 0 entries (SRS 구조 변경 의심)');
    }
    if (limit) entries = entries.slice(0, limit);
    logger.info(`Found ${entries.length} relic sets from StarRailStation.`);

    let processed = 0;
    let errors = 0;
    for (const entry of entries) {
      if (crawlProgress.shouldStop()) break; // 사용자 중단 요청
      crawlProgress.report(processed, entries.length, entry.name);
      processed++;
      const originalId = String(entry.pageId ?? '');
      if (!originalId) {
        logger.warn(`Relic entry missing pageId: ${entry.name}`);
        continue;
      }
      logger.info(
        `[SR-Relic] ${processed}/${entries.length} ${entry.name} (${originalId})`,
      );

      try {
        // 2. 상세(파츠 lore 보강) — 실패해도 목록 데이터로 진행
        let detail: any = null;
        try {
          detail = await fetchPageConfig(`${this.DETAIL_BASE}/${originalId}`);
        } catch (e) {
          logger.warn(`Relic detail fetch failed for ${originalId}, using list entry only.`);
        }

        const name = detail?.name || entry.name || `RelicSet_${originalId}`;
        const rarity = entry.rarity ?? detail?.rarity ?? 5;
        const skills: any[] = detail?.skills || entry.skills || [];

        // 세트 아이콘
        const localImageUrl = await this.dl(
          entry.iconPath || detail?.iconPath,
          `set_${originalId}`,
          'relic-set',
        );

        // 세트 보너스 (2pc / 4pc)
        const bonus2pc = this.getSetBonus(skills, 2);
        const bonus4pc = this.getSetBonus(skills, 4);

        // 파츠 (상세 pieces 우선, 없으면 목록 pieces)
        const piecesSrc = detail?.pieces || entry.pieces || {};
        const parts: Record<string, any> = {};
        for (const [partId, piece] of Object.entries(piecesSrc as any)) {
          const p = piece as any;
          const iconUrl = await this.dl(
            p.iconPath,
            `piece_${originalId}_${partId}`,
            'relic-piece',
          );
          parts[partId] = {
            name: p.name || p.baseTypeText || '',
            iconUrl,
            desc: p.lore || p.miniLore || '',
            story: p.loreTitle || '',
            rarityData: p.rarityData || null,
          };
        }

        const metadata = {
          originalId,
          type: 'RelicSet',
          relicType: entry.relicType ?? detail?.relicType,
          '2pc': bonus2pc,
          '4pc': bonus4pc,
          parts,
          srsIconPath: entry.iconPath || detail?.iconPath,
        };

        const description = `2pc: ${bonus2pc.desc}\n4pc: ${bonus4pc.desc}`;

        // 3. 자체 upsert — (gameId, type:'RelicSet', originalId) 컬럼 매칭(타입 간 id 충돌
        //    방지, 예: Material 101 vs RelicSet 101). originalId 컬럼도 동기화. (B-H4b)
        const existing = await prisma.item.findFirst({
          where: { gameId: game.id, type: 'RelicSet', originalId },
        });

        if (existing) {
          await prisma.item.update({
            where: { id: existing.id },
            data: { name, originalId, rarity, imageUrl: localImageUrl, description, metadata },
          });
          logger.info(`Updated RelicSet: ${name} (ID: ${originalId})`);
        } else {
          await prisma.item.create({
            data: {
              gameId: game.id,
              name,
              type: 'RelicSet',
              originalId,
              rarity,
              imageUrl: localImageUrl,
              description,
              metadata,
            },
          });
          logger.info(`Created RelicSet: ${name} (ID: ${originalId})`);
        }

        results.push({ name, sourceUrl: `${this.DETAIL_BASE}/${originalId}`, imageUrl: localImageUrl, metadata });
      } catch (innerErr) {
        errors++;
        logger.error(`Failed to process RelicSet ${originalId}:`, innerErr);
      }
    }

    if (results.length === 0 && errors > 0) {
      throw new Error(`All ${errors} relic sets failed (SRS 장애/구조 변경 의심)`);
    }
    if (errors > 0) {
      logger.warn(`Relic scrape partial: ${results.length} ok / ${errors} failed`);
    }
    return results;
  }

  /** skills[]에서 useNum(2 또는 4) 세트보너스 추출 → { desc, params } */
  private getSetBonus(skills: any[], num: number): { desc: string; params: number[] } {
    const s = Array.isArray(skills)
      ? skills.find((x) => x.useNum === num)
      : null;
    return {
      desc: s?.desc || '',
      params: Array.isArray(s?.params) ? s.params : [],
    };
  }

  private async dl(
    iconPath: string | undefined | null,
    fileName: string,
    category: string,
  ): Promise<string | null> {
    const url = srsAssetUrl(iconPath);
    if (!url) return null;
    return ImageDownloader.downloadAndSave(url, 'starrail', category, fileName);
  }
}
