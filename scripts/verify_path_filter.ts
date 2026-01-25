import axios from 'axios';
import { prisma } from '../src/utils/prisma';

async function verify() {
  try {
    const slug = 'starrail';

    // 1. Get List with pathId filter
    // Assuming pathId 2 exists (it was "Knight" in previous logs)
    const pathId = 2;
    console.log(`Testing with game: ${slug} and pathId: ${pathId}`);

    const res = await axios.get(
      `http://localhost:3000/api/v0/character/${slug}/list?pathId=${pathId}`,
    );

    if (res.data.length > 0) {
      console.log(`Found ${res.data.length} characters.`);
      const allMatch = res.data.every((c: any) => c.pathId === pathId);
      if (allMatch) {
        console.log('SUCCESS: All returned characters have correct pathId.');
      } else {
        console.error('FAILURE: Some characters do not match pathId filter.');
      }
    } else {
      console.warn(
        'No characters found with this pathId. Cannot verify logic fully without data.',
      );
    }

    // 2. Test Combined filter (Element + Path)
    // elementId 7 (Imaginary)
    const elementId = 7;
    console.log(`Testing with elementId: ${elementId} and pathId: ${pathId}`);
    const combinedRes = await axios.get(
      `http://localhost:3000/api/v0/character/${slug}/list?pathId=${pathId}&elementId=${elementId}`,
    );
    if (combinedRes.data.length > 0) {
      console.log(`Found ${combinedRes.data.length} characters.`);
      const allMatch = combinedRes.data.every(
        (c: any) => c.pathId === pathId && c.elementId === elementId,
      );
      if (allMatch) {
        console.log('SUCCESS: All returned characters match combined filter.');
      } else {
        console.error('FAILURE: Some characters do not match combined filter.');
      }
    }
  } catch (e: any) {
    console.error('Verification failed:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

verify();
