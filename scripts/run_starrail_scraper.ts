import { EventScraper } from '../src/crawlers/scrapers/starrail/EventScraper';

async function main() {
  const scraper = new EventScraper();
  const data = await scraper.scrape();
  await scraper.save(data);
}

main();
