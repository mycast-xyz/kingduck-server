import { prisma } from '../src/utils/prisma';

async function clearCharacters() {
  console.log('Deleting all characters...');

  const result = await prisma.character.deleteMany({});

  console.log(`Deleted ${result.count} characters.`);

  await prisma.$disconnect();
}

clearCharacters().catch(console.error);
