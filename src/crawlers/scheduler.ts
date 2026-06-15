import { GenshinCharacterScraper } from './scrapers/genshin/character';
import { CharacterScraper as StarRailCharacterScraper } from './scrapers/starrail/CharacterScraper';
import { LightConeScraper as StarRailLightConeScraper } from './scrapers/starrail/LightConeScraper';
import { RelicScraper as StarRailRelicScraper } from './scrapers/starrail/RelicScraper';
import { StarRailItemScraper } from './scrapers/starrail/ItemScraper';
import { EventScraper as StarRailEventScraper } from './scrapers/starrail/EventScraper';
import { RedeemCodeScraper as StarRailRedeemCodeScraper } from './scrapers/starrail/RedeemCodeScraper';
import { YoutubeShortsScraper } from './scrapers/starrail/YoutubeShortsScraper';
import { YoutubeShortsScraper as Reverse1999YoutubeShortsScraper } from './scrapers/reverse1999/YoutubeShortsScraper';
import { Reverse1999CharacterScraper } from './scrapers/reverse1999/CharacterScraper';
import { WutheringWavesCharacterScraper } from './scrapers/wutheringwaves/CharacterScraper';
import { WutheringWavesWeaponScraper } from './scrapers/wutheringwaves/WeaponScraper';
import { WutheringWavesEchoScraper } from './scrapers/wutheringwaves/EchoScraper';
import { WutheringWavesItemScraper } from './scrapers/wutheringwaves/ItemScraper';
import { RedeemCodeScraper as WutheringWavesRedeemCodeScraper } from './scrapers/wutheringwaves/RedeemCodeScraper';
import { YoutubeShortsScraper as WutheringWavesYoutubeShortsScraper } from './scrapers/wutheringwaves/YoutubeShortsScraper';
import { EndfieldCharacterScraper } from './scrapers/endfield/CharacterScraper';
import { EndfieldWeaponScraper } from './scrapers/endfield/WeaponScraper';
import { EndfieldEquipmentScraper } from './scrapers/endfield/EquipmentScraper';
import { EndfieldItemScraper } from './scrapers/endfield/ItemScraper';
import { EndfieldYoutubeShortsScraper } from './scrapers/endfield/YoutubeShortsScraper';
import { EventScraper as EndfieldEventScraper } from './scrapers/endfield/EventScraper';
import { DataSyncService } from './services/DataSyncService';
import { Browser } from './core/Browser';
import logger from '../utils/logger';
import { prisma } from '../utils/prisma';
import { CrawlerStatus } from '@prisma/client';

// Type definition for scraper task
export type ScraperTask = {
  game: string;
  type: string; // 'character', 'item', 'weapon', 'echo', 'video', etc.
  run: (syncService: DataSyncService) => Promise<number>;
};

// Define all tasks
export const CRAWLER_TASKS: ScraperTask[] = [
  // --- Genshin Impact ---
  // {
  //   game: 'genshin',
  //   type: 'character',
  //   run: async (s) => {
  //     const scraper = new GenshinCharacterScraper('genshin');
  //     const data = await scraper.scrape();
  //     if (data.length > 0) await s.syncCharacters('genshin', data);
  //   },
  // },

  // --- Honkai: Star Rail ---
  {
    game: 'starrail',
    type: 'character',
    run: async (s) => {
      const scraper = new StarRailCharacterScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await s.syncCharacters('starrail', data);
      return data.length;
    },
  },
  {
    game: 'starrail',
    type: 'item', // LightCone is technically an item
    run: async (s) => {
      const scraper = new StarRailLightConeScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await s.syncItems('starrail', data);
      return data.length;
    },
  },
  {
    game: 'starrail',
    type: 'relic',
    run: async (s) => {
      const scraper = new StarRailRelicScraper();
      const data = await scraper.scrape();
      return data ? data.length : 0;
    },
  },
  {
    game: 'starrail',
    type: 'item', // General Items
    run: async (s) => {
      const scraper = new StarRailItemScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await scraper.save(data);
      return data.length;
    },
  },
  {
    game: 'starrail',
    type: 'event',
    run: async (s) => {
      const scraper = new StarRailEventScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await scraper.save(data);
      return data.length;
    },
  },
  {
    game: 'starrail',
    type: 'redeem',
    run: async (s) => {
      const { prisma } = require('../utils/prisma');
      const scraper = new StarRailRedeemCodeScraper(prisma);
      const result = await scraper.scrape();
      return result ? result.codes.length : 0;
    },
  },
  {
    game: 'starrail',
    type: 'video',
    run: async (s) => {
      const scraper = new YoutubeShortsScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await s.syncVideos('starrail', data);
      return data.length;
    },
  },

  // --- Reverse: 1999 ---
  {
    game: 'reverse1999',
    type: 'character',
    run: async (s) => {
      const scraper = new Reverse1999CharacterScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await s.syncCharacters('reverse1999', data);
      return data.length;
    },
  },
  {
    game: 'reverse1999',
    type: 'video',
    run: async (s) => {
      const scraper = new Reverse1999YoutubeShortsScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await s.syncVideos('reverse1999', data);
      return data.length;
    },
  },

  // --- Wuthering Waves ---
  {
    game: 'wutheringwaves',
    type: 'character',
    run: async (s) => {
      const scraper = new WutheringWavesCharacterScraper();
      const data = await scraper.scrape({});
      if (data.length > 0) await scraper.save(data);
      return data.length;
    },
  },
  {
    game: 'wutheringwaves',
    type: 'weapon',
    run: async (s) => {
      const scraper = new WutheringWavesWeaponScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await scraper.save(data);
      return data.length;
    },
  },
  {
    game: 'wutheringwaves',
    type: 'echo',
    run: async (s) => {
      const scraper = new WutheringWavesEchoScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await scraper.save(data);
      return data.length;
    },
  },
  {
    game: 'wutheringwaves',
    type: 'item',
    run: async (s) => {
      const scraper = new WutheringWavesItemScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await s.syncItems('wutheringwaves', data);
      return data.length;
    },
  },
  {
    game: 'wutheringwaves',
    type: 'redeem',
    run: async (s) => {
      const { prisma } = require('../utils/prisma');
      const scraper = new WutheringWavesRedeemCodeScraper(prisma);
      const result = await scraper.scrape();
      return result ? result.codes.length : 0;
    },
  },
  {
    game: 'wutheringwaves',
    type: 'video',
    run: async (s) => {
      const scraper = new WutheringWavesYoutubeShortsScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await s.syncVideos('wutheringwaves', data);
      return data.length;
    },
  },

  // --- Arknights: Endfield ---
  {
    game: 'endfield',
    type: 'character',
    run: async (s) => {
      const scraper = new EndfieldCharacterScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await s.syncCharacters('endfield', data);
      return data.length;
    },
  },
  {
    game: 'endfield',
    type: 'weapon',
    run: async (s) => {
      const scraper = new EndfieldWeaponScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await scraper.save(data);
      return data.length;
    },
  },
  {
    game: 'endfield',
    type: 'equipment',
    run: async (s) => {
      const scraper = new EndfieldEquipmentScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await scraper.save(data);
      return data.length;
    },
  },
  {
    game: 'endfield',
    type: 'item',
    run: async (s) => {
      const scraper = new EndfieldItemScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await s.syncItems('endfield', data);
      return data.length;
    },
  },
  {
    game: 'endfield',
    type: 'video',
    run: async (s) => {
      const scraper = new EndfieldYoutubeShortsScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await s.syncVideos('endfield', data);
      return data.length;
    },
  },
  {
    game: 'endfield',
    type: 'event',
    run: async (s) => {
      const scraper = new EndfieldEventScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await scraper.save(data);
      return data.length;
    },
  },
];

