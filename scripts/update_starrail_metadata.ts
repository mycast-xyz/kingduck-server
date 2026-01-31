import { CharacterScraper } from '../src/crawlers/scrapers/starrail/CharacterScraper';
import { DataSyncService } from '../src/crawlers/services/DataSyncService';
import logger from '../src/utils/logger';

/**
 * Star Rail 캐릭터 메타데이터 업데이트 스크립트
 * 기존 캐릭터들의 메타데이터를 최신 정보로 업데이트합니다.
 */
async function main() {
  try {
    logger.info('Starting Star Rail character metadata update...');

    // 1. 스크래퍼 초기화
    const scraper = new CharacterScraper();

    // 2. 전체 캐릭터 데이터 스크래핑 (limit 없음)
    logger.info('Scraping latest character data...');
    const scrapedData = await scraper.scrape();

    logger.info(`Scraped ${scrapedData.length} characters`);

    // 3. 데이터 동기화 (메타데이터 업데이트)
    const syncService = new DataSyncService();
    await syncService.syncCharacters('starrail', scrapedData);

    logger.info('Metadata update completed successfully!');
  } catch (error) {
    logger.error('Error updating metadata:', error);
    process.exit(1);
  }
}

main();
