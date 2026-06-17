import { axiosGetWithRetry } from '../../utils/httpRetry';
import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { ImageDownloader } from '../../utils/ImageDownloader';
import logger from '../../../utils/logger';
import { prisma } from '../../../utils/prisma';
import {
  BASE_LIST_URL,
  BASE_DETAIL_URL,
  HEADERS,
  getPortraitUrl,
  getSplashUrl,
  I18N_URLS,
  ELEMENT_MAP,
  WEAPON_MAP,
} from './utils';

export class EndfieldCharacterScraper extends ScraperBase {
  constructor() {
    super('endfield');
  }

  async scrape(options?: { limit?: number }): Promise<any[]> {
    logger.info('Starting Endfield Character scraping...');

    try {
      // 1. Ensure Game Exists
      let game = await prisma.game.findUnique({ where: { slug: 'endfield' } });
      if (!game) {
        logger.warn('Game "endfield" not found. Creating placeholder...');
        game = await prisma.game.create({
          data: {
            slug: 'endfield',
            name: '명일방주:엔드필드',
            iconUrl: 'http://localhost:3000/assets/logo/endfield.webp',
          },
        });
      }

      // 2. Fetch ALL I18n Maps
      logger.info('Fetching All KR Localization Maps...');
      const i18nMap: Record<string, string> = {};

      // Fetch in parallel
      const urls = Object.values(I18N_URLS);
      const responses = await Promise.all(
        urls.map((url) =>
          axiosGetWithRetry<any>(url, {
            headers: HEADERS,
            timeout: 15000,
          }).catch((e) => ({ data: {} })),
        ),
      );

      responses.forEach((res) => {
        if (res.data) {
          Object.assign(i18nMap, res.data);
        }
      });

      logger.info(
        `Localization maps merged. Total keys: ${Object.keys(i18nMap).length}`,
      );

      // Helper to recursively resolve IDs in objects
      const resolveIds = (obj: any): any => {
        if (!obj) return obj;

        if (Array.isArray(obj)) {
          return obj.map((item) => resolveIds(item));
        }

        if (typeof obj === 'object') {
          // Check for { id, text } pattern
          // Logic: if obj has 'id' and 'text', and 'id' is in map, update 'text'.
          if ('id' in obj && 'text' in obj && typeof obj.id === 'string') {
            if (i18nMap[obj.id]) {
              obj.text = i18nMap[obj.id];
              // We modify in place or return new object.
              // To be safe against side effects if shared refs exist (unlikely here), copy.
              return { ...obj, text: i18nMap[obj.id] };
            }
          }

          // Recursively process children
          const newObj: any = {};
          for (const key in obj) {
            newObj[key] = resolveIds(obj[key]);
          }
          return newObj;
        }

        return obj;
      };

      // 3. Sync Elements
      logger.info('Syncing Elements...');
      const elementIdMap: Record<string, number> = {};
      for (const [key, val] of Object.entries(ELEMENT_MAP)) {
        // Find or create element
        // Since Element model has name + type unique usually, or just name.
        // Schema has no unique constraint on name only, but logically we treat name as unique per game usually.
        // Check based on name + gameId
        let element = await prisma.element.findFirst({
          where: {
            gameId: game.id,
            name: val.name,
            type: 'DamageType',
          },
        });

        // Download Icon
        const remoteUrl = `https://endfieldtools.dev/assets/images/icons/${val.iconSlug}.webp`;
        const localIconUrl = await ImageDownloader.downloadAndSave(
          remoteUrl,
          'endfield',
          'element',
          `element_${val.iconSlug}`,
        );

        if (!element) {
          element = await prisma.element.create({
            data: {
              gameId: game.id,
              name: val.name,
              type: 'DamageType',
              iconUrl: localIconUrl,
            },
          });
          logger.info(`Created Element: ${val.name}`);
        } else if (localIconUrl && element.iconUrl !== localIconUrl) {
          // Update if exists but icon path differs (e.g. migrating remote -> local)
          // Or simply enforce local path
          await prisma.element.update({
            where: { id: element.id },
            data: { iconUrl: localIconUrl },
          });
          // Update the object reference
          element.iconUrl = localIconUrl;
        }
        elementIdMap[key] = element.id;
      }

      // 3.1 Sync Paths (Weapons as Paths)
      logger.info('Syncing Paths (Weapons)...');
      const pathIdMap: Record<string, number> = {};
      const uniqueWeapons = Array.from(new Set(Object.values(WEAPON_MAP)));

      for (const weaponName of uniqueWeapons) {
        let pathElement = await prisma.element.findFirst({
          where: {
            gameId: game.id,
            name: weaponName,
            type: 'Path',
          },
        });

        if (!pathElement) {
          pathElement = await prisma.element.create({
            data: {
              gameId: game.id,
              name: weaponName,
              type: 'Path',
              // iconUrl: ... (no icon provided yet)
            },
          });
          logger.info(`Created Path (Weapon): ${weaponName}`);
        }
        pathIdMap[weaponName] = pathElement.id;
      }

      // 4. Fetch Character List
      logger.info('Fetching Character List...');
      const { data: listData } = await axiosGetWithRetry<any>(BASE_LIST_URL, {
        headers: HEADERS,
        timeout: 15000,
      });
      let list = Object.values(listData);
      logger.info(`Found ${list.length} characters.`);

      if (options?.limit) {
        list = list.slice(0, options.limit);
      }

      const results: any[] = [];
      let processedCount = 0;

      for (const item of list) {
        processedCount++;
        const charItem = item as any;
        const charId = charItem.charId;

        // Resolve Name
        let name = charItem.engName;
        if (charItem.name && charItem.name.id && i18nMap[charItem.name.id]) {
          name = i18nMap[charItem.name.id];
        }

        logger.info(
          `[Endfield] Processing ${processedCount}/${list.length} (${name})...`,
        );

        try {
          const detailUrl = `${BASE_DETAIL_URL}/${charId}.json`;
          const { data: detail } = await axiosGetWithRetry<any>(detailUrl, {
            headers: HEADERS,
            timeout: 15000,
          });

          // Recursive resolve
          const resolvedDetail = resolveIds(detail);

          // Map Weapon
          let weaponType = resolvedDetail.weaponType;
          if (weaponType && WEAPON_MAP[String(weaponType).toUpperCase()]) {
            weaponType = WEAPON_MAP[String(weaponType).toUpperCase()];
          } else if (weaponType && WEAPON_MAP[String(weaponType)]) {
            weaponType = WEAPON_MAP[String(weaponType)];
          }

          // Map Element
          let elementId: number | null = null;
          const charTypeId = resolvedDetail.charTypeId; // e.g. "Cryst"
          if (charTypeId && elementIdMap[charTypeId]) {
            elementId = elementIdMap[charTypeId];
          }

          // Map Path (Weapon -> Path)
          let pathId: number | null = null;
          if (weaponType && pathIdMap[weaponType]) {
            pathId = pathIdMap[weaponType];
          }

          // Skill Icons Download
          const extractIconIds = (obj: any): string[] => {
            const icons: string[] = [];
            if (!obj) return icons;

            if (Array.isArray(obj)) {
              obj.forEach((item) => icons.push(...extractIconIds(item)));
            } else if (typeof obj === 'object') {
              if (obj.iconId && typeof obj.iconId === 'string') {
                icons.push(obj.iconId);
              }
              for (const key in obj) {
                icons.push(...extractIconIds(obj[key]));
              }
            }
            return icons;
          };

          const iconIds = extractIconIds(resolvedDetail);
          const uniqueIconIds = Array.from(new Set(iconIds)); // Deduplicate

          for (const iconId of uniqueIconIds) {
            if (!iconId) continue;
            // https://endfieldtools.dev/assets/images/endfield/skillicon/icon_talent_lastrite_01.png
            const remoteSkillUrl = `https://endfieldtools.dev/assets/images/endfield/skillicon/${iconId}.png`;
            await ImageDownloader.downloadAndSave(
              remoteSkillUrl,
              'endfield',
              'skill',
              iconId,
            );
          }

          // Download Images
          // Portrait Icon
          const remoteIconUrl = getPortraitUrl(charId);
          const localIconUrl = await ImageDownloader.downloadAndSave(
            remoteIconUrl,
            'endfield',
            'character',
            `icon_${charId}`,
          );

          // Splash Image
          const remoteSplashUrl = getSplashUrl(charId);
          const localSplashUrl = await ImageDownloader.downloadAndSave(
            remoteSplashUrl,
            'endfield',
            'character',
            `splash_${charId}`,
          );

          // Map Data
          const mappedItem = {
            gameId: game.id,
            name: name,
            rarity: resolvedDetail.rarity,
            role: resolvedDetail.profession,
            weaponType: weaponType,
            description: null,
            imageUrl: localIconUrl, // Use local path
            metadata: {
              ...resolvedDetail,
              cardImageUrl: localSplashUrl, // Use local path
              originalIconUrl: remoteIconUrl,
              originalSplashUrl: remoteSplashUrl,
              // 정규 식별자(다른 게임과 통일). 미설정 시 syncCharacters가 전부 skip된다. (B-H4b 선행)
              originalId: charId != null ? String(charId) : undefined,
            },
            elementId: elementId,
            pathId: pathId,
          };

          results.push(mappedItem);
        } catch (e) {
          logger.error(`Error fetching detail for ${name}:`, e);
        }
      }

      return results;
    } catch (e) {
      logger.error('Failed to scrape Endfield characters:', e);
      return [];
    }
  }

