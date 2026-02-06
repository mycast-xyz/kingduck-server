import fs from 'fs';
import path from 'path';
import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import logger from '../../../utils/logger';
import { prisma } from '../../../utils/prisma';
import { EventType } from '@prisma/client';

interface ParsedEvent {
  title: string;
  type: 'GACHA' | 'MAINTENANCE' | 'EVENT';
  startTime: string; // Can be date string, 'UPDATE_AFTER', or 'UNKNOWN'
  endTime: string;
  officialLink: string;
  targetId?: string; // Optional, from parsed_updates.json
  metadata: {
    original_subject: string;
    description: string;
    source_id: string;
    content?: string;
    full_content?: string;
    weapons?: {
      rarity5: string[];
      rarity4: string[];
    };
    characters?: {
      rarity5: string[];
      rarity4: string[];
    };
  };
}

export class EventScraper extends ScraperBase {
  private readonly PARSED_EVENTS_PATH = path.join(
    process.cwd(),
    'data',
    'crawlers',
    'wutheringwaves',
    'parsed_events.json',
  );

  private readonly PARSED_UPDATES_PATH = path.join(
    process.cwd(),
    'data',
    'crawlers',
    'wutheringwaves',
    'parsed_updates.json',
  );

  constructor() {
    super('wutheringwaves');
  }

  async scrape(): Promise<ScrapedData[]> {
    logger.info('Starting Wuthering Waves Event scraping...');

    // Get Game ID
    const game = await prisma.game.findUnique({
      where: { slug: this.gameSlug },
    });

    if (!game) {
      logger.error(`Game ${this.gameSlug} not found in database.`);
      return [];
    }

    const results: ScrapedData[] = [];

    try {
      // Read parsed events from JSON file
      if (!fs.existsSync(this.PARSED_EVENTS_PATH)) {
        logger.error(
          `Parsed events file not found: ${this.PARSED_EVENTS_PATH}`,
        );
        logger.info('Please run: npx tsx scripts/parse_wuthering_events.ts');
        return [];
      }

      const rawData = fs.readFileSync(this.PARSED_EVENTS_PATH, 'utf-8');
      const events: ParsedEvent[] = JSON.parse(rawData);

      logger.info(`Loaded ${events.length} parsed events from file.`);

      for (const event of events) {
        // Process each event and save to database
        await this.processEvent(event, game.id);

        results.push({
          name: event.title,
          sourceUrl: event.officialLink,
          metadata: event.metadata,
        });
      }

      logger.info(
        `Processed ${results.length} events from parsed_events.json.`,
      );
    } catch (err) {
      logger.error('Error during scraping parsed_events.json', err);
    }

    // Also process parsed_updates.json
    try {
      if (!fs.existsSync(this.PARSED_UPDATES_PATH)) {
        logger.warn(
          `Parsed updates file not found: ${this.PARSED_UPDATES_PATH}`,
        );
        logger.info(
          'Run: npx tsx scripts/parse_wuthering_updates.ts to generate it',
        );
      } else {
        const rawUpdateData = fs.readFileSync(
          this.PARSED_UPDATES_PATH,
          'utf-8',
        );
        const updateEvents: ParsedEvent[] = JSON.parse(rawUpdateData);

        logger.info(
          `Loaded ${updateEvents.length} parsed update events from file.`,
        );

        for (const event of updateEvents) {
          await this.processEvent(event, game.id);

          results.push({
            name: event.title,
            sourceUrl: event.officialLink,
            metadata: event.metadata,
          });
        }

        logger.info(
          `Processed ${updateEvents.length} update events successfully.`,
        );
      }
    } catch (err) {
      logger.error('Error during scraping parsed_updates.json', err);
    }

    return results;
  }

