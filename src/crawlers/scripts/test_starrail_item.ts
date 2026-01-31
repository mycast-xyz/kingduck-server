import { StarRailItemScraper } from '../scrapers/starrail/ItemScraper';
import path from 'path';

async function test() {
  const scraper = new StarRailItemScraper();
  console.log('Running Star Rail Item Scraper Test...');

  // Scrape 1 item and save to json
  const results = await scraper.scrape({
    limit: 1,
    saveToJson: true,
    jsonPath: path.join(process.cwd(), 'starrail_items_test.json'),
  });

  console.log('Scraped Items:', results.length);
  if (results.length > 0) {
    console.log('First Item:', JSON.stringify(results[0], null, 2));
    await scraper.save(results);
  }
}

test().catch(console.error);
