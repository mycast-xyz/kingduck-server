import { axiosGetWithRetry } from '../../utils/httpRetry';
import { ScraperBase } from '../../core/ScraperBase';
import { ImageDownloader } from '../../utils/ImageDownloader';
import logger from '../../../utils/logger';
import { prisma } from '../../../utils/prisma';
import { BASE_ITEM_LIST_URL, HEADERS, I18N_URLS } from './utils';

// Helper to recursively resolve localization IDs (copied from EquipmentScraper)
const resolveIds = (obj: any, i18nMap: Record<string, string>): any => {
  if (!obj) return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => resolveIds(item, i18nMap));
  }
  if (typeof obj === 'object') {
    if ('id' in obj && 'text' in obj) {
      if (obj.id && i18nMap[obj.id]) {
        return { ...obj, text: i18nMap[obj.id] };
      }
      if (obj.text === null || obj.text === undefined) {
        const localized = i18nMap[obj.id];
        return { ...obj, text: localized || null };
      }
    }
    const newObj: any = {};
    for (const key in obj) {
      newObj[key] = resolveIds(obj[key], i18nMap);
    }
    return newObj;
  }
  return obj;
};

export class EndfieldItemScraper extends ScraperBase {
  constructor() {
    super('endfield');
  }

  async scrape(options?: { limit?: number }): Promise<any[]> {
    logger.info('Starting Endfield Item scraping...');
    try {
      // 1. Fetch Localization Maps
      logger.info('Fetching Localization Maps...');
      const i18nMap: Record<string, string> = {};

      for (const [key, url] of Object.entries(I18N_URLS)) {
        try {
          const { data: i18nData } = await axiosGetWithRetry<any>(url, {
            headers: HEADERS,
            timeout: 15000,
          });
          Object.assign(i18nMap, i18nData);
          logger.info(`Loaded ${key} I18n data.`);
        } catch (e) {
          logger.warn(`Failed to load ${key} I18n: ${e}`);
        }
      }
      logger.info(
        `Loaded Localization Map with ${Object.keys(i18nMap).length} entries.`,
      );

      // 2. Fetch Game ID
      const game = await prisma.game.findFirst({
        where: { slug: this.gameSlug },
      });

      if (!game) {
        throw new Error(`Game not found: ${this.gameSlug}`);
      }

      // 3. Fetch Item List
      logger.info('Fetching Item List...');
      const { data: itemListData } = await axiosGetWithRetry<any>(
        BASE_ITEM_LIST_URL,
        {
          headers: HEADERS,
          timeout: 15000,
        },
      );

      // The list is an object where keys are IDs
      let items = Object.values(itemListData);
      logger.info(`Found ${items.length} items.`);

      if (options?.limit) {
        items = items.slice(0, options.limit);
      }

      const results: any[] = [];
      let processedCount = 0;

      for (const itemEntry of items as any[]) {
        processedCount++;
        const itemId = itemEntry.id;

        // Log sparingly
        if (processedCount % 10 === 0) {
          logger.info(
            `[Endfield] Processing Item ${processedCount}/${items.length}...`,
          );
        }

        try {
          // resolve localization
          const resolvedItem = resolveIds(itemEntry, i18nMap);

          const itemName =
            resolvedItem.name?.text ||
            i18nMap[resolvedItem.nameI18nId] ||
            itemId;
          const itemDesc =
            resolvedItem.desc?.text || i18nMap[resolvedItem.descI18nId] || null;

          // Image Download
          // URL pattern: https://endfieldtools.dev/assets/images/endfield/itemicon/{IconId}.png
          // Note: Use iconId if present, else itemId. JSON has iconId.
          const iconId = resolvedItem.iconId || itemId;
          const remoteUrl = `https://endfieldtools.dev/assets/images/endfield/itemicon/${iconId}.png`;

          let localIconUrl = null;
          try {
            localIconUrl = await ImageDownloader.downloadAndSave(
              remoteUrl,
              'endfield',
              'items',
              `item_${iconId}`,
            );
          } catch (err) {
            logger.warn(
              `Failed to download image for ${itemName} (${iconId}): ${err}`,
            );
          }

          const mappedItem = {
            gameId: game.id,
            name: itemName,
            type: resolvedItem.type || 'Item',
            rarity: resolvedItem.rarity || 1,
            description: itemDesc,
            imageUrl: localIconUrl,
            metadata: {
              ...resolvedItem,
              originalId: itemId,
            },
          };
          results.push(mappedItem);
        } catch (e) {
          logger.error(`Failed to process item ${itemId}:`, e);
        }
      }

      return results;
    } catch (e) {
      logger.error('Failed to scrape Endfield items:', e);
      return [];
    }
  }

  async save(data: any[]) {
    logger.info(`Saving ${data.length} items to database...`);

    const game = await prisma.game.findFirst({
      where: { slug: this.gameSlug },
    });

    if (!game) {
      throw new Error(`Game not found: ${this.gameSlug}`);
    }

    //   const existingItems = await prisma.item.findMany({
    //       where: { gameId: game.id }, // Scope to game
    //       select: { id: true, metadata: true },
    //   });
    // Optimization: Fetch all items for this game to reduce DB calls,
    // but if list is huge, might be better to do upsert one by one.
    // EquipmentScraper loads all. I'll stick to that for now as list is small (~95 items).

    const existingItems = await prisma.item.findMany({
      where: { gameId: game.id },
      select: { id: true, metadata: true },
    });

    let createdCount = 0;
    let updatedCount = 0;

    for (const item of data) {
      if (!item.name) continue;

      const originalId = item.metadata?.originalId;
      if (!originalId) {
        continue;
      }

      const existing = existingItems.find((e) => {
        const meta = e.metadata as any;
        return meta && meta.originalId === originalId;
      });

      if (!existing) {
        await prisma.item.create({
          data: {
            gameId: game.id,
            name: item.name,
            type: item.type,
            rarity: item.rarity,
            description: item.description,
            imageUrl: item.imageUrl,
            metadata: item.metadata,
          },
        });
        createdCount++;
      } else {
        await prisma.item.update({
          where: { id: existing.id },
          data: {
            name: item.name,
            type: item.type, // Update type if changed
            rarity: item.rarity,
            description: item.description,
            imageUrl: item.imageUrl,
            metadata: item.metadata,
          },
        });
        updatedCount++;
      }
    }
    logger.info(
      `Item Sync Complete. Created: ${createdCount}, Updated: ${updatedCount}`,
    );
  }
}
