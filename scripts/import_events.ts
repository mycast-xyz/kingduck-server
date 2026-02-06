import { PrismaClient, EventType } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  const gameSlug = 'starrail';
  const game = await prisma.game.findUnique({
    where: { slug: gameSlug },
  });

  if (!game) {
    console.error(`Game '${gameSlug}' not found in database.`);
    return;
  }

  const eventsPath = path.join(
    process.cwd(),
    'data/crawlers/starrail/events.json',
  );
  if (!fs.existsSync(eventsPath)) {
    console.error(`Events file not found at ${eventsPath}`);
    return;
  }

  const events = JSON.parse(fs.readFileSync(eventsPath, 'utf-8'));
  console.log(
    `Found ${events.length} events to import for ${game.name} (ID: ${game.id})`,
  );

  for (const event of events) {
    const meta = event.metadata;

    // Map Type
    let type: EventType = EventType.EVENT;
    if (meta.type === 'warp') type = EventType.GACHA;
    if (meta.type === 'update') type = EventType.MAINTENANCE;

    // Parse Dates
    // Hoyolab API returns "0" for start/end sometimes, use created_at as fallback for start
    let startTime = new Date(meta.created_at * 1000);
    if (meta.start_time && meta.start_time !== '0') {
      // Check if logic needed for format (it seems to be string timestamp or similar, need validation)
      // If string number:
      if (!isNaN(Number(meta.start_time))) {
        startTime = new Date(Number(meta.start_time) * 1000);
      }
    }

    let endTime: Date | null = null;
    if (meta.end_time && meta.end_time !== '0') {
      if (!isNaN(Number(meta.end_time))) {
        endTime = new Date(Number(meta.end_time) * 1000);
      }
    }

    console.log(`Importing: ${meta.subject} (${type})`);

    await prisma.calendarEvent.create({
      data: {
        gameId: game.id,
        type: type,
        title: meta.subject,
        startTime: startTime,
        endTime: endTime,
        imageUrl: meta.cover,
        officialLink: event.sourceUrl,
        targetId: String(meta.id),
        metadata: meta, // Store full metadata strictly as JSON
      },
    });
  }

  console.log('Import completed.');
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
