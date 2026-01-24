import { prisma } from '../src/utils/prisma';

async function checkElements() {
  console.log('Checking Element table...');

  const elements = await prisma.element.findMany({
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  });

  console.log(`Found ${elements.length} elements:`);
  elements.forEach((el) => {
    console.log(
      `  - ${el.type}: ${el.name} (ID: ${el.id}, GameID: ${el.gameId})`,
    );
  });

  await prisma.$disconnect();
}

checkElements().catch(console.error);
