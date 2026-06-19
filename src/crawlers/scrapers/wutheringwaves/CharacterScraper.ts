import { axiosGetWithRetry } from '../../utils/httpRetry';
import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import logger from '../../../utils/logger';
import { BASE_API_URL } from './utils';
import { WutheringWavesDownloader } from '../../utils/WutheringWavesDownloader';
import { prisma } from '../../../utils/prisma';
import { crawlProgress } from '../../crawlProgress';

export class WutheringWavesCharacterScraper extends ScraperBase {
  constructor() {
    super('wutheringwaves');
  }

  // Recursively traverse and process
  private async processDeep(obj: any): Promise<any> {
    if (Array.isArray(obj)) {
      return Promise.all(obj.map((item) => this.processDeep(item)));
    } else if (typeof obj === 'object' && obj !== null) {
      const newObj: any = {};
      for (const key in obj) {
        if (key === 'Words') continue; // Skip Words key

        const val = obj[key];
        if (
          typeof val === 'string' &&
          (val.startsWith('http') ||
            val.startsWith('/Game/') ||
            val.match(/\.(png|jpg|jpeg|mp4)$/))
        ) {
          newObj[key] = await WutheringWavesDownloader.downloadAsset(val);
        } else {
          newObj[key] = await this.processDeep(val);
        }
      }
      return newObj;
    }
    return obj;
  }

  async scrape(options?: { limit?: number }): Promise<any[]> {
    logger.info(
      'Starting Wuthering Waves Character scraping (Full Data Mode)...',
    );
    try {
      // 1. DB Sync Prerequisites
      // Ensure Game Exists
      let game = await prisma.game.findUnique({
        where: { slug: 'wutheringwaves' },
      });

      if (!game) {
        logger.info('Creating Game: wutheringwaves');
        game = await prisma.game.create({
          data: {
            slug: 'wutheringwaves',
            name: 'Wuthering Waves',
            iconUrl: '',
          },
        });
      }
      const gameId = game.id;

      // 2. Get List from API
      const { data } = await axiosGetWithRetry<any>(
        `${BASE_API_URL}/character`,
        { timeout: 15000 },
      );
      let list = data.roleList || [];

      if (options?.limit) {
        list = list.slice(0, options.limit);
        logger.info(`Limiting to ${options.limit} characters for testing.`);
      }

      const results: any[] = [];

      let processedCount = 0;
      const totalCount = list.length;

      for (const item of list) {
        if (crawlProgress.shouldStop()) break; // 사용자 중단 요청
        crawlProgress.report(processedCount, totalCount, item.Name);
        processedCount++;
        logger.info(
          `[WW-Char] Processing character ${processedCount}/${totalCount} (${item.Name}) - ${((processedCount / totalCount) * 100).toFixed(1)}%`,
        );

        try {
          // 3. Fetch Detail
          // Note: The list item ID key might be 'Id' or 'id' depending on API consistentcy.
          // In previous check it was `item.Id`.
          const { data: detailData } = await axiosGetWithRetry<any>(
            `${BASE_API_URL}/character/${item.Id}`,
            { timeout: 15000 },
          );

          if (!detailData) {
            logger.warn(`No detail data for ${item.Name} (${item.Id})`);
            continue;
          }

          const processedData = await this.processDeep(detailData);

          // 4. DB Sync for Element (using refined logic)
          // ElementName logic
          let elementId: number | null = null;
          if (processedData.ElementName) {
            const elName = processedData.ElementName;
            let element = await prisma.element.findFirst({
              where: { gameId: gameId, type: 'element', name: elName },
            });
            if (!element) {
              element = await prisma.element.create({
                data: {
                  gameId: gameId,
                  type: 'element',
                  name: elName,
                  iconUrl: processedData.ElementIcon,
                },
              });
            }
            elementId = element.id;
          }

          // 5. DB Sync for Path (Weapon)
          let pathId: number | null = null;
          if (processedData.WeaponTypeName) {
            const wpName = processedData.WeaponTypeName;
            let weaponEl = await prisma.element.findFirst({
              where: { gameId: gameId, type: 'weapon', name: wpName },
            });
            if (!weaponEl) {
              weaponEl = await prisma.element.create({
                data: {
                  gameId: gameId,
                  type: 'weapon',
                  name: wpName,
                  iconUrl: processedData.WeaponTypeIcon,
                },
              });
            }
            pathId = weaponEl.id;
          }

          // 6. Map to Final Structure
          const mappedItem = {
            gameId: gameId,
            elementId: elementId,
            pathId: pathId,
            name:
              processedData.Name?.Content ||
              processedData.name?.Content ||
              item.Name,
            rarity: processedData.QualityId,
            weaponType: processedData.WeaponTypeName,
            role: null,
            description: processedData.Introduction?.Content,
            imageUrl:
              processedData.FormationRoleCard || processedData.RoleHeadIconBig,
            metadata: {
              ...processedData,
              cardImageUrl: processedData.RolePortrait,
              // 정규 식별자(다른 게임과 통일). WW는 게임 내 캐릭터 Id를 사용. (B-H4b 선행)
              originalId:
                processedData.Id != null
                  ? String(processedData.Id)
                  : item.Id != null
                    ? String(item.Id)
                    : undefined,
            },
          };

          results.push(mappedItem);
          // logger.info(`Processed and mapped character: ${item.Name}`); // Removed to avoid duplicate logging
        } catch (charError) {
          logger.error(`Error processing character ${item.Id}:`, charError);
        }
      }

      return results;
    } catch (error) {
      logger.error('Failed to scrape Wuthering Waves characters:', error);
      return [];
    }
  }

  async save(data: any[]) {
    logger.info(`Saving ${data.length} characters to database...`);
    let createdCount = 0;
    let updatedCount = 0;

    for (const item of data) {
      try {
        // 1. Duplicate Check
        const existing = await prisma.character.findFirst({
          where: {
            gameId: item.gameId,
            name: item.name,
            elementId: item.elementId,
            pathId: item.pathId,
            rarity: item.rarity,
          },
        });

        if (!existing) {
          // 2. Insert New
          await prisma.character.create({
            data: {
              gameId: item.gameId,
              elementId: item.elementId,
              pathId: item.pathId,
              name: item.name,
              rarity: item.rarity,
              weaponType: item.weaponType,
              role: item.role,
              description: item.description,
              imageUrl: item.imageUrl,
              metadata: item.metadata,
            },
          });
          createdCount++;
          logger.info(`Created new character: ${item.name}`);
        } else {
          // 3. Update 'Skins' Only
          logger.info(`Duplicate found for ${item.name}. Updating Skins...`);

          const existingMeta = (existing.metadata as any) || {};
          const newMeta = (item.metadata as any) || {};

          if (newMeta.Skins) {
            existingMeta.Skins = newMeta.Skins;
          }

          await prisma.character.update({
            where: { id: existing.id },
            data: {
              metadata: existingMeta,
            },
          });
          updatedCount++;
        }
      } catch (e) {
        logger.error(`Failed to save character ${item.name}:`, e);
      }
    }
  }
}
