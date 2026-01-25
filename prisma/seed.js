"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const pg_1 = require("pg");
const adapter_pg_1 = require("@prisma/adapter-pg");
const client_1 = require("@prisma/client");
const connectionString = process.env.DATABASE_URL;
const pool = new pg_1.Pool({ connectionString });
const adapter = new adapter_pg_1.PrismaPg(pool);
const prisma = new client_1.PrismaClient({ adapter });
async function main() {
    console.log('Adding games to database with icons...');
    const PORT = 3000; // As per config
    const BASE_URL = `http://localhost:${PORT}/assets/logo`;
    const games = [
        { slug: 'genshin', name: '원신', icon: 'genshin.webp' },
        {
            slug: 'starrail',
            name: '붕괴: 스타레일',
            icon: 'starrail.webp',
        },
        {
            slug: 'wutheringwaves',
            name: '명조',
            icon: 'wutheringwaves.webp',
        },
        {
            slug: 'nikke',
            name: '승리의 여신: 니케',
            icon: 'nikke.webp',
        },
        { slug: 'zzz', name: '젠레스 존 제로', icon: 'zzz.webp' },
        {
            slug: 'reverse1999',
            name: '리버스: 1999',
            icon: 'reverse1999.webp',
        },
    ];
    for (const g of games) {
        const iconUrl = `${BASE_URL}/${g.icon}`;
        // Check if file exists logic could be here, but we trust the listing
        const game = await prisma.game.upsert({
            where: { slug: g.slug },
            update: {
                iconUrl: iconUrl, // Update icon if game exists
            },
            create: {
                slug: g.slug,
                name: g.name,
                iconUrl: iconUrl,
            },
        });
        console.log(`Upserted game: ${game.name} (${game.slug}) -> ${iconUrl}`);
    }
    console.log('Game list population finished.');
}
main()
    .then(async () => {
    await prisma.$disconnect();
})
    .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
