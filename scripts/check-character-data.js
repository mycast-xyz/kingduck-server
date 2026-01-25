"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../src/utils/prisma");
async function checkCharacterData() {
    console.log('Checking Character data completeness...\n');
    const characters = await prisma_1.prisma.character.findMany({
        select: {
            id: true,
            name: true,
            rarity: true,
            weaponType: true,
            role: true,
            description: true,
            imageUrl: true,
            elementId: true,
            pathId: true,
            metadata: true,
        },
        take: 3,
    });
    characters.forEach((char) => {
        console.log(`Character: ${char.name}`);
        console.log(`  - ID: ${char.id}`);
        console.log(`  - Rarity: ${char.rarity || 'NULL'}`);
        console.log(`  - WeaponType: ${char.weaponType || 'NULL'}`);
        console.log(`  - Role: ${char.role || 'NULL'}`);
        console.log(`  - Description: ${char.description || 'NULL'}`);
        console.log(`  - ImageUrl: ${char.imageUrl ? 'SET' : 'NULL'}`);
        console.log(`  - ElementId: ${char.elementId || 'NULL'}`);
        console.log(`  - PathId: ${char.pathId || 'NULL'}`);
        console.log(`  - Metadata keys: ${char.metadata ? Object.keys(char.metadata).join(', ') : 'NULL'}`);
        console.log('');
    });
    await prisma_1.prisma.$disconnect();
}
checkCharacterData().catch(console.error);
