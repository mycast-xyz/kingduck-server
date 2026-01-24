import { GenshinCharacterScraper } from './scrapers/genshin/character';
import { CharacterScraper as StarRailCharacterScraper } from './scrapers/starrail/CharacterScraper';
import { LightConeScraper as StarRailLightConeScraper } from './scrapers/starrail/LightConeScraper';
import { RelicScraper as StarRailRelicScraper } from './scrapers/starrail/RelicScraper';
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

  // LightCone (Temporarily disabled)
  // const srLCScraper = new StarRailLightConeScraper();
  // const srLCs = await srLCScraper.scrape();
  // TODO: Sync method for items/lightcones

  // Relic (Temporarily disabled)
  // const srRelicScraper = new StarRailRelicScraper();
  // const srRelics = await srRelicScraper.scrape();
  // TODO: Sync method for relics

  // Cleanup
  await browser.close();
  logger.info('=== Crawler Job Finished ===');
}

// Allow running directly
if (require.main === module) {
  runCrawlers().catch((e) => logger.error(e));
}

export default runCrawlers;
