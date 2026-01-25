import { prisma } from '../src/utils/prisma';

async function cleanupVideos() {
  try {
    const deleted = await prisma.video.deleteMany({
      where: {
        OR: [
          { title: { contains: '2차 창작' } },
          { title: { contains: '열차 스타일의 연말 휴가 방식' } },
          // Also remove titles that don't match our pattern if they were previously saved
          {
            NOT: {
              title: { contains: ' | ' },
            },
          },
        ],
      },
    });

    console.log(
      `Successfully deleted ${deleted.count} unwanted videos from database.`,
    );

    // Reset localPath for existing videos to force re-download to webm if needed
    // or we can just leave them and let the sync script handle it.
    // User wants 1080p webm, so let's clear existing non-webm paths.
    const reset = await prisma.video.updateMany({
      where: {
        localPath: {
          not: {
            endsWith: '.webm',
          },
        },
      },
      data: {
        localPath: null,
      },
    });
    console.log(`Reset ${reset.count} non-webm localPaths.`);
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupVideos();
