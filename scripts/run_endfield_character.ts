// 엔드필드 캐릭터 크롤 1회 실행 러너(실서버 스크레이퍼 + DataSyncService).
// 어드민 크롤 버튼과 동일 경로. 로그인/HTTP 불필요. force=이미지 재다운로드.
import 'dotenv/config';
import { EndfieldCharacterScraper } from '../src/crawlers/scrapers/endfield/CharacterScraper';
import { DataSyncService } from '../src/crawlers/services/DataSyncService';
import { ImageDownloader } from '../src/crawlers/utils/ImageDownloader';
import logger from '../src/utils/logger';

async function main() {
  const sync = new DataSyncService();
  sync.forceOverwrite = true;
  ImageDownloader.forceOverwrite = true;

  const scraper = new EndfieldCharacterScraper();
  const data = await scraper.scrape();
  if (data.length > 0) await sync.syncCharacters('endfield', data);

  logger.info(`Endfield character run done: ${data.length} characters synced.`);
  process.exit(0);
}

main().catch((e) => {
  logger.error('Endfield character run failed:', e);
  process.exit(1);
});
