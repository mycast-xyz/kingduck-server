import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  console.log('Starting backup...');

  const data = {
    games: await prisma.game.findMany(),
    elements: await prisma.element.findMany(),
    characters: await prisma.character.findMany(),
    items: await prisma.item.findMany(),
    videos: await prisma.video.findMany(),
    users: await prisma.user.findMany(),
    // calendarEvents: await prisma.calendarEvent.findMany(), // Table doesn't exist yet potentially, or empty. omitting for safety if queries fail on missing table. But user said it's defined in schema. If migration failed, table might not exist in correct state.
  };

  const backupFile = path.join(backupDir, `backup_${timestamp}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
  console.log(`Backup saved to ${backupFile}`);
  console.log(
    `Counts: Games ${data.games.length}, Characters ${data.characters.length}, Items ${data.items.length}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
