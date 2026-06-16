import { prisma } from '../../utils/prisma';
import { ScrapedData } from '../core/ScraperBase';
import logger from '../../utils/logger';

export class DataSyncService {
  /**
   * Find or create an Element by name and type
   */
  private async findOrCreateElement(
    gameId: number,
    name: string,
    type: string,
  ): Promise<number | null> {
    if (!name) return null;

    // NOTE: 완전한 중복 방지는 @@unique([gameId, name, type]) 제약이 필요합니다 (별도 마이그레이션).
    // 트랜잭션으로 find→create 경쟁 창을 줄입니다.
    return await prisma.$transaction(async (tx) => {
      // Try to find existing element
      const existing = await tx.element.findFirst({
        where: {
          gameId,
          name: { equals: name, mode: 'insensitive' },
          type,
        },
      });

      if (existing) {
        return existing.id;
      }

      // Create new element
      const newElement = await tx.element.create({
        data: {
          gameId,
          name,
          type,
        },
      });

      logger.info(`Created new ${type}: ${name}`);
      return newElement.id;
    });
  }

  public async syncCharacters(gameSlug: string, data: ScrapedData[]) {
    logger.info(`Syncing ${data.length} characters for ${gameSlug}...`);

    // Validating game exists
    const game = await prisma.game.findUnique({ where: { slug: gameSlug } });
    if (!game) {
      logger.error(`Game ${gameSlug} not found!`);
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    // Upsert each character
    for (const item of data) {
      try {
        const originalId = item.metadata?.originalId;
        if (!originalId) {
          logger.warn(`Character ${item.name} has no originalId, skipping...`);
          continue;
        }

        // Find or create Element (DamageType)
        const elementId = await this.findOrCreateElement(
          game.id,
          item.metadata?.element,
          'DamageType',
        );

        // Find or create Path (BaseType)
        const pathId = await this.findOrCreateElement(
          game.id,
          item.metadata?.path,
          'Path',
        );

        // Check if character already exists by originalId in metadata
        const existing = await prisma.character.findFirst({
          where: {
            gameId: game.id,
            metadata: {
              path: ['originalId'],
              equals: originalId,
            },
          },
        });

        if (existing) {
          // Update existing character
          await prisma.character.update({
            where: { id: existing.id },
            data: {
              name: item.name,
              rarity: item.rarity,
              weaponType: item.weaponType,
              role: item.role,
              description: item.description,
              imageUrl: item.imageUrl,
              elementId,
              pathId,
              metadata: item.metadata,
              updatedAt: new Date(),
            },
          });
          logger.info(`Updated character: ${item.name} (ID: ${originalId})`);
        } else {
          // Create new character
          await prisma.character.create({
            data: {
              gameId: game.id,
              name: item.name,
              rarity: item.rarity,
              weaponType: item.weaponType,
              role: item.role,
              description: item.description,
              imageUrl: item.imageUrl,
              elementId,
              pathId,
              metadata: item.metadata,
            },
          });
          logger.info(`Created character: ${item.name} (ID: ${originalId})`);
        }
        successCount++;
      } catch (err) {
        logger.error(`Failed to sync character ${item.name}:`, err);
        errorCount++;
      }
    }

    logger.info(
      `Sync complete for ${gameSlug}. Success: ${successCount}, Errors: ${errorCount}`,
    );
  }

  /**
   * Sync items (Lightcones, Relics, Materials etc)
   */
  public async syncItems(gameSlug: string, data: ScrapedData[]) {
    logger.info(`Syncing ${data.length} items for ${gameSlug}...`);

    const game = await prisma.game.findUnique({ where: { slug: gameSlug } });
    if (!game) {
      logger.error(`Game ${gameSlug} not found!`);
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const dataItem of data) {
      try {
        const originalId = dataItem.metadata?.originalId;
        if (!originalId) {
          logger.warn(`Item ${dataItem.name} has no originalId, skipping...`);
          continue;
        }

        // Check if item already exists by originalId in metadata
        const existing = await prisma.item.findFirst({
          where: {
            gameId: game.id,
            metadata: {
              path: ['originalId'],
              equals: originalId,
            },
          },
        });

        // Item.type 컬럼은 String. 일부 게임(엔드필드)은 metadata.type이 숫자(예: 8)라
        // 그대로 넣으면 Prisma가 거부한다. 항상 문자열로 강제(0도 'Unknown'으로 오인 않도록 ??).
        const itemType = String(dataItem.metadata?.type ?? 'Unknown');

        if (existing) {
          await prisma.item.update({
            where: { id: existing.id },
            data: {
              name: dataItem.name,
              type: itemType,
              rarity: dataItem.rarity || dataItem.metadata?.rarity,
              description:
                dataItem.description || dataItem.metadata?.description,
              imageUrl: dataItem.imageUrl,
              metadata: dataItem.metadata,
              updatedAt: new Date(),
            },
          });
          logger.info(
            `Updated item: [${itemType}] ${dataItem.name} (ID: ${originalId})`,
          );
        } else {
          await prisma.item.create({
            data: {
              gameId: game.id,
              name: dataItem.name,
              type: itemType,
              rarity: dataItem.rarity || dataItem.metadata?.rarity,
              description:
                dataItem.description || dataItem.metadata?.description,
              imageUrl: dataItem.imageUrl,
              metadata: dataItem.metadata,
            },
          });
          logger.info(
            `Created item: [${itemType}] ${dataItem.name} (ID: ${originalId})`,
          );
        }
        successCount++;
      } catch (err) {
        logger.error(`Failed to sync item ${dataItem.name}:`, err);
        errorCount++;
      }
    }

    logger.info(
      `Sync complete for ${gameSlug} items. Success: ${successCount}, Errors: ${errorCount}`,
    );
  }

  /**
   * Sync YouTube Shorts videos
   */
  public async syncVideos(gameSlug: string, data: ScrapedData[]) {
    logger.info(`Syncing ${data.length} videos for ${gameSlug}...`);

    const game = await prisma.game.findUnique({ where: { slug: gameSlug } });
    if (!game) {
      logger.error(`Game ${gameSlug} not found!`);
      return;
    }

    const YoutubeUtils = (await import('../../utils/youtubeUtils')).default;
    const path = await import('path');
    const fs = await import('fs');

    let successCount = 0;
    let errorCount = 0;

    for (const item of data) {
      try {
        const { title, url, thumbnailUrl, characterName, type } = item;
        logger.info(
          `Processing video: ${title} (Matched Character: ${characterName})`,
        );

        // Check if video already exists
        const existingVideo = await prisma.video.findUnique({
          where: { url },
        });

        // Check if video already exists with any valid extension
        const hasLocalFile =
          existingVideo &&
          existingVideo.localPath &&
          (existingVideo.localPath.endsWith('.webm') ||
            existingVideo.localPath.endsWith('.mp4'));

        if (existingVideo && hasLocalFile) {
          logger.debug(
            `Skipping video (already exists and downloaded): ${title}`,
          );
          continue;
        }

        // Find character
        let character = null;
        if (characterName) {
          character = await prisma.character.findFirst({
            where: {
              gameId: game.id,
              name: {
                contains: characterName,
                mode: 'insensitive',
              },
            },
          });
        }

        // Upsert video
        const video = await prisma.video.upsert({
          where: { url },
          create: {
            gameId: game.id,
            characterId: character?.id,
            title,
            url,
            thumbnailUrl,
            type: type || 'KeyVisual',
          },
          update: {
            title,
            thumbnailUrl,
            characterId: character?.id,
            type: type || 'KeyVisual',
          },
        });
        logger.info(
          `Upserted video: ID ${video.id}, Title: "${video.title}" (URL: ${url})`,
        );

        // Download video if no valid local file exists
        const currentFileExists =
          video.localPath &&
          (video.localPath.endsWith('.webm') ||
            video.localPath.endsWith('.mp4'));

        if (!currentFileExists) {
          const videoId = url.split('/').pop() || '';
          if (videoId) {
            try {
              const extension = await YoutubeUtils.downloadVideoById(videoId);
              if (extension) {
                const videoDir = path.join(__dirname, '../../../static/video/');
                const files = fs.readdirSync(videoDir);
                const downloadedFile = files.find(
                  (f: string) =>
                    f.startsWith(videoId) && f.endsWith(`.${extension}`),
                );

                if (downloadedFile) {
                  const localPath = `assets/video/${downloadedFile}`;
                  await prisma.video.update({
                    where: { id: video.id },
                    data: { localPath },
                  });
                  logger.info(
                    `Downloaded video (${extension}): ${downloadedFile}`,
                  );
                }
              } else {
                logger.warn(`Failed to download video: ${videoId}`);
              }
            } catch (downloadErr) {
              logger.error(
                `Error during download for video ${videoId}:`,
                downloadErr,
              );
              // Continue to next video even if download fails
            }
          }
        }

        successCount++;
      } catch (err) {
        logger.error(`Failed to sync video record for ${item.title}:`, err);
        errorCount++;
      }
    }

    logger.info(
      `Sync complete. Success: ${successCount}, Errors: ${errorCount}`,
    );
  }
}
