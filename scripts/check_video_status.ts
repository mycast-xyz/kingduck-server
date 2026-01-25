import { prisma } from '../src/utils/prisma';
import fs from 'fs';
import path from 'path';

async function checkVideos() {
  try {
    // Check database
    const videos = await prisma.video.findMany({
      take: 10,
      include: {
        character: true,
      },
    });

    console.log(`\n=== Database Videos: ${videos.length} ===`);
    videos.forEach((v) => {
      console.log(`\nTitle: ${v.title}`);
      console.log(`URL: ${v.url}`);
      console.log(`Local Path: ${v.localPath || 'NOT SET'}`);
      console.log(`Character: ${v.character?.name || 'None'}`);
    });

    // Check files
    const videoDir = path.join(__dirname, '../static/video/');
    if (fs.existsSync(videoDir)) {
      const files = fs.readdirSync(videoDir);
      console.log(`\n=== Files in static/video/: ${files.length} ===`);
      files.forEach((f) => {
        const stats = fs.statSync(path.join(videoDir, f));
        console.log(`${f} - ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      });
    } else {
      console.log('\n❌ static/video/ directory does not exist');
    }
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await prisma.$disconnect();
  }
}

checkVideos();
