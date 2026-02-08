import { prisma } from '../src/utils/prisma';

async function checkCrawlerLogs() {
  console.log('\n=== Crawler Logs ===\n');

  const logs = await prisma.crawlerLog.findMany({
    orderBy: { startTime: 'desc' },
    take: 10,
    include: {
      game: { select: { name: true, slug: true } },
    },
  });

  if (logs.length === 0) {
    console.log('No crawler logs found');
    return;
  }

  logs.forEach((log, index) => {
    console.log(`${index + 1}. ${log.game.name} - ${log.crawlerType}`);
    console.log(`   Status: ${log.status}`);
    console.log(`   Start: ${log.startTime}`);
    console.log(`   End: ${log.endTime || 'N/A'}`);
    console.log(`   Items: ${log.itemsFound || 0}`);
    if (log.errorMsg) {
      console.log(`   Error: ${log.errorMsg}`);
    }
    console.log('');
  });

  await prisma.$disconnect();
}

checkCrawlerLogs().catch(console.error);
