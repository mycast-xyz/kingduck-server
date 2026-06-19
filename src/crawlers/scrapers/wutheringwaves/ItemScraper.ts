import { axiosGetWithRetry } from '../../utils/httpRetry';
import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import logger from '../../../utils/logger';
import { BASE_API_URL } from './utils';
import { prisma } from '../../../utils/prisma';
import { WutheringWavesDownloader } from '../../utils/WutheringWavesDownloader';
import { crawlProgress } from '../../crawlProgress';

export class WutheringWavesItemScraper extends ScraperBase {
  constructor() {
    super('wutheringwaves');
  }

  /**
   * 아이콘 후보(http 또는 /Game/ 경로)만 골라 다운로드한다. 그 외 값은 그대로 둔다.
   * (예전 구현은 detail 전체를 재귀 순회하며 /Game/로 시작하는 모든 문자열 — Mesh/EntityConfig 등
   *  비이미지 자산까지 — 다운로드해 2128개 아이템 × 다수 요청으로 크롤이 수 시간 멈췄다. B-크롤 hang.)
   */
  private async downloadIcon(val: any): Promise<any> {
    if (
      typeof val === 'string' &&
      (val.startsWith('http') || val.startsWith('/Game/'))
    ) {
      return WutheringWavesDownloader.downloadAsset(val);
    }
    return val;
  }

  async scrape(limit?: number): Promise<ScrapedData[]> {
    logger.info('Starting Wuthering Waves Item scraping (API)...');
    try {
      // Get Game ID
      let game = await prisma.game.findUnique({
        where: { slug: 'wutheringwaves' },
      });
      if (!game) {
        logger.info('Creating Game: wutheringwaves (if missing)');
        game = await prisma.game.create({
          data: {
            slug: 'wutheringwaves',
            name: 'Wuthering Waves',
            iconUrl: '',
          },
        });
      }
      const gameId = game.id;

      const { data } = await axiosGetWithRetry<any>(`${BASE_API_URL}/item`, {
        timeout: 15000,
      });
      let list = data.itemList || [];
      const results: ScrapedData[] = [];

      if (limit) {
        list = list.slice(0, limit);
      }

      let processedScrape = 0;
      const totalScrape = list.length;

      for (const item of list) {
        if (crawlProgress.shouldStop()) break; // 사용자 중단 요청
        crawlProgress.report(processedScrape, totalScrape, item.Name);
        processedScrape++;
        if (processedScrape % 50 === 0 || processedScrape === totalScrape) {
          logger.info(
            `[WW-Item] Scraping progress: ${processedScrape}/${totalScrape} (${((processedScrape / totalScrape) * 100).toFixed(1)}%)`,
          );
        }

        try {
          const detailUrl = `${BASE_API_URL}/item/${item.Id}`;
          let detailData: any = item;
          try {
            const { data: detail } = await axiosGetWithRetry<any>(detailUrl, {
              timeout: 15000,
            });
            detailData = { ...item, ...detail };
          } catch (err) {
            logger.warn(`Failed to fetch detail for item ${item.Id}:`, err);
          }

          // 이미지는 실제 표시에 쓰는 3개 아이콘만 다운로드(detail 전체 재귀 다운로드 금지 — hang 방지).
          const [icon, iconMiddle, iconSmall] = await Promise.all([
            this.downloadIcon(detailData.Icon),
            this.downloadIcon(detailData.IconMiddle),
            this.downloadIcon(detailData.IconSmall),
          ]);

          // type 분류: list의 TypeName(한국어). syncItems가 metadata.type을 읽으므로 반드시 채운다
          // (예전엔 metadata.type 누락 → 전건 'Unknown'으로 적재됨). 빈 값은 'Item'으로 폴백.
          const itemType = item.TypeName || detailData.TypeName || 'Item';

          results.push({
            gameId: gameId,
            type: itemType,
            name: detailData.Name,
            sourceUrl: detailUrl,
            imageUrl: icon || '',
            rarity: detailData.QualityId || 1,
            description:
              detailData.AttributesDescription ||
              detailData.BgDescription ||
              '',
            metadata: {
              sourceUrl: detailUrl,
              originalId: item.Id,
              type: itemType, // ← syncItems가 읽는 분류 키
              typeId: item.ItemType ?? item.TypeId,
              rawType: item.TypeName,
              bgDescription: detailData.BgDescription,
              icon,
              iconMiddle,
              iconSmall,
            },
          });
        } catch (err) {
          // 단일 아이템 실패가 전체 크롤을 죽이지 않도록 격리.
          logger.warn(`Failed to process item ${item.Id}:`, err);
        }

        // 외부 API/이미지 서버 예의 — 과도한 동시/연속 요청 방지(가벼운 딜레이).
        await this.delay(20);
      }

      return results;
    } catch (e) {
      logger.error('Error scraping Wuthering Waves items:', e);
      return [];
    }
  }

  async save(data: ScrapedData[]) {
    logger.info(`Saving ${data.length} items to database...`);
    let createdCount = 0;
    let skippedCount = 0;
    let processedSave = 0;
    const totalSave = data.length;

    for (const item of data) {
      processedSave++;
      if (processedSave % 20 === 0 || processedSave === totalSave) {
        logger.info(
          `[WW-Item] Saving progress: ${processedSave}/${totalSave} (${((processedSave / totalSave) * 100).toFixed(1)}%)`,
        );
      }
      try {
        const metadata = item.metadata as any;
        const originalId = metadata?.originalId;

        // 1. Duplicate Check (Name + OriginalId)
        // Adjust duplicate check logic if needed based on unique constraints
        const existingItems = await prisma.item.findMany({
          where: {
            gameId: item.gameId,
            name: item.name,
          },
        });

        // Check if any existing item has the same originalId (if stored in metadata)
        const isDuplicate = existingItems.some((existing) => {
          const existingMeta = existing.metadata as any;
          return existingMeta?.originalId === originalId;
        });

        if (!isDuplicate) {
          // 2. Insert New
          await prisma.item.create({
            data: {
              gameId: item.gameId,
              name: item.name,
              type: item.type,
              rarity: item.rarity,
              description: item.description,
              imageUrl: item.imageUrl,
              metadata: item.metadata,
            },
          });
          createdCount++;
          // logger.info(`Created new item: ${item.name}`); // Too verbose
        } else {
          // Optional: Update if needed, here just skipping as per EchoScraper pattern
          skippedCount++;
          // logger.info(
          //   `Duplicate found for ${item.name} (originalId: ${originalId}). Skipped.`,
          // );
        }
      } catch (e) {
        logger.error(`Failed to save item ${item.name}:`, e);
      }
    }
    logger.info(
      `Save complete. Created: ${createdCount}, Skipped: ${skippedCount}`,
    );
  }
}
