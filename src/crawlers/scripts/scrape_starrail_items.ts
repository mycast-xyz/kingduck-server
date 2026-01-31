import { StarRailItemScraper } from '../scrapers/starrail/ItemScraper';
import { prisma } from '../../utils/prisma';
import logger from '../../utils/logger';

async function run() {
  logger.info('=== Starting Standalone Star Rail Item Scraper ===');

  try {
    const scraper = new StarRailItemScraper();

    // Scrape all items (no limit)
    const items = await scraper.scrape();

    if (items.length > 0) {
      await scraper.save(items);
    } else {
      logger.warn('No items found to save.');
    }
  } catch (error) {
    logger.error('Error in standalone Star Rail Item scraper:', error);
  } finally {
    await prisma.$disconnect();
    logger.info('=== Finished Standalone Star Rail Item Scraper ===');
  }
}

// Run directly
if (require.main === module) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
