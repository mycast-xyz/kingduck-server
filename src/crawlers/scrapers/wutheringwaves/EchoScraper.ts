import axios from 'axios';
import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import logger from '../../../utils/logger';
import { BASE_API_URL } from './utils';
import { prisma } from '../../../utils/prisma';
import { WutheringWavesDownloader } from '../../utils/WutheringWavesDownloader';

export class WutheringWavesEchoScraper extends ScraperBase {
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

  async scrape(): Promise<ScrapedData[]> {
    logger.info('Starting Wuthering Waves Echo scraping (API)...');
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

      const { data } = await axios.get(`${BASE_API_URL}/echo`);
      const list = data.Echo || [];
      const results: ScrapedData[] = [];

      for (const item of list) {
        const detailUrl = `${BASE_API_URL}/echo/${item.Id}`;
        let rawDetailData = item;
        try {
          const { data: detail } = await axios.get(detailUrl);
          rawDetailData = { ...item, ...detail };
        } catch (err) {
          logger.warn(`Failed to fetch detail for echo ${item.Id}:`, err);
        }

        // Process images recursively
        const detailData = await this.processDeep(rawDetailData);

        const localImageUrl = detailData.Icon || '';

        results.push({
          gameId: gameId,
          type: 'Echo',
          name: item.Name,
          sourceUrl: detailUrl, // Kept for interface compliance
          imageUrl: localImageUrl,
          rarity: item.QualityId || item.Rarity || 4,
          description: detailData.Desc || '',
          metadata: {
            sourceUrl: detailUrl,
            originalId: item.Id,
            type: 'Echo',
            element: detailData.Element?.Name,
            cost: detailData.Cost,
            phantomType: detailData.PhantomType,
            skill: detailData.Skill,
            sonataEffects: detailData.SonataEffects,
            raw: detailData,
          },
        });
      }

      return results;
    } catch (e) {
      logger.error('Error scraping Wuthering Waves echoes:', e);
      return [];
    }
  }

  async save(data: ScrapedData[]) {
    logger.info(`Saving ${data.length} echoes to database...`);
    let createdCount = 0;
    let skippedCount = 0;

    for (const item of data) {
      try {
        const metadata = item.metadata as any;
        const originalId = metadata?.originalId;

        // 1. Duplicate Check (Name + OriginalId)
        const existingItems = await prisma.item.findMany({
          where: {
            gameId: item.gameId,
            name: item.name,
            type: 'Echo',
          },
        });

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
              type: item.type || 'Echo',
              rarity: item.rarity,
              description: item.description,
              imageUrl: item.imageUrl,
              metadata: item.metadata,
            },
          });
          createdCount++;
          logger.info(`Created new echo: ${item.name}`);
        } else {
          skippedCount++;
          logger.info(
            `Duplicate found for ${item.name} (originalId: ${originalId}). Skipped.`,
          );
        }
      } catch (e) {
        logger.error(`Failed to save echo ${item.name}:`, e);
      }
    }
    logger.info(
      `Save complete. Created: ${createdCount}, Skipped: ${skippedCount}`,
    );
  }
}
