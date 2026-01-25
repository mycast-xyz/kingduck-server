"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../src/utils/prisma");
async function clearCharacters() {
    console.log('Deleting all characters...');
    const result = await prisma_1.prisma.character.deleteMany({});
    console.log(`Deleted ${result.count} characters.`);
    await prisma_1.prisma.$disconnect();
}
clearCharacters().catch(console.error);
