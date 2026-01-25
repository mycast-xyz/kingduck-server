import 'dotenv/config';
import { Reverse1999CharacterScraper } from '../src/crawlers/scrapers/reverse1999/CharacterScraper';
import { DataSyncService } from '../src/crawlers/services/DataSyncService';
import logger from '../src/utils/logger';

async function main() {
  logger.info('=== Starting Full Reverse: 1999 Sync ===');

  const scraper = new Reverse1999CharacterScraper();

  // No options passed -> Scrapes ALL characters
  logger.info('Starting character scraping...');
  const data = await scraper.scrape();

  logger.info(`Scraped ${data.length} characters.`);

  if (data.length === 0) {
    logger.warn('No characters were scraped. Exiting.');
    return;
  }

  logger.info('Starting database sync...');
  const syncService = new DataSyncService();
  await syncService.syncCharacters('reverse1999', data);

  logger.info('=== Sync Finished ===');
}

main().catch(async (e) => {
  console.error('Error during sync:', e);
  process.exit(1);
});
