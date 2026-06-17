import { axiosGetWithRetry } from '../../utils/httpRetry';
import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import logger from '../../../utils/logger';
import { BASE_API_URL } from './utils';
import { prisma } from '../../../utils/prisma';
import { WutheringWavesDownloader } from '../../utils/WutheringWavesDownloader';

export class WutheringWavesItemScraper extends ScraperBase {
  constructor() {
    super('wutheringwaves');
  }

  // Recursively traverse and handle images
  private async processDeep(obj: any): Promise<any> {
    if (Array.isArray(obj)) {
      return Promise.all(obj.map((item) => this.processDeep(item)));
    } else if (typeof obj === 'object' && obj !== null) {
      const newObj: any = {};
      for (const key in obj) {
        const val = obj[key];
        if (
          typeof val === 'string' &&
          (val.startsWith('http') ||
            val.startsWith('/Game/') ||
            val.match(/\.(png|jpg|jpeg|mp4)$/))
        ) {
          // Download and replace with local path
          newObj[key] = await WutheringWavesDownloader.downloadAsset(val);
        } else {
          newObj[key] = await this.processDeep(val);
        }
      }
      return newObj;
    }
    return obj;
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
        processedScrape++;
        if (processedScrape % 10 === 0 || processedScrape === totalScrape) {
          logger.info(
            `[WW-Item] Scraping progress: ${processedScrape}/${totalScrape} (${((processedScrape / totalScrape) * 100).toFixed(1)}%)`,
          );
        }
        const detailUrl = `${BASE_API_URL}/item/${item.Id}`;
        let rawDetailData = item;
        try {
          const { data: detail } = await axiosGetWithRetry<any>(detailUrl, {
            timeout: 15000,
          });
          rawDetailData = { ...item, ...detail };
        } catch (err) {
          logger.warn(`Failed to fetch detail for item ${item.Id}:`, err);
        }

        // Process images recursively
        const detailData = await this.processDeep(rawDetailData);

        const localImageUrl = detailData.Icon || '';

        results.push({
          gameId: gameId,
          type: item.TypeName || 'Item',
          name: detailData.Name,
          sourceUrl: detailUrl,
          imageUrl: localImageUrl,
          rarity: detailData.QualityId || 1,
          description:
            detailData.AttributesDescription || detailData.BgDescription || '',
          metadata: {
            sourceUrl: detailUrl,
            originalId: item.Id,
            typeId: item.ItemType,
            rawType: item.TypeName,
            bgDescription: detailData.BgDescription,
            iconMiddle: detailData.IconMiddle,
            iconSmall: detailData.IconSmall,
            raw: detailData,
          },
        });
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
