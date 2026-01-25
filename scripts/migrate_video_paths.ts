import { prisma } from '../src/utils/prisma';
import logger from '../src/utils/logger';

async function migratePaths() {
  logger.info(
    'Starting migration of video paths from static/video/ to assets/video/',
  );

  try {
    const videos = await prisma.video.findMany({
      where: {
        localPath: {
          startsWith: 'static/video/',
        },
      },
    });

    logger.info(`Found ${videos.length} videos to update.`);

    let count = 0;
    for (const video of videos) {
      if (video.localPath) {
        const newPath = video.localPath.replace(
          'static/video/',
          'assets/video/',
        );
        await prisma.video.update({
          where: { id: video.id },
          data: { localPath: newPath },
        });
        count++;
        if (count % 10 === 0) {
          logger.info(`Updated ${count} videos...`);
        }
      }
    }

    logger.info(`Successfully updated ${count} video paths.`);
  } catch (error) {
    logger.error('Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

migratePaths();
