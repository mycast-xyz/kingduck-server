import { prisma } from '../src/utils/prisma';

async function checkEvents() {
  console.log('\n=== Checking Wuthering Waves Events in Database ===\n');

  const game = await prisma.game.findUnique({
    where: { slug: 'wutheringwaves' },
  });

  if (!game) {
    console.log('❌ Game not found');
    return;
  }

  const events = await prisma.calendarEvent.findMany({
    where: { gameId: game.id },
    orderBy: { startTime: 'desc' },
    select: {
      type: true,
      title: true,
      startTime: true,
      endTime: true,
    },
  });

  console.log(`Found ${events.length} total events\n`);

  const byType = events.reduce(
    (acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  console.log('Events by type:');
  Object.entries(byType).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });

  console.log('\nRecent events:');
  events.slice(0, 10).forEach((event) => {
    console.log(`  [${event.type}] ${event.title}`);
  });

  await prisma.$disconnect();
}

checkEvents().catch(console.error);