async function runCrawlers() {
  logger.info('=== Crawler Job Started ===');

  // Parse arguments
  const args = process.argv.slice(2);
  let gameFilter: string | null = null;
  let typeFilter: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--game' && args[i + 1]) {
      gameFilter = args[i + 1].toLowerCase();
      i++;
    }
    if (args[i] === '--type' && args[i + 1]) {
      typeFilter = args[i + 1].toLowerCase();
      i++;
    }
  }

  if (gameFilter) logger.info(`Filter: Game = ${gameFilter}`);
  if (typeFilter) logger.info(`Filter: Type = ${typeFilter}`);

  const browser = Browser.getInstance();
  await browser.init();

  // browser.close()를 try/finally로 감싸 크롤 도중 throw가 발생해도
  // Chromium 좀비 프로세스가 쌓이지 않도록 한다.
  try {
    const syncService = new DataSyncService();

    // Execute tasks
    let taskCount = 0;
    for (const task of CRAWLER_TASKS) {
      if (gameFilter && task.game !== gameFilter) continue;
      if (typeFilter && task.type !== typeFilter) continue;

      logger.info(`>>> Running task: [${task.game}] ${task.type}`);
      try {
        // Find game ID for logging
        const game = await prisma.game.findUnique({
          where: { slug: task.game },
        });

        if (!game) {
          logger.error(`Game not found for task: ${task.game}`);
          continue;
        }

        // 중복 실행 방지 — 이미 RUNNING 상태인 크롤러는 스킵
        const existingRunning = await prisma.crawlerLog.findFirst({
          where: {
            gameId: game.id,
            crawlerType: task.type,
            status: CrawlerStatus.RUNNING,
          },
        });

        if (existingRunning) {
          logger.warn(
            `Task [${task.game}] ${task.type} is already running (log ID: ${existingRunning.id}), skipping.`,
          );
          continue;
        }

        // Create log entry (RUNNING)
        const crawlerLog = await prisma.crawlerLog.create({
          data: {
            gameId: game.id,
            crawlerType: task.type,
            status: CrawlerStatus.RUNNING,
            startTime: new Date(),
          },
        });

        try {
          const itemsFound = await task.run(syncService);

          // Update log entry (SUCCESS)
          await prisma.crawlerLog.update({
            where: { id: crawlerLog.id },
            data: {
              status: CrawlerStatus.SUCCESS,
              endTime: new Date(),
              itemsFound: itemsFound || 0,
            },
          });

          taskCount++;
        } catch (innerError) {
          logger.error(`Task [${task.game}] ${task.type} failed:`, innerError);

          // Update log entry (FAILED)
          await prisma.crawlerLog.update({
            where: { id: crawlerLog.id },
            data: {
              status: CrawlerStatus.FAILED,
              endTime: new Date(),
              errorMsg:
                innerError instanceof Error
                  ? innerError.message
                  : String(innerError),
            },
          });
        }
      } catch (e) {
        logger.error(`Failed to handle log/task [${task.game}] ${task.type}:`, e);
      }
    }

    if (taskCount === 0) {
      logger.warn('No tasks matched the filters or checks.');
    }
  } finally {
    // 정상 종료든 예외든 반드시 브라우저를 닫는다.
    await browser.close();
    logger.info('=== Crawler Job Finished ===');
  }
}

// Allow running directly
if (require.main === module) {
  runCrawlers().catch((e) => {
    logger.error('Crawler Job Failed', e);
    console.error('Crawler Job Failed:', e);
  });
}

export default runCrawlers;