  async save(data: any[]) {
    logger.info(`Saving ${data.length} characters to database...`);

    const game = await prisma.game.findFirst({
      where: { slug: this.gameSlug },
    });

    if (!game) {
      throw new Error(`Game not found: ${this.gameSlug}`);
    }

    // Fetch all existing characters for checking duplicates via metadata
    const existingChars = await prisma.character.findMany({
      where: { gameId: game.id },
      select: { id: true, name: true, metadata: true },
    });

    let createdCount = 0;
    let updatedCount = 0;

    for (const item of data) {
      if (!item.name || !item.metadata || !item.metadata.charId) {
        logger.warn(`Skipping invalid item: ${JSON.stringify(item.name)}`);
        continue;
      }

      // Check if duplicate exists by metadata.charId
      const existing = existingChars.find((c) => {
        const meta = c.metadata as any;
        return meta && meta.charId === item.metadata.charId;
      });

      if (!existing) {
        await prisma.character.create({
          data: {
            gameId: game.id,
            name: item.name,
            rarity: item.rarity,
            role: item.role,
            weaponType: item.weaponType,
            description: item.description,
            imageUrl: item.imageUrl,
            metadata: item.metadata,
            elementId: item.elementId,
            pathId: item.pathId,
          },
        });
        createdCount++;
        logger.info(
          `Created character: ${item.name} (ID: ${item.metadata.charId})`,
        );
      } else {
        await prisma.character.update({
          where: { id: existing.id },
          data: {
            name: item.name, // Update name in case of localization change
            rarity: item.rarity,
            role: item.role,
            weaponType: item.weaponType,
            imageUrl: item.imageUrl,
            metadata: item.metadata,
            elementId: item.elementId,
            pathId: item.pathId,
          },
        });
        updatedCount++;
        logger.info(
          `Updated character: ${item.name} (ID: ${item.metadata.charId})`,
        );
      }
    }

    logger.info(
      `Save complete. Created: ${createdCount}, Updated: ${updatedCount}`,
    );
  }
}
