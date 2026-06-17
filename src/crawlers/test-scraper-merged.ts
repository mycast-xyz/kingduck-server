import { EndfieldCharacterScraper } from './scrapers/endfield/CharacterScraper';
import { prisma } from '../utils/prisma';
import logger from '../utils/logger';

async function main() {
  const scraper = new EndfieldCharacterScraper();

  // 1. Scrape
  logger.info('Running Scrape...');
  const data = await scraper.scrape();
  logger.info(`Scraped ${data.length} items.`);

  // 2. Save
  logger.info('Running Save...');
  await scraper.save(data);
  logger.info('Done.');
}

main()
  .catch((e) => logger.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
