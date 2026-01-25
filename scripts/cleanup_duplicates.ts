import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const game = await prisma.game.findUnique({ where: { slug: 'reverse1999' } });
  if (!game) return;

  // 1. Cleanup Elements (Afflatus)
  console.log('Cleaning up elements...');
  const elements = await prisma.element.findMany({
    where: { gameId: game.id, type: 'Afflatus' },
    orderBy: { id: 'asc' },
  });

  const seenElements = new Map<string, number>();
  for (const el of elements) {
    const key = el.name.toLowerCase();
    if (seenElements.has(key)) {
      const keepId = seenElements.get(key);
      console.log(
        `Deleting duplicate Element ${el.name} (ID: ${el.id}), keeping ID: ${keepId}`,
      );

      // Reassign characters to the kept element first
      await prisma.character.updateMany({
        where: { elementId: el.id },
        data: { elementId: keepId },
      });

      await prisma.element.delete({ where: { id: el.id } });
    } else {
      seenElements.set(key, el.id);
    }
  }

  // 2. Cleanup Characters
  console.log('Cleaning up characters...');
  const chars = await prisma.character.findMany({
    where: { gameId: game.id },
    orderBy: { id: 'desc' }, // Keep latest? Or oldest? Usually keep latest if data is better, or oldest for stability.
    // Let's keep the one with the MOST complete metadata? All seem same.
    // Let's keep the LATEST (highest ID) as it might have the euphoria fix.
  });

  const seenChars = new Map<string, number>();
  // Processing in reverse order of ID (descending) -> first seen is highest ID (latest)
  // We keep the first one we see, delete others.

  for (const char of chars) {
    const meta = char.metadata as any;
    const originalId = meta?.originalId || char.name; // Use OriginalID or Name as uniqueness key

    if (seenChars.has(originalId)) {
      const keepId = seenChars.get(originalId);
      console.log(
        `Deleting duplicate Character ${char.name} (ID: ${char.id}), keeping ID: ${keepId}`,
      );
      await prisma.character.delete({ where: { id: char.id } });
    } else {
      seenChars.set(originalId, char.id);
    }
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
