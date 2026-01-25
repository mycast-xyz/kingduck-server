import YoutubeUtils from '../src/utils/youtubeUtils';

async function testDownload() {
  console.log('Testing video download...');

  // Test with one video ID
  const testVideoId = '9Z9twPFh9iU'; // 스파키

  try {
    console.log(`Downloading video: ${testVideoId}`);
    const success = await YoutubeUtils.downloadVideoById(testVideoId);

    if (success) {
      console.log(`✅ Successfully downloaded: ${testVideoId}.webm`);
      console.log('Check: static/video/ directory');
    } else {
      console.log('❌ Download failed');
    }
  } catch (e) {
    console.error('Error:', e);
  }
}

testDownload();
