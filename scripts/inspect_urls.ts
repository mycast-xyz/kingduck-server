import { prisma } from '../src/utils/prisma';

async function inspect() {
  try {
    const characters = await prisma.character.findMany({
      take: 5,
    });

    // Check looking for http
    for (const char of characters) {
      const jsonStr = JSON.stringify(char.metadata);
      if (jsonStr.includes('http://localhost:3000')) {
        console.log(
          `Character ${char.name} (ID: ${char.id}) has absolute URLs.`,
        );
        console.log(
          'Sample Metadata Snippet:',
          jsonStr.substring(
            jsonStr.indexOf('http://localhost:3000'),
            jsonStr.indexOf('http://localhost:3000') + 100,
          ),
        );
      }
    }
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

inspect();
