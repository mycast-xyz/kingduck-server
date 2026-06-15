import axios from 'axios';
import { ScraperBase } from '../../core/ScraperBase';
import { ImageDownloader } from '../../utils/ImageDownloader';
import logger from '../../../utils/logger';
import { prisma } from '../../../utils/prisma';
import {
  BASE_WEAPON_LIST_URL,
  BASE_WEAPON_DETAIL_URL,
  HEADERS,
  I18N_URLS,
} from './utils';

export class EndfieldWeaponScraper extends ScraperBase {
  constructor() {
    super('endfield');
  }

  async scrape(options?: { limit?: number }): Promise<any[]> {
    logger.info('Starting Endfield Weapon scraping...');

    try {
      const game = await prisma.game.findFirst({
        where: { slug: this.gameSlug },
      });

      if (!game) {
        throw new Error(`Game not found: ${this.gameSlug}`);
      }

      // 1. Fetch Localization Maps
      logger.info('Fetching Localization Maps...');
      const mapRequests = Object.values(I18N_URLS).map((url) =>
        axios.get(url, { headers: HEADERS, timeout: 15000 }),
      );
      const mapResponses = await Promise.all(mapRequests);
      let i18nMap: Record<string, string> = {};

      mapResponses.forEach((res) => {
        if (res.data) {
          i18nMap = { ...i18nMap, ...res.data };
        }
      });
      logger.info(
        `Loaded Localization Map with ${Object.keys(i18nMap).length} entries.`,
      );

      // Helper for recursive resolving
      const resolveIds = (obj: any): any => {
        if (!obj) return obj;
        if (Array.isArray(obj)) {
          return obj.map((item) => resolveIds(item));
        }
        if (typeof obj === 'object') {
          // Check if it's the { id, text } pattern
          if ('id' in obj && 'text' in obj) {
            if (obj.text === null || obj.text === undefined) {
              const localized = i18nMap[obj.id];
              return { ...obj, text: localized || null };
            }
          }
          const newObj: any = {};
          for (const key in obj) {
            newObj[key] = resolveIds(obj[key]);
          }
          return newObj;
        }
        return obj;
      };

      // 2. Fetch Weapon List
      logger.info('Fetching Weapon List...');
      const { data: listData } = await axios.get(BASE_WEAPON_LIST_URL, {
        headers: HEADERS,
        timeout: 15000,
      });
      let list = Object.values(listData);
      logger.info(`Found ${list.length} weapons.`);

      if (options?.limit) {
        list = list.slice(0, options.limit);
      }

      const results: any[] = [];
      let processedCount = 0;

      for (const item of list) {
        processedCount++;
        const weaponItem = item as any;
        const weaponId = weaponItem.weaponId; // Assuming 'weaponId' is the key based on character pattern

        // Resolve Name
        let name = weaponId;

        // 1. Try nameI18nId (Primary for Localization)
        if (weaponItem.nameI18nId && i18nMap[weaponItem.nameI18nId]) {
          name = i18nMap[weaponItem.nameI18nId];
        }
        // 2. Fallback to name.id
        else if (
          weaponItem.name &&
          weaponItem.name.id &&
          i18nMap[weaponItem.name.id]
        ) {
          name = i18nMap[weaponItem.name.id];
        }
        // 3. Fallback to English/Code
        else {
          if (typeof weaponItem.engName === 'string') {
            name = weaponItem.engName;
          } else if (weaponItem.engName && weaponItem.engName.text) {
            name = weaponItem.engName.text;
          }
        }

        logger.info(
          `[Endfield] Processing Weapon ${processedCount}/${list.length} (${name})...`,
        );

        try {
          const detailUrl = `${BASE_WEAPON_DETAIL_URL}/${weaponId}.json`;
          const { data: detail } = await axios.get(detailUrl, {
            headers: HEADERS,
            timeout: 15000,
          });

          // Recursive resolve
          const resolvedDetail = resolveIds(detail);

          // Image Logic
          // Pattern: https://endfieldtools.dev/assets/images/endfield/itemicon/{weaponId}.png
          // User provided this correct path.
          const remoteUrl = `https://endfieldtools.dev/assets/images/endfield/itemicon/${weaponId}.png`;

          const localIconUrl = await ImageDownloader.downloadAndSave(
            remoteUrl,
            'endfield',
            'weapon',
            `weapon_${weaponId}`,
          );

          // I will simply map what I have. DataSyncService.syncItems expects:
          // name, type, rarity, description, imageUrl, metadata.

          const mappedItem = {
            gameId: game.id,
            name: name,
            type: 'Weapon',
            rarity: resolvedDetail.rarity,
            description: resolvedDetail.weaponDesc?.text || null,
            imageUrl: localIconUrl,
            metadata: {
              ...resolvedDetail,
              originalId: weaponId,
            },
          };

          results.push(mappedItem);
        } catch (e) {
          logger.error(`Error fetching detail for weapon ${name}:`, e);
        }
      }
      return results;
    } catch (e) {
      logger.error('Failed to scrape Endfield weapons:', e);
      return [];
    }
  }

  async save(data: any[]) {
    logger.info(`Saving ${data.length} weapons to database...`);

    const game = await prisma.game.findFirst({
      where: { slug: this.gameSlug },
    });

    if (!game) {
      throw new Error(`Game not found: ${this.gameSlug}`);
    }

    // Fetch existing items to check duplicates via metadata.originalId
    // Optimization: Depending on data size, finding all might be heavy, but for <100 weapons it's fine.
    // If specific to weapons, we might filter by type='Weapon' if needed, but originalId should be unique globally or per game.
    const existingItems = await prisma.item.findMany({
      where: { gameId: game.id, type: 'Weapon' },
      select: { id: true, metadata: true },
    });

    let createdCount = 0;
    let updatedCount = 0;

    for (const item of data) {
      if (!item.name) continue;

      const originalId = item.metadata?.originalId;
      if (!originalId) {
        logger.warn(`Skipping weapon without originalId: ${item.name}`);
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
        logger.info(`Created weapon: ${item.name} (${originalId})`);
      } else {
        await prisma.item.update({
          where: { id: existing.id },
          data: {
            name: item.name,
            rarity: item.rarity,
            description: item.description,
            imageUrl: item.imageUrl,
            metadata: item.metadata,
          },
        });
        updatedCount++;
        logger.info(`Updated weapon: ${item.name} (${originalId})`);
      }
    }

    logger.info(
      `Weapon Sync Complete. Created: ${createdCount}, Updated: ${updatedCount}`,
    );
  }
}
