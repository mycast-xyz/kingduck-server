import { GenshinCharacterScraper } from './scrapers/genshin/character';
import { CharacterScraper as StarRailCharacterScraper } from './scrapers/starrail/CharacterScraper';
import { LightConeScraper as StarRailLightConeScraper } from './scrapers/starrail/LightConeScraper';
import { RelicScraper as StarRailRelicScraper } from './scrapers/starrail/RelicScraper';
import { YoutubeShortsScraper } from './scrapers/starrail/YoutubeShortsScraper';
import { YoutubeShortsScraper as Reverse1999YoutubeShortsScraper } from './scrapers/reverse1999/YoutubeShortsScraper';
import { Reverse1999CharacterScraper } from './scrapers/reverse1999/CharacterScraper';
import { DataSyncService } from './services/DataSyncService';
import { Browser } from './core/Browser';
import logger from '../utils/logger';

async function runCrawlers() {
  logger.info('=== Crawler Job Started ===');

  const browser = Browser.getInstance();
  await browser.init();

  const syncService = new DataSyncService();

  // 1. Genshin Impact
  const genshinScraper = new GenshinCharacterScraper('genshin');
  const genshinData = await genshinScraper.scrape();
  if (genshinData.length > 0) {
    await syncService.syncCharacters('genshin', genshinData);
  }

  // 2. Honkai: Star Rail (API Mode)
  // Character
  const srCharScraper = new StarRailCharacterScraper();
  const srChars = await srCharScraper.scrape();
  if (srChars.length > 0) await syncService.syncCharacters('starrail', srChars);

  // LightCone (API Mode)
  const srLCScraper = new StarRailLightConeScraper();
  const srLCs = await srLCScraper.scrape();
  if (srLCs.length > 0) await syncService.syncItems('starrail', srLCs);

  // Relic (Temporarily disabled)
  const srRelicScraper = new StarRailRelicScraper();
  const srRelics = await srRelicScraper.scrape();
  // TODO: Sync method for relics

  // YouTube Shorts (API Mode)
  const youtubeScraper = new YoutubeShortsScraper();
  const youtubeData = await youtubeScraper.scrape();
  if (youtubeData.length > 0) {
    await syncService.syncVideos('starrail', youtubeData);
  }

  // 4. Reverse: 1999
  const reverseScraper = new Reverse1999CharacterScraper();
  // We can pass limit/options in valid implementation, but interface doesn't strictly support it in all scrapers yet.
  // The implementation supports it, but ScraperBase definition is scrape().
  // We'll call it without args for full crawl.
  const reverseData = await reverseScraper.scrape();
  if (reverseData.length > 0) {
    await syncService.syncCharacters('reverse1999', reverseData);
  }

  // 5. Reverse: 1999 YouTube Shorts (API Mode)
  const reverse1999YoutubeScraper = new Reverse1999YoutubeShortsScraper();
  const reverse1999YoutubeData = await reverse1999YoutubeScraper.scrape();
  if (reverse1999YoutubeData.length > 0) {
    await syncService.syncVideos('reverse1999', reverse1999YoutubeData);
  }

  // Cleanup
  await browser.close();
  logger.info('=== Crawler Job Finished ===');
}

// Allow running directly
if (require.main === module) {
  runCrawlers().catch((e) => logger.error(e));
}

export default runCrawlers;
