"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../src/utils/prisma");
async function verifyImageUrls() {
    console.log('Verifying image URL format...\n');
    const characters = await prisma_1.prisma.character.findMany({
        select: {
            name: true,
            imageUrl: true,
        },
        take: 5,
    });
    console.log('Sample character image URLs:');
    characters.forEach((char) => {
        console.log(`  ${char.name}: ${char.imageUrl}`);
    });
    const withLocalhost = await prisma_1.prisma.character.count({
        where: {
            imageUrl: {
                contains: 'localhost',
            },
        },
    });
    const withRelativePath = await prisma_1.prisma.character.count({
        where: {
            imageUrl: {
                startsWith: 'assets/',
            },
        },
    });
    console.log(`\nCharacters with localhost URL: ${withLocalhost}`);
    console.log(`Characters with relative path: ${withRelativePath}`);
    await prisma_1.prisma.$disconnect();
}
verifyImageUrls().catch(console.error);
