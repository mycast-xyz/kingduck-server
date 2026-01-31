import axios from 'axios';
import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import logger from '../../../utils/logger';
import { prisma } from '../../../utils/prisma';
import { ImageDownloader } from '../../utils/ImageDownloader';
import fs from 'fs';
import path from 'path';

export class StarRailItemScraper extends ScraperBase {
  private readonly API_URL = 'https://api.hakush.in/hsr/data/kr/item_all.json';
  // Updated base URL for item figures
  private readonly ICON_BASE_URL = 'https://api.hakush.in/hsr/UI/itemfigures/';
  // Fallback or secondary icon path if needed, but user specifically mentioned 'itemfigures'
  // and gave example: https://api.hakush.in/hsr/UI/itemfigures/114002.webp

  constructor() {
    super('starrail');
  }

  async scrape(options?: {
    limit?: number;
    saveToJson?: boolean;
    jsonPath?: string;
  }): Promise<ScrapedData[]> {
    logger.info('Starting Star Rail Item scraping...');
    try {
      // 0. Game check
      let game = await prisma.game.findUnique({
        where: { slug: 'starrail' },
      });

      if (!game) {
        logger.info('Creating Game: starrail');
        game = await prisma.game.create({
          data: {
            slug: 'starrail',
            name: 'Honkai: Star Rail',
            iconUrl: '',
          },
        });
      }
      const gameId = game.id;

      // 1. Fetch data
      const { data: itemMap } = await axios.get(this.API_URL);

      // The API returns an object where keys are IDs. Convert to array.
      const list = Object.values(itemMap) as any[];

      logger.info(`Fetched ${list.length} items from ${this.API_URL}`);

      // Optional: limit for testing
      let itemsToProcess = list;
      if (options?.limit) {
        itemsToProcess = list.slice(0, options.limit);
      }

      const results: ScrapedData[] = [];

      for (const item of itemsToProcess) {
        // Map to ScrapedData

        // Fallback for type
        // Raw: ItemMainType
        const itemType = item.ItemMainType || 'Item';

        // Extract icon name from path.
        // The user example: https://api.hakush.in/hsr/UI/itemfigures/114002.webp
        // The raw data usually has "ItemIconPath": "SpriteOutput/ItemIcon/900001.png"
        // or "ItemFigureIconPath": "SpriteOutput/ItemFigures/114002.png".
        // Use Figure path if available, else Icon path.

        let iconName = '';
        if (item.ItemFigureIconPath) {
          const parts = item.ItemFigureIconPath.split('/');
          const filename = parts[parts.length - 1];
          iconName = filename.replace(/\.(png|jpg|webp)$/, '');
        } else if (item.ItemIconPath) {
          // Fallback to normal icon if figure is missing
          const parts = item.ItemIconPath.split('/');
          const filename = parts[parts.length - 1];
          iconName = filename.replace(/\.(png|jpg|webp)$/, '');
        }

        let iconUrl = iconName ? `${this.ICON_BASE_URL}${iconName}.webp` : '';

        // Download Image
        if (iconUrl) {
          const downloadedPath = await ImageDownloader.downloadAndSave(
            iconUrl,
            'starrail',
            'item',
            iconName,
          );
          if (downloadedPath) {
            iconUrl = downloadedPath;
          }
        }

        // Flatten raw data: spread item into metadata.
        // Remove 'raw' property.
        // Move sourceUrl into metadata.

        results.push({
          gameId: gameId,
          type: itemType,
          name: item.ItemName,
          sourceUrl: this.API_URL, // interface requirement, effectively unused in DB save
          imageUrl: iconUrl,
          rarity: item.Rarity === 'SuperRare' ? 5 : Number(item.Rarity) || 3,
          description: item.ItemDesc || item.ItemBGDesc || '',
          metadata: {
            originalId: item.ID,
            type: itemType,
            subType: item.ItemSubType,
            bgDesc: item.ItemBGDesc,
            comeFrom: item.ItemComefrom,
            sourceUrl: this.API_URL, // Explicitly in metadata as requested
            ...item, // Flattened raw data
            // raw: item // Omitted as requested to "open up" (flatten) it
          },
        });
      }

      if (options?.saveToJson) {
        const filePath =
          options.jsonPath ||
          path.join(process.cwd(), 'starrail_items_test.json');
        fs.writeFileSync(filePath, JSON.stringify(results, null, 2));
        logger.info(`Saved ${results.length} items to ${filePath}`);
      }

      return results;
    } catch (e) {
      logger.error('Error scraping Star Rail items:', e);
      return [];
    }
  }

  async save(data: ScrapedData[]) {
    logger.info(`Saving ${data.length} items to database...`);
    let createdCount = 0;
    let updatedCount = 0;

    for (const item of data) {
      try {
        const metadata = item.metadata as any;
        const originalId = metadata?.originalId;

        // Duplicate Check (Name + OriginalId)
        let existing = null;
        if (originalId) {
          existing = await prisma.item.findFirst({
            where: {
              gameId: item.gameId,
              metadata: {
                path: ['originalId'],
                equals: originalId,
              },
            },
          });
        }

        if (existing) {
          // Update
          await prisma.item.update({
            where: { id: existing.id },
            data: {
              name: item.name,
              imageUrl: item.imageUrl,
              description: item.description,
              rarity: item.rarity,
              type: item.type,
              metadata: item.metadata,
            },
          });
          updatedCount++;
        } else {
          // Create
          await prisma.item.create({
            data: {
              gameId: item.gameId,
              name: item.name,
              type: item.type,
              rarity: item.rarity,
              imageUrl: item.imageUrl,
              description: item.description,
              metadata: item.metadata,
            },
          });
          createdCount++;
        }
      } catch (e) {
        logger.error(`Failed to save item ${item.name}:`, e);
      }
    }
    logger.info(
      `Save complete. Created: ${createdCount}, Updated: ${updatedCount}`,
    );
  }
}
