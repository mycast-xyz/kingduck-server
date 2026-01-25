import { prisma } from '../src/utils/prisma';

async function checkLightCones() {
  try {
    const game = await prisma.game.findUnique({ where: { slug: 'starrail' } });
    if (!game) {
      console.log('Star Rail game not found');
      return;
    }

    const count = await prisma.item.count({
      where: {
        gameId: game.id,
        type: 'LightCone',
      },
    });

    console.log(`Total LightCones in database: ${count}`);

    const samples = await prisma.item.findMany({
      where: {
        gameId: game.id,
        type: 'LightCone',
      },
      take: 5,
    });

    console.log('\nSample LightCones:');
    samples.forEach((lc) => {
      const metadata = lc.metadata as any;
      console.log(`- ${lc.name} (Rarity: ${lc.rarity})`);
      console.log(`  Path: ${metadata?.path}`);
      console.log(`  Icon: ${lc.imageUrl}`);
      console.log(`  Has refinements: ${!!metadata?.refinements}`);
      console.log(`  Has stats: ${!!metadata?.stats}`);
    });
  } catch (error) {
    console.error('Check failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkLightCones();
