import { EventScraper } from '../src/crawlers/scrapers/wutheringwaves/EventScraper';
import logger from '../src/utils/logger';

async function main() {
  logger.info('=== Wuthering Waves Event Scraper Test ===');

  const scraper = new EventScraper();

  try {
    // Run scraper
    const results = await scraper.scrape();

    logger.info(`Scraping completed. Total events: ${results.length}`);

    // Save results to events.json
    await scraper.save(results);

    logger.info('Event scraping and saving completed successfully!');
  } catch (error) {
    logger.error('Error during event scraping:', error);
    process.exit(1);
  }
}

main();
