"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../src/utils/prisma");
async function checkWeaponTypes() {
    console.log('Checking Character weaponType field...');
    const characters = await prisma_1.prisma.character.findMany({
        select: {
            id: true,
            name: true,
            weaponType: true,
            game: {
                select: {
                    slug: true,
                },
            },
        },
        take: 10,
    });
    console.log(`\nFirst 10 characters:`);
    characters.forEach((char) => {
        console.log(`  - ${char.name} (${char.game.slug}): weaponType = ${char.weaponType || 'NULL'}`);
    });
    const withWeaponType = await prisma_1.prisma.character.count({
        where: {
            weaponType: {
                not: null,
            },
        },
    });
    const total = await prisma_1.prisma.character.count();
    console.log(`\nTotal characters: ${total}`);
    console.log(`Characters with weaponType: ${withWeaponType}`);
    console.log(`Characters without weaponType: ${total - withWeaponType}`);
    await prisma_1.prisma.$disconnect();
}
checkWeaponTypes().catch(console.error);
