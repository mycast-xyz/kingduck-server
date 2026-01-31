import { GenshinCharacterScraper } from './scrapers/genshin/character';
import { CharacterScraper as StarRailCharacterScraper } from './scrapers/starrail/CharacterScraper';
import { LightConeScraper as StarRailLightConeScraper } from './scrapers/starrail/LightConeScraper';
import { RelicScraper as StarRailRelicScraper } from './scrapers/starrail/RelicScraper';
import { StarRailItemScraper } from './scrapers/starrail/ItemScraper';
import { YoutubeShortsScraper } from './scrapers/starrail/YoutubeShortsScraper';
import { YoutubeShortsScraper as Reverse1999YoutubeShortsScraper } from './scrapers/reverse1999/YoutubeShortsScraper';
import { Reverse1999CharacterScraper } from './scrapers/reverse1999/CharacterScraper';
import { WutheringWavesCharacterScraper } from './scrapers/wutheringwaves/CharacterScraper';
import { WutheringWavesWeaponScraper } from './scrapers/wutheringwaves/WeaponScraper';
import { WutheringWavesEchoScraper } from './scrapers/wutheringwaves/EchoScraper';
import { WutheringWavesItemScraper } from './scrapers/wutheringwaves/ItemScraper';
import { DataSyncService } from './services/DataSyncService';
import { Browser } from './core/Browser';
import logger from '../utils/logger';

// Type definition for scraper task
type ScraperTask = {
  game: string;
  type: string; // 'character', 'item', 'weapon', 'echo', 'video', etc.
  run: (syncService: DataSyncService) => Promise<void>;
};

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

  const syncService = new DataSyncService();

  // Define all tasks
  const tasks: ScraperTask[] = [
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

    /*
    // --- Honkai: Star Rail ---
    {
      game: 'starrail',
      type: 'character',
      run: async (s) => {
        const scraper = new StarRailCharacterScraper();
        const data = await scraper.scrape();
        if (data.length > 0) await s.syncCharacters('starrail', data);
      },
    },
    {
      game: 'starrail',
      type: 'item', // LightCone is technically an item
      run: async (s) => {
        const scraper = new StarRailLightConeScraper();
        const data = await scraper.scrape();
        if (data.length > 0) await s.syncItems('starrail', data);
      },
    },
    {
      game: 'starrail',
      type: 'relic',
      run: async (s) => {
        const scraper = new StarRailRelicScraper();
        await scraper.scrape();
        // Item sync logic for relics is pending or inside scraper?
        // Original code had no sync call for relics
      },
    },
    {
      game: 'starrail',
      type: 'item', // General Items
      run: async (s) => {
        const scraper = new StarRailItemScraper();
        const data = await scraper.scrape();
        if (data.length > 0) {
          await scraper.save(data);
        }
      },
    },
    {
      game: 'starrail',
      type: 'video',
      run: async (s) => {
        const scraper = new YoutubeShortsScraper();
        const data = await scraper.scrape();
        if (data.length > 0) await s.syncVideos('starrail', data);
      },
    },
    */

    /*
    // --- Reverse: 1999 ---
    {
      game: 'reverse1999',
      type: 'character',
      run: async (s) => {
        const scraper = new Reverse1999CharacterScraper();
        const data = await scraper.scrape();
        if (data.length > 0) await s.syncCharacters('reverse1999', data);
      },
    },
    {
      game: 'reverse1999',
      type: 'video',
      run: async (s) => {
        const scraper = new Reverse1999YoutubeShortsScraper();
        const data = await scraper.scrape();
        if (data.length > 0) await s.syncVideos('reverse1999', data);
      },
    },
    */

    // --- Wuthering Waves ---
    {
      game: 'wutheringwaves',
      type: 'character',
      run: async (s) => {
        const scraper = new WutheringWavesCharacterScraper();
        const data = await scraper.scrape({});
        if (data.length > 0) await scraper.save(data);
      },
    },
    {
      game: 'wutheringwaves',
      type: 'weapon',
      run: async (s) => {
        const scraper = new WutheringWavesWeaponScraper();
        const data = await scraper.scrape();
        if (data.length > 0) await scraper.save(data);
      },
    },
    {
      game: 'wutheringwaves',
      type: 'echo',
      run: async (s) => {
        const scraper = new WutheringWavesEchoScraper();
        const data = await scraper.scrape();
        if (data.length > 0) await scraper.save(data);
      },
    },
    {
      game: 'wutheringwaves',
      type: 'item',
      run: async (s) => {
        const scraper = new WutheringWavesItemScraper();
        const data = await scraper.scrape();
        if (data.length > 0) await s.syncItems('wutheringwaves', data);
      },
    },
  ];

  // Execute tasks
  let taskCount = 0;
  for (const task of tasks) {
    if (gameFilter && task.game !== gameFilter) continue;
    if (typeFilter && task.type !== typeFilter) continue;

    logger.info(`>>> Running task: [${task.game}] ${task.type}`);
    try {
      await task.run(syncService);
      taskCount++;
    } catch (e) {
      logger.error(`Task [${task.game}] ${task.type} failed:`, e);
    }
  }

  if (taskCount === 0) {
    logger.warn('No tasks matched the filters or checks.');
  }

  // Cleanup
  await browser.close();
  logger.info('=== Crawler Job Finished ===');
}

// Allow running directly
if (require.main === module) {
  runCrawlers().catch((e) => {
    logger.error('Crawler Job Failed', e);
    console.error('Crawler Job Failed:', e);
  });
}

export default runCrawlers;
