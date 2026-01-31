import { WutheringWavesCharacterScraper } from '../src/crawlers/scrapers/wutheringwaves/CharacterScraper';
import logger from '../src/utils/logger';

async function main() {
  try {
    logger.info('Starting Wuthering Waves crawler test...');

    const scraper = new WutheringWavesCharacterScraper();

    // limit 5로 테스트
    const results = await scraper.scrape({ limit: 10 });

    logger.info(`Scraped ${results.length} characters.`);

    // 저장 테스트는 생략하거나 주석 처리하고 일단 스크래핑 과정만 확인
    // await scraper.save(results);

    logger.info('Test completed successfully');
  } catch (error) {
    logger.error('Test failed:', error);
  }
}

main();