  private async processEvent(event: ParsedEvent, gameId: number) {
    // Map event type
    let eventType: EventType;
    if (event.type === 'GACHA') {
      eventType = EventType.GACHA;
    } else if (event.type === 'MAINTENANCE') {
      eventType = EventType.MAINTENANCE;
    } else if (event.type === 'EVENT') {
      eventType = EventType.EVENT;
    } else {
      logger.warn(`Unknown event type: ${event.type}, skipping.`);
      return;
    }

    // Parse dates
    let startTime: Date | null = null;
    let endTime: Date | null = null;

    // Handle startTime
    if (event.startTime === 'UPDATE_AFTER') {
      // Use a default start time or skip
      // For now, we'll use the current date as fallback
      startTime = new Date();
      logger.warn(
        `Event "${event.title}" has UPDATE_AFTER start time, using current date as fallback.`,
      );
    } else if (event.startTime === 'UNKNOWN') {
      logger.warn(`Event "${event.title}" has UNKNOWN start time, skipping.`);
      return;
    } else {
      startTime = new Date(event.startTime);
    }

    // Handle endTime
    if (event.endTime === 'UNKNOWN') {
      logger.warn(
        `Event "${event.title}" has UNKNOWN end time, setting to null.`,
      );
      endTime = null;
    } else {
      endTime = new Date(event.endTime);
    }

    // Validate dates
    if (startTime && isNaN(startTime.getTime())) {
      logger.error(`Invalid start time for event: ${event.title}`);
      return;
    }
    if (endTime && isNaN(endTime.getTime())) {
      logger.warn(
        `Invalid end time for event: ${event.title}, setting to null.`,
      );
      endTime = null;
    }

    // Create metadata for database
    const metadata: any = {
      original_subject: event.metadata.original_subject,
      description: event.metadata.description,
      source_id: event.metadata.source_id,
    };

    // Add content if available (truncate for safety)
    if (event.metadata.content) {
      metadata.content = event.metadata.content.substring(0, 5000);
    }

    // Add full_content for update events
    if (event.metadata.full_content) {
      metadata.full_content = event.metadata.full_content.substring(0, 5000);
    }

    // Add weapons for GACHA events
    if (event.type === 'GACHA' && event.metadata.weapons) {
      metadata.weapons = {
        rarity5: event.metadata.weapons.rarity5,
        rarity4: event.metadata.weapons.rarity4,
      };
    }

    // Add characters for GACHA events
    if (event.type === 'GACHA' && event.metadata.characters) {
      metadata.characters = {
        rarity5: event.metadata.characters.rarity5,
        rarity4: event.metadata.characters.rarity4,
      };
    }

    // Use targetId from event if available, otherwise use source_id
    const targetId = event.targetId || event.metadata.source_id;

    // Upsert to database
    await this.upsertEvent({
      gameId,
      type: eventType,
      title: event.title,
      startTime: startTime!,
      endTime,
      officialLink: event.officialLink,
      targetId,
      metadata,
    });
  }

  private async upsertEvent(data: {
    gameId: number;
    type: EventType;
    title: string;
    startTime: Date;
    endTime: Date | null;
    officialLink: string;
    targetId: string;
    metadata: any;
  }) {
    const existing = await prisma.calendarEvent.findFirst({
      where: {
        gameId: data.gameId,
        targetId: data.targetId,
        type: data.type,
      },
    });

    if (existing) {
      await prisma.calendarEvent.update({
        where: { id: existing.id },
        data: {
          title: data.title,
          startTime: data.startTime,
          endTime: data.endTime,
          officialLink: data.officialLink,
          metadata: data.metadata,
        },
      });
      logger.info(`Updated event: ${data.title}`);
    } else {
      await prisma.calendarEvent.create({
        data: {
          gameId: data.gameId,
          type: data.type,
          title: data.title,
          startTime: data.startTime,
          endTime: data.endTime,
          officialLink: data.officialLink,
          targetId: data.targetId,
          metadata: data.metadata,
        },
      });
      logger.info(`Created event: ${data.title}`);
    }
  }

  async save(data: ScrapedData[]) {
    const outputDir = path.join(
      process.cwd(),
      'data',
      'crawlers',
      'wutheringwaves',
    );
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const filePath = path.join(outputDir, 'events.json');
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    logger.info(`Saved ${data.length} events to ${filePath}`);
  }
}
