import { prisma } from '../src/utils/prisma';

async function migrateWeaponTypes() {
  console.log('Starting migration of weaponType -> weaponId...');

  try {
    // 1. Get all characters with weaponType and no weaponId
    const characters = await prisma.character.findMany({
      where: {
        weaponType: { not: null },
        weaponId: null,
      },
      include: {
        game: true,
      },
    });

    console.log(`Found ${characters.length} characters to migrate.`);

    for (const char of characters) {
      if (!char.weaponType) continue;

      // 2. Find Element matching the weaponType (and Game ID)
      // Note: In Star Rail, weaponType ('Rogue', etc.) behaves like a Path.
      let element = await prisma.element.findFirst({
        where: {
          gameId: char.gameId,
          name: char.weaponType,
        },
      });

      // If not found, check if it's 'Path' or 'DamageType' specifically if needed,
      // but finding by Name within Game should be sufficient if names are unique.

      if (element) {
        console.log(
          `Mapping '${char.name}' weaponType '${char.weaponType}' -> Element ID ${element.id}`,
        );

        await prisma.character.update({
          where: { id: char.id },
          data: { weaponId: element.id },
        });
      } else {
        console.warn(
          `[WARN] No element found for weaponType '${char.weaponType}' in game ${char.gameId} for character '${char.name}'`,
        );
      }
    }

    console.log('Migration complete.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

migrateWeaponTypes();
