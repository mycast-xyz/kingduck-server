import { prisma } from '../src/utils/prisma';

async function main() {
  const game = await prisma.game.findUnique({
    where: { slug: 'starrail' },
  });

  if (!game) {
    console.log('Game not found');
    return;
  }

  const events = await prisma.calendarEvent.findMany({
    where: {
      gameId: game.id,
      // type: 'GACHA', // Fetch all types
    },
    orderBy: { startTime: 'desc' },
    take: 10,
  });

  console.log(`Found ${events.length} events for Star Rail:`);
  console.log(JSON.stringify(events, null, 2));
}

main();
