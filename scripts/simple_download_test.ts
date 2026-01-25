import youtubedl from 'youtube-dl-exec';
import path from 'path';
import fs from 'fs';

async function simpleTest() {
  const testVideoId = '9Z9twPFh9iU';
  const url = `https://www.youtube.com/shorts/${testVideoId}`;
  const saveDir = path.join(__dirname, '../static/video/');

  if (!fs.existsSync(saveDir)) {
    fs.mkdirSync(saveDir, { recursive: true });
  }

  console.log('Downloading:', url);
  console.log('To:', saveDir);

  try {
    // Simplest possible download
    await youtubedl(url, {
      output: path.join(saveDir, '%(id)s.%(ext)s'),
      format: 'best',
    });

    console.log('✅ Success!');

    // List files
    const files = fs.readdirSync(saveDir);
    console.log('Files in directory:', files);
  } catch (error: any) {
    console.error('❌ Failed:', error.message);
    if (error.stderr) {
      console.error('Stderr:', error.stderr.toString());
    }
  }
}

simpleTest();
