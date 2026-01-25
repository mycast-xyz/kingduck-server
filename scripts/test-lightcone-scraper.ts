import fs from 'fs';
import { LightConeScraper } from '../src/crawlers/scrapers/starrail/LightConeScraper';
import { Browser } from '../src/crawlers/core/Browser';
import logger from '../src/utils/logger';

async function testLightConeScraper() {
  logger.info('=== Testing LightCone Scraper ===');

  try {
    // Initialize browser (required for some scrapers)
    const browser = Browser.getInstance();
    await browser.init();

    // Create scraper instance
    const scraper = new LightConeScraper();

    // Run scraper (modify results directly to limit for test)
    const results = await scraper.scrape();
    const limitedResults = results.slice(0, 1);

    logger.info(
      `\nScraped ${results.length} lightcones total. Testing with first ${limitedResults.length}.`,
    );

    if (limitedResults.length > 0) {
      // Save first lightcone to JSON
      const firstLightCone = limitedResults[0];
      const outputPath = 'lightcone_sample.json';

      fs.writeFileSync(
        outputPath,
        JSON.stringify(firstLightCone, null, 2),
        'utf-8',
      );

      logger.info(`\n✅ Saved first lightcone to: ${outputPath}`);
      logger.info(`\nFirst LightCone Preview:`);
      logger.info(`  Name: ${firstLightCone.name}`);
      logger.info(`  Original ID: ${firstLightCone.metadata?.originalId}`);
      logger.info(`  Rarity: ${firstLightCone.metadata?.rarity}`);
      logger.info(`  Path: ${firstLightCone.metadata?.path}`);
      logger.info(`  Icon URL: ${firstLightCone.imageUrl}`);
      logger.info(`  Card URL: ${firstLightCone.metadata?.cardImageUrl}`);

      // Also save all lightcone names for reference
      const allNames = results.map((lc, idx) => ({
        index: idx + 1,
        id: lc.metadata?.originalId,
        name: lc.name,
        rarity: lc.metadata?.rarity,
      }));

      fs.writeFileSync(
        'lightcone_list.json',
        JSON.stringify(allNames, null, 2),
        'utf-8',
      );

      logger.info(`\n✅ Saved all lightcone names to: lightcone_list.json`);
    } else {
      logger.warn('No lightcones found!');
    }

    // Close browser
    await browser.close();
    logger.info('\n=== Test Complete ===');
  } catch (error) {
    logger.error('Test failed:', error);
    process.exit(1);
  }
}

testLightConeScraper();
