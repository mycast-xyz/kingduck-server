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

    // Try to find existing element
    const existing = await prisma.element.findFirst({
      where: {
        gameId,
        name,
        type,
      },
    });

    if (existing) {
      return existing.id;
    }

    // Create new element
    const newElement = await prisma.element.create({
      data: {
        gameId,
        name,
        type,
      },
    });

    logger.info(`Created new ${type}: ${name}`);
    return newElement.id;
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
}
