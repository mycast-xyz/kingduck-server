import { prisma } from '../src/utils/prisma';

async function verifyImageUrls() {
  console.log('Verifying image URL format...\n');

  const characters = await prisma.character.findMany({
    select: {
      name: true,
      imageUrl: true,
    },
    take: 5,
  });

  console.log('Sample character image URLs:');
  characters.forEach((char) => {
    console.log(`  ${char.name}: ${char.imageUrl}`);
  });

  const withLocalhost = await prisma.character.count({
    where: {
      imageUrl: {
        contains: 'localhost',
      },
    },
  });

  const withRelativePath = await prisma.character.count({
    where: {
      imageUrl: {
        startsWith: 'assets/',
      },
    },
  });

  console.log(`\nCharacters with localhost URL: ${withLocalhost}`);
  console.log(`Characters with relative path: ${withRelativePath}`);

  await prisma.$disconnect();
}

verifyImageUrls().catch(console.error);
