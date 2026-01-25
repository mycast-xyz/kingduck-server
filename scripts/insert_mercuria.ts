import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

console.log('Current directory:', process.cwd());

// Initialize with Driver Adapter for Prisma 7
const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({
  adapter,
  log: ['query', 'info', 'warn', 'error'],
});

async function main() {
  console.log('Connecting to database...');
  await prisma.$connect();
  console.log('Connected.');

  // We use mercuria_data.json because it is the latest output from the scraper (test_reverse_full_scraper.ts)
  // and contains euphoria_info which mercuria_structured.json might lack.
  const dataPath = path.join(__dirname, '..', 'mercuria_data.json');

  if (!fs.existsSync(dataPath)) {
    console.error(`File not found: ${dataPath}`);
    process.exit(1);
  }
  const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  console.log(`Found ${rawData.length} characters to insert.`);

  // 1. Ensure Game exists
  const game = await prisma.game.upsert({
    where: { slug: 'reverse1999' },
    update: {},
    create: {
      slug: 'reverse1999',
      name: 'Reverse: 1999',
      iconUrl: 'assets/icon/reverse1999.png',
    },
  });

  console.log(`Game ensured: ${game.name} (${game.id})`);

  for (const charData of rawData) {
    console.log(`Processing ${charData.name}...`);

    // 2. Handle Element (Afflatus)
    let elementId: number | null = null;
    const afflatusName = charData.metadata?.afflatus;

    if (afflatusName) {
      const existingElement = await prisma.element.findFirst({
        where: {
          gameId: game.id,
          name: { equals: afflatusName, mode: 'insensitive' },
          type: 'Afflatus',
        },
      });

      if (existingElement) {
        elementId = existingElement.id;
      } else {
        const newElement = await prisma.element.create({
          data: {
            gameId: game.id,
            name: afflatusName,
            type: 'Afflatus',
          },
        });
        elementId = newElement.id;
        console.log(`Created new Element: ${afflatusName}`);
      }
    }

    // 3. Upsert Character
    const existingChar = await prisma.character.findFirst({
      where: {
        gameId: game.id,
        name: charData.name,
      },
    });

    const metadata = charData.metadata || {};

    const charPayload = {
      name: charData.name,
      rarity: Number(charData.rarity),
      role: charData.role,
      imageUrl: charData.imageUrl,
      metadata: metadata,
      elementId: elementId,
      gameId: game.id,
    };

    if (existingChar) {
      await prisma.character.update({
        where: { id: existingChar.id },
        data: charPayload,
      });
      console.log(`Updated character: ${charData.name}`);
    } else {
      await prisma.character.create({
        data: charPayload,
      });
      console.log(`Created character: ${charData.name}`);
    }
  }
}

main()
  .catch((e) => {
    console.error('Full Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
