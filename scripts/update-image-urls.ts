import { prisma } from '../src/utils/prisma';

async function updateImageUrls() {
  console.log('Updating image URLs to relative paths...\n');

  // Get all characters with image URLs
  const characters = await prisma.character.findMany({
    where: {
      imageUrl: {
        contains: 'http://localhost:3000/',
      },
    },
  });

  console.log(`Found ${characters.length} characters with absolute URLs`);

  let updateCount = 0;
  for (const char of characters) {
    if (char.imageUrl) {
      // Remove http://localhost:3000/ prefix
      const newUrl = char.imageUrl.replace('http://localhost:3000/', '');

      await prisma.character.update({
        where: { id: char.id },
        data: { imageUrl: newUrl },
      });

      console.log(`Updated: ${char.name}`);
      console.log(`  Old: ${char.imageUrl}`);
      console.log(`  New: ${newUrl}\n`);
      updateCount++;
    }
  }

  console.log(`\nUpdated ${updateCount} character image URLs`);

  await prisma.$disconnect();
}

updateImageUrls().catch(console.error);
