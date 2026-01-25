import { prisma } from '../src/utils/prisma';

async function verify() {
  try {
    // Check videos table
    const videoCount = await prisma.video.count();
    console.log(`\nTotal videos in database: ${videoCount}`);

    // Get first video
    const firstVideo = await prisma.video.findFirst({
      include: {
        character: true,
      },
    });

    if (firstVideo) {
      console.log('\n=== First Video ===');
      console.log('Title:', firstVideo.title);
      console.log('URL:', firstVideo.url);
      console.log('Character:', firstVideo.character?.name || 'Not linked');
    }

    // Check characters with keyVisualUrl
    const charactersWithKeyVisual = await prisma.character.findMany({
      where: {
        metadata: {
          path: ['keyVisualUrl'],
          not: null,
        },
      },
      take: 3,
    });

    console.log(
      `\n=== Characters with keyVisualUrl: ${charactersWithKeyVisual.length} ===`,
    );
    charactersWithKeyVisual.forEach((char: any) => {
      console.log(`- ${char.name}: ${char.metadata.keyVisualUrl}`);
    });
  } catch (e) {
    console.error('Verification failed:', e);
  } finally {
    await prisma.$disconnect();
  }
}

verify();
