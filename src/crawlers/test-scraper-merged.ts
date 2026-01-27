import { WutheringWavesCharacterScraper } from './scrapers/wutheringwaves/CharacterScraper';
import { prisma } from '../utils/prisma';

async function main() {
  const scraper = new WutheringWavesCharacterScraper();

  // 1. Scrape
  console.log('Running Scrape...');
  const data = await scraper.scrape({ limit: 1 });
  console.log(`Scraped ${data.length} items.`);

  // 2. Save
  console.log('Running Save...');
  await scraper.save(data);
  console.log('Done.');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
