import fs from 'fs';
import { RelicScraper } from '../src/crawlers/scrapers/starrail/RelicScraper';
import { Browser } from '../src/crawlers/core/Browser';
import logger from '../src/utils/logger';

async function testRelicScraper() {
  logger.info('=== Testing Relic Scraper ===');

  try {
    const browser = Browser.getInstance();
    await browser.init();

    const scraper = new RelicScraper();
    const results = await scraper.scrape();

    logger.info(`\nScraped ${results.length} relic sets total.`);

    if (results.length > 0) {
      const firstRelic = results[0];
      const outputPath = 'relic_sample.json';

      fs.writeFileSync(
        outputPath,
        JSON.stringify(firstRelic, null, 2),
        'utf-8',
      );

      logger.info(`\n✅ Saved first relic set to: ${outputPath}`);
      logger.info(`\nFirst Relic Preview:`);
      logger.info(`  Name: ${firstRelic.name}`);
      logger.info(`  Original ID: ${firstRelic.metadata?.originalId}`);
      logger.info(`  2pc: ${firstRelic.metadata?.['2pc']}`);
      logger.info(`  4pc: ${firstRelic.metadata?.['4pc']}`);
      logger.info(`  Icon URL: ${firstRelic.imageUrl}`);

      const allNames = results.map((r, idx) => ({
        index: idx + 1,
        id: r.metadata?.originalId,
        name: r.name,
      }));

      fs.writeFileSync(
        'relic_list.json',
        JSON.stringify(allNames, null, 2),
        'utf-8',
      );

      logger.info(`\n✅ Saved all relic set names to: relic_list.json`);
    } else {
      logger.warn('No relics found!');
    }

    await browser.close();
    logger.info('\n=== Test Complete ===');
  } catch (error) {
    logger.error('Test failed:', error);
    process.exit(1);
  }
}

testRelicScraper();
