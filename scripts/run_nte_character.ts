// NTE(이환) 캐릭터 크롤 1회 실행 러너.
// 실서버 코드(NteCharacterScraper + DataSyncService)를 그대로 사용 — 어드민 크롤 버튼과 동일 경로.
// 로그인/HTTP 불필요. force=이미지 재다운로드(코스튬 등 신규 자산 확보).
import 'dotenv/config';
import { NteCharacterScraper } from '../src/crawlers/scrapers/nte/CharacterScraper';
import { DataSyncService } from '../src/crawlers/services/DataSyncService';
import { ImageDownloader } from '../src/crawlers/utils/ImageDownloader';
import logger from '../src/utils/logger';

async function main() {
  const sync = new DataSyncService();
  sync.forceOverwrite = true;
  ImageDownloader.forceOverwrite = true;

  const scraper = new NteCharacterScraper();
  const data = await scraper.scrape();
  if (data.length > 0) await sync.syncCharacters('nte', data);

  logger.info(`NTE character run done: ${data.length} characters synced.`);
  process.exit(0);
}

main().catch((e) => {
  logger.error('NTE character run failed:', e);
  process.exit(1);
});
