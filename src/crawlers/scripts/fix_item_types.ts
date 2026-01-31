import { prisma } from '../../utils/prisma';

async function migrate() {
  console.log('Checking for items with type "Unknown"...');
  const count = await prisma.item.count({
    where: {
      type: 'Unknown',
    },
  });

  console.log(`Found ${count} items with type "Unknown".`);

  if (count > 0) {
    console.log('Updating items to type "Item"...');
    const result = await prisma.item.updateMany({
      where: {
        type: 'Unknown',
      },
      data: {
        type: 'Item',
      },
    });
    console.log(`Updated ${result.count} items.`);
  } else {
    console.log('No items to update.');
  }

  // Debug: Show all types
  console.log('Current types distribution:');
  const distinctTypes = await prisma.item.groupBy({
    by: ['type'],
    _count: {
      type: true,
    },
  });
  console.log(distinctTypes);
}

migrate()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
