import axios from 'axios';
import { prisma } from '../src/utils/prisma';

async function verify() {
  try {
    // Find a game slug that has characters
    const game = await prisma.game.findFirst({
      where: { characters: { some: {} } },
    });

    if (!game) {
      console.log('No games with characters found.');
      return;
    }

    const slug = game.slug;
    console.log(`Testing with game: ${slug}`);

    const res = await axios.get(
      `http://localhost:3000/api/v0/character/${slug}/list`,
    );

    if (res.data.length > 0) {
      const char = res.data[0];
      console.log('Sample Character:', char.name);
      console.log('Weapon Object:', char.weapon);
      console.log('WeaponType String:', char.weaponType);

      if (char.weapon && char.weapon.id) {
        console.log('SUCCESS: Weapon relation is populated.');
      } else {
        console.error('FAILURE: Weapon relation is missing.');
      }
    } else {
      console.log('No characters returned from API.');
    }
  } catch (e: any) {
    console.error('Verification failed:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

verify();
