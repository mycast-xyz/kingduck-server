"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../src/utils/prisma");
async function checkElements() {
    console.log('Checking Element table...');
    const elements = await prisma_1.prisma.element.findMany({
        orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    console.log(`Found ${elements.length} elements:`);
    elements.forEach((el) => {
        console.log(`  - ${el.type}: ${el.name} (ID: ${el.id}, GameID: ${el.gameId})`);
    });
    await prisma_1.prisma.$disconnect();
}
checkElements().catch(console.error);
