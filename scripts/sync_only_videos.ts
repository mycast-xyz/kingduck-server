import { YoutubeShortsScraper } from '../src/crawlers/scrapers/starrail/YoutubeShortsScraper';
import { DataSyncService } from '../src/crawlers/services/DataSyncService';
import logger from '../src/utils/logger';

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

async function syncOnlyVideos() {
  logger.info('=== Starting Video Core Sync Only ===');

  try {
    const syncService = new DataSyncService();
    const youtubeScraper = new YoutubeShortsScraper();

    logger.info('Scraping YouTube Shorts...');
    const youtubeData = await youtubeScraper.scrape();

    if (youtubeData.length > 0) {
      logger.info(`Found ${youtubeData.length} videos. Starting sync...`);
      await syncService.syncVideos('starrail', youtubeData);
    } else {
      logger.warn('No videos found to sync.');
    }
  } catch (error) {
    logger.error('Video sync failed:', error);
  } finally {
    logger.info('=== Video Core Sync Finished ===');
  }
}

syncOnlyVideos();
