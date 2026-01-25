require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  console.log('Connecting...');
  await prisma.$connect();
  console.log('Connected!');

  const dataPath = path.join(__dirname, '..', 'mercuria_data.json');
  const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  // 1. Ensure Game exists
  const game = await prisma.game.upsert({
    where: { slug: 'reverse1999' },
    update: {},
    create: {
      slug: 'reverse1999',
      name: 'Reverse: 1999',
      iconUrl: 'assets/icon/reverse1999.png',
    },
  });

  console.log(`Game ensured: ${game.name}`);

  for (const charData of rawData) {
    console.log(`Processing ${charData.name}`);

    // Element
    let elementId = null;
    const afflatusName = charData.metadata?.afflatus;

    if (afflatusName) {
      const existingElement = await prisma.element.findFirst({
        where: {
          gameId: game.id,
          name: { equals: afflatusName, mode: 'insensitive' },
          type: 'Afflatus',
        },
      });

      if (existingElement) {
        elementId = existingElement.id;
      } else {
        const newElement = await prisma.element.create({
          data: {
            gameId: game.id,
            name: afflatusName,
            type: 'Afflatus',
          },
        });
        elementId = newElement.id;
      }
    }

    // Character
    const existingChar = await prisma.character.findFirst({
      where: {
        gameId: game.id,
        name: charData.name,
      },
    });

    const charPayload = {
      name: charData.name,
      rarity: Number(charData.rarity),
      role: charData.role,
      imageUrl: charData.imageUrl,
      metadata: charData.metadata || {},
      elementId: elementId,
      gameId: game.id,
    };

    if (existingChar) {
      await prisma.character.update({
        where: { id: existingChar.id },
        data: charPayload,
      });
      console.log(`Updated character: ${charData.name}`);
    } else {
      await prisma.character.create({
        data: charPayload,
      });
      console.log(`Created character: ${charData.name}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
