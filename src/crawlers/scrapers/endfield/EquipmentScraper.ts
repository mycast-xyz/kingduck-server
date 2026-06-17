import axios from 'axios';
import { ScraperBase } from '../../core/ScraperBase';
import { ImageDownloader } from '../../utils/ImageDownloader';
import logger from '../../../utils/logger';
import { prisma } from '../../../utils/prisma';
import {
  BASE_EQUIPMENT_SUIT_LIST_URL,
  BASE_EQUIPMENT_SUIT_DETAIL_URL,
  BASE_EQUIPMENT_ITEM_DETAIL_URL,
  BASE_ITEM_LIST_URL,
  HEADERS,
  I18N_URLS,
} from './utils';

// Helper to recursively resolve localization IDs
const resolveIds = (obj: any, i18nMap: Record<string, string>): any => {
  if (!obj) return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => resolveIds(item, i18nMap));
  }
  if (typeof obj === 'object') {
    // Check if it's the { id, text } pattern
    if ('id' in obj && 'text' in obj) {
      // Prioritize checking if the ID exists in the map
      if (obj.id && i18nMap[obj.id]) {
        return { ...obj, text: i18nMap[obj.id] };
      }
      // If text is null, try to fill it (secondary check, though likely covered above)
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

export class EndfieldEquipmentScraper extends ScraperBase {
  constructor() {
    super('endfield');
  }

  async scrape(options?: { limit?: number }): Promise<any[]> {
    logger.info('Starting Endfield Equipment scraping...');
    try {
      // 1. Fetch Localization Maps (All of them to be safe)
      logger.info('Fetching Localization Maps...');
      const i18nMap: Record<string, string> = {};

      for (const [key, url] of Object.entries(I18N_URLS)) {
        try {
          const { data: i18nData } = await axios.get(url, { headers: HEADERS, timeout: 15000 });
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

      // 3. Fetch Suit List
      logger.info('Fetching Equipment Suit List...');
      const { data: suitListData } = await axios.get(
        BASE_EQUIPMENT_SUIT_LIST_URL,
        {
          headers: HEADERS,
          timeout: 15000,
        },
      );
      let suits = Object.values(suitListData);
      logger.info(`Found ${suits.length} suits.`);

      if (options?.limit) {
        suits = suits.slice(0, options.limit);
      }

      const results: any[] = [];
      let processedCount = 0;

      for (const suitEntry of suits as any[]) {
        processedCount++;
        const suitId = suitEntry.suitId; // e.g., "suit_burst01"

        logger.info(
          `[Endfield] Processing Suit ${processedCount}/${suits.length} (${suitId})...`,
        );

        try {
          // 4. Fetch Suit Detail
          const suitDetailUrl = `${BASE_EQUIPMENT_SUIT_DETAIL_URL}/${suitId}.json`;
          const { data: suitDetail } = await axios.get(suitDetailUrl, {
            headers: HEADERS,
            timeout: 15000,
          });

          const resolvedSuit = resolveIds(suitDetail, i18nMap);

          // Debug: Log keys to find set effects
          // logger.info(`Suit Keys: ${Object.keys(resolvedSuit).join(', ')}`);

          const suitName =
            resolvedSuit.name?.text ||
            i18nMap[resolvedSuit.nameI18nId] ||
            i18nMap[resolvedSuit.suitNameI18nId] || // Added specific key
            suitId;

          // Resolve Set Effects
          // The raw JSON has 'setEffects' array with 'equipCnt' and 'descriptionI18nId'
          let setEffects: string[] = [];
          if (
            resolvedSuit.setEffects &&
            Array.isArray(resolvedSuit.setEffects)
          ) {
            setEffects = resolvedSuit.setEffects
              .map((eff: any) => {
                const count = eff.equipCnt;
                // Try to find text via descriptionI18nId
                let text = i18nMap[eff.descriptionI18nId];

                // Fallback: Check nested skillData description if direct ID fails or is missing
                if (
                  !text &&
                  eff.skillData?.SkillPatchDataBundle?.[0]?.description
                ) {
                  const descObj =
                    eff.skillData.SkillPatchDataBundle[0].description;
                  text = descObj.text || i18nMap[descObj.id];
                }

                if (text) {
                  return `[${count}-Piece] ${text}`;
                }
                return null;
              })
              .filter(Boolean);
          } else if (resolvedSuit.setEffectDescList) {
            // Fallback for previous assumption
            setEffects = resolvedSuit.setEffectDescList
              .map((eff: any) => eff.text)
              .filter(Boolean);
          }

          // 5. Iterate equipList to get individual items
          const pieces: any[] = [];
          let mainImageUrl = null;

          if (resolvedSuit.equipList && Array.isArray(resolvedSuit.equipList)) {
            for (const itemId of resolvedSuit.equipList) {
              // 6. Fetch Item Detail
              const itemDetailUrl = `${BASE_EQUIPMENT_ITEM_DETAIL_URL}/${itemId}.json`;
              try {
                const { data: itemDetail } = await axios.get(itemDetailUrl, {
                  headers: HEADERS,
                  timeout: 15000,
                });
                const resolvedItem = resolveIds(itemDetail, i18nMap);

                // Resolve Name
                let itemName = itemId;
                if (
                  resolvedItem.nameI18nId &&
                  i18nMap[resolvedItem.nameI18nId]
                ) {
                  itemName = i18nMap[resolvedItem.nameI18nId];
                } else if (resolvedItem.name?.text) {
                  itemName = resolvedItem.name.text;
                }

                // Image Logic
                const remoteUrl = `https://endfieldtools.dev/assets/images/endfield/itemicon/${itemId}.png`;
                const localIconUrl = await ImageDownloader.downloadAndSave(
                  remoteUrl,
                  'endfield',
                  'equipment',
                  `equip_${itemId}`,
                );

                // Use Body (or first item) as main suit image
                if (resolvedItem.partType === 'Body' || !mainImageUrl) {
                  mainImageUrl = localIconUrl;
                }

                pieces.push({
                  id: itemId,
                  name: itemName,
                  partType: resolvedItem.partType, // Body, Hand, EDC, etc.
                  description: resolvedItem.desc?.text || null,
                  imageUrl: localIconUrl,
                  rarity: resolvedItem.rarity,
                  metadata: {
                    ...resolvedItem,
                    originalId: itemId,
                  },
                });
              } catch (itemErr) {
                logger.error(`Failed to fetch item ${itemId}:`, itemErr);
              }
            }
          }

          const mappedItem = {
            gameId: game.id,
            name: suitName,
            type: 'Equipment', // User requested "Equipment"
            rarity: resolvedSuit.rarity || 4,
            description: setEffects.join('\n'), // e.g. "2pc: ... \n 4pc: ..."
            imageUrl: mainImageUrl, // Represents the set
            metadata: {
              ...resolvedSuit,
              suitId: suitId,
              setEffectCounts: resolvedSuit.setEffectCounts,
              setEffectSummaries: setEffects, // Store formatted strings separately
              // setEffects will now be preserved from ...resolvedSuit spread
              pieces: pieces,
              originalId: suitId, // Key for upserting the SUIT
            },
          };
          results.push(mappedItem);
        } catch (e) {
          logger.error(`Failed to process suit ${suitId}:`, e);
        }
      }

      return results;
    } catch (e) {
      logger.error('Failed to scrape Endfield equipment:', e);
      return [];
    }
  }

  async save(data: any[]) {
    logger.info(`Saving ${data.length} equipment items to database...`);

    const game = await prisma.game.findFirst({
      where: { slug: this.gameSlug },
    });

    if (!game) {
      throw new Error(`Game not found: ${this.gameSlug}`);
    }

    const existingItems = await prisma.item.findMany({
      where: { gameId: game.id, type: 'Equipment' },
      select: { id: true, metadata: true },
    });

    let createdCount = 0;
    let updatedCount = 0;

    for (const item of data) {
      if (!item.name) continue;

      const originalId = item.metadata?.originalId;
      if (!originalId) {
        logger.warn(`Skipping equipment without originalId: ${item.name}`);
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
            originalId: String(originalId), // 컬럼 동기화(B-H4b)
            rarity: item.rarity,
            description: item.description,
            imageUrl: item.imageUrl,
            metadata: item.metadata,
          },
        });
        createdCount++;
        logger.info(`Created equipment: ${item.name} (${originalId})`);
      } else {
        await prisma.item.update({
          where: { id: existing.id },
          data: {
            name: item.name,
            originalId: String(originalId), // 컬럼 동기화(B-H4b)
            rarity: item.rarity,
            description: item.description,
            imageUrl: item.imageUrl,
            metadata: item.metadata,
          },
        });
        updatedCount++;
        logger.info(`Updated equipment: ${item.name} (${originalId})`);
      }
    }

    logger.info(
      `Equipment Sync Complete. Created: ${createdCount}, Updated: ${updatedCount}`,
    );
  }
}
