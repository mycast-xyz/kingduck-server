import { prisma } from '../src/utils/prisma';

async function inspect() {
  try {
    console.log('--- Character WeaponTypes ---');
    const characters = await prisma.character.findMany({
      select: { weaponType: true, gameId: true, pathId: true, name: true },
    });

    const discrepancies = characters.filter((c) => c.weaponType && !c.pathId);
    console.log(
      'Discrepancies (weaponType exists but pathId missing):',
      discrepancies.length,
    );
    if (discrepancies.length > 0) {
      console.log('Sample discrepancy:', discrepancies[0]);
    }

    const weaponTypes = new Set(
      characters.map((c) => c.weaponType).filter(Boolean),
    );
    console.log('Unique WeaponTypes:', Array.from(weaponTypes));
    console.log('Sample characters:', characters.slice(0, 5));

    console.log('\n--- Elements ---');
    const elements = await prisma.element.findMany({
      select: { id: true, name: true, type: true, gameId: true },
    });
    console.log('Elements:', elements);
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

inspect();
