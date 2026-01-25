import { prisma } from '../src/utils/prisma';

function replaceUrlRecursively(obj: any): any {
  if (typeof obj === 'string') {
    if (obj.includes('http://localhost:3000/assets/')) {
      return obj.replace('http://localhost:3000/assets/', 'assets/');
    }
    return obj;
  } else if (Array.isArray(obj)) {
    return obj.map((item) => replaceUrlRecursively(item));
  } else if (typeof obj === 'object' && obj !== null) {
    const newObj: any = {};
    for (const key of Object.keys(obj)) {
      newObj[key] = replaceUrlRecursively(obj[key]);
    }
    return newObj;
  }
  return obj;
}

async function fixUrls() {
  console.log('Starting URL fix...');
  try {
    const characters = await prisma.character.findMany();
    let count = 0;

    for (const char of characters) {
      if (!char.metadata) continue;

      const originalJson = JSON.stringify(char.metadata);
      if (!originalJson.includes('http://localhost:3000/assets/')) continue;

      const newMetadata = replaceUrlRecursively(char.metadata);

      // Double check simple string replacement isn't faster/safer,
      // but recursive is safer for JSON structure preservation.
      // Actually, since we want to replace ALL occurrences in the JSON string, string replacement is fine and simpler?
      // "http://localhost:3000/assets/" -> "assets/" globally in the string.
      // Let's stick to object manipulation if we want to be safe about keys vs values?
      // But URL is likely only in values.
      // Global string replacement is risky if a key is named like that (unlikely).
      // Let's use string replacement on the whole JSON string for efficiency and simplicity given the specific pattern.

      const newJsonString = originalJson.replaceAll(
        'http://localhost:3000/assets/',
        'assets/',
      );
      const finalMetadata = JSON.parse(newJsonString);

      await prisma.character.update({
        where: { id: char.id },
        data: { metadata: finalMetadata },
      });
      count++;
    }
    console.log(`Updated ${count} characters.`);
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

fixUrls();
