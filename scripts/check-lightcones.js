"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../src/utils/prisma");
async function checkLightCones() {
    try {
        const game = await prisma_1.prisma.game.findUnique({ where: { slug: 'starrail' } });
        if (!game) {
            console.log('Star Rail game not found');
            return;
        }
        const count = await prisma_1.prisma.item.count({
            where: {
                gameId: game.id,
                type: 'LightCone',
            },
        });
        console.log(`Total LightCones in database: ${count}`);
        const samples = await prisma_1.prisma.item.findMany({
            where: {
                gameId: game.id,
                type: 'LightCone',
            },
            take: 5,
        });
        console.log('\nSample LightCones:');
        samples.forEach((lc) => {
            const metadata = lc.metadata;
            console.log(`- ${lc.name} (Rarity: ${lc.rarity})`);
            console.log(`  Path: ${metadata?.path}`);
            console.log(`  Icon: ${lc.imageUrl}`);
            console.log(`  Has refinements: ${!!metadata?.refinements}`);
            console.log(`  Has stats: ${!!metadata?.stats}`);
        });
    }
    catch (error) {
        console.error('Check failed:', error);
    }
    finally {
        await prisma_1.prisma.$disconnect();
    }
}
checkLightCones();
