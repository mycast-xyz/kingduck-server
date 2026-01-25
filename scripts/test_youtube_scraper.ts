import { YoutubeShortsScraper } from '../src/crawlers/scrapers/starrail/YoutubeShortsScraper';
import logger from '../src/utils/logger';

async function testScraper() {
  logger.info('Testing YouTube Shorts scraper...');

  try {
    const scraper = new YoutubeShortsScraper();
    const videos = await scraper.scrape();

    if (videos.length === 0) {
      logger.warn('No videos found');
      return;
    }

    // Show first video only
    const firstVideo = videos[0];
    console.log('\n=== First Video ===');
    console.log('Title:', firstVideo.title);
    console.log('URL:', firstVideo.url);
    console.log('Thumbnail:', firstVideo.thumbnailUrl);
    console.log('Character Name:', firstVideo.characterName || 'Not parsed');
    console.log('Type:', firstVideo.type);
    console.log('\nTotal videos found:', videos.length);
  } catch (e) {
    logger.error('Test failed:', e);
  }
}

testScraper();
