import axios from 'axios';
import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { ImageDownloader } from '../../utils/ImageDownloader';
import logger from '../../../utils/logger';
import { BASE_API_URL, getImageUrl } from './utils';
import { prisma } from '../../../utils/prisma';

import { WutheringWavesDownloader } from '../../utils/WutheringWavesDownloader';

export class WutheringWavesWeaponScraper extends ScraperBase {
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
    logger.info('Starting Wuthering Waves Weapon scraping (API)...');
    try {
      // Get Game ID
      let game = await prisma.game.findUnique({
        where: { slug: 'wutheringwaves' },
      });
      if (!game) {
        // Create if not exists (similar to CharacterScraper to avoid errors if run in isolation)
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

      const { data } = await axios.get(`${BASE_API_URL}/weapon`, { timeout: 15000 });
      const list = data.weapons || [];
      const results: ScrapedData[] = [];

      for (const item of list) {
        const detailUrl = `${BASE_API_URL}/weapon/${item.Id}`;
        let rawDetailData = item;
        try {
          const { data: detail } = await axios.get(detailUrl, { timeout: 15000 });
          rawDetailData = { ...item, ...detail };
        } catch (err) {
          logger.warn(`Failed to fetch detail for weapon ${item.Id}:`, err);
        }

        // Process images recursively
        const detailData = await this.processDeep(rawDetailData);

        // Main Icon (already processed by processDeep if present in detailData.Icon)
        // Check if we need to use legacy downloader or if processDeep covered it.
        // detailData.Icon should be updated now.
        const localImageUrl = detailData.Icon || '';

        // --- Transformation Logic ---
        // Extract stats
        const stats = detailData.Properties
          ? detailData.Properties.map((prop: any) => ({
              name: prop.Name,
              baseValue: prop.BaseValue,
              growth: prop.GrowthValues
                ? prop.GrowthValues.map((g: any) => ({
                    level: g.Level,
                    value: g.Value,
                  }))
                : [],
            }))
          : [];

        // Extract breaches
        const breaches = detailData.Breaches
          ? detailData.Breaches.map((breach: any) => ({
              level: breach.Level,
              levelLimit: breach.LevelLimit,
              goldCost: breach.GoldConsume,
              materials: (breach.Items || []).map((mat: any) => ({
                itemId: mat.Key,
                amount: mat.Value,
                icon: mat.Icon, // This should be local path now
              })),
            }))
          : [];

        results.push({
          gameId: gameId,
          type: 'Weapon',
          name: item.Name,
          sourceUrl: detailUrl, // Kept for TS interface compliance
          imageUrl: localImageUrl,
          rarity: item.QualityId,
          description: detailData.Desc || '',
          metadata: {
            sourceUrl: detailUrl, // Moved here
            originalId: item.Id,
            weaponType: item.TypeName || 'Weapon', // "대검", "직검" etc.
            typeIcon: detailData.TypeIcon, // This should be local path now
            modelId: item.ModelId,
            descriptionParams: detailData.DescParams,
            attributesDescription: detailData.AttributesDescription,
            stats: stats,
            breaches: breaches,
          },
        });
      }

      const fs = require('fs');
      fs.writeFileSync(
        'final_weapon_test.json',
        JSON.stringify(results, null, 2),
      );
      logger.info('Saved final test results to final_weapon_test.json');

      return results;
    } catch (e) {
      logger.error('Error scraping Wuthering Waves weapons:', e);
      return [];
    }
  }

  async save(data: ScrapedData[]) {
    logger.info(`Saving ${data.length} weapons to database...`);
    let createdCount = 0;
    let skippedCount = 0;

    for (const item of data) {
      try {
        const metadata = item.metadata as any;
        const originalId = metadata?.originalId;

        // 1. Duplicate Check (Name + OriginalId)
        // Note: Prisma JSON check syntax depends on version/DB.
        // For reliability and standard checks, we find by name first, then verify metadata.
        const existingItems = await prisma.item.findMany({
          where: {
            gameId: item.gameId,
            name: item.name,
            type: 'Weapon',
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
              type: item.type || 'Weapon',
              originalId: originalId != null ? String(originalId) : null, // 컬럼 동기화(B-H4b)
              rarity: item.rarity,
              description: item.description,
              imageUrl: item.imageUrl,
              metadata: item.metadata,
            },
          });
          createdCount++;
          logger.info(`Created new weapon: ${item.name}`);
        } else {
          skippedCount++;
          logger.info(
            `Duplicate found for ${item.name} (originalId: ${originalId}). Skipped.`,
          );
        }
      } catch (e) {
        logger.error(`Failed to save weapon ${item.name}:`, e);
      }
    }
    logger.info(
      `Save complete. Created: ${createdCount}, Skipped: ${skippedCount}`,
    );
  }
}
