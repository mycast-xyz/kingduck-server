import { prisma } from '../src/utils/prisma';

async function checkEndfieldEvents() {
  console.log('Checking Endfield events in database...\n');

  // Get Endfield game
  const game = await prisma.game.findUnique({
    where: { slug: 'endfield' },
  });

  if (!game) {
    console.log('Endfield game not found in database!');
    return;
  }

  console.log(`Game: ${game.name} (ID: ${game.id})\n`);

  // Get all calendar events for Endfield
  const events = await prisma.calendarEvent.findMany({
    where: { gameId: game.id },
    orderBy: { startTime: 'desc' },
  });

  console.log(`Found ${events.length} events:\n`);

  events.forEach((event, index) => {
    console.log(`${index + 1}. ${event.title}`);
    console.log(`   Type: ${event.type}`);
    console.log(`   Start: ${event.startTime}`);
    console.log(`   End: ${event.endTime || 'N/A'}`);
    console.log(`   Image: ${event.imageUrl}`);
    console.log(`   Link: ${event.officialLink}`);

    if (event.metadata && typeof event.metadata === 'object') {
      const meta = event.metadata as any;

      if (meta.weapons && meta.weapons.length > 0) {
        console.log(
          `   Weapons (${meta.weapons.length}): ${meta.weapons.slice(0, 3).join(', ')}${meta.weapons.length > 3 ? '...' : ''}`,
        );
      }
      if (meta.characters && meta.characters.length > 0) {
        console.log(
          `   Characters (${meta.characters.length}): ${meta.characters.slice(0, 3).join(', ')}${meta.characters.length > 3 ? '...' : ''}`,
        );
      }
      if (meta.featuredWeapons && meta.featuredWeapons.length > 0) {
        console.log(`   Featured Weapons: ${meta.featuredWeapons.join(', ')}`);
      }
      if (meta.featuredCharacters && meta.featuredCharacters.length > 0) {
        console.log(
          `   Featured Characters: ${meta.featuredCharacters.join(', ')}`,
        );
      }
    }
    console.log('');
  });

  await prisma.$disconnect();
}

checkEndfieldEvents().catch(console.error);
