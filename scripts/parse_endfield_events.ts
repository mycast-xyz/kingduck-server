import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

interface ScrapedEvent {
  name: string;
  sourceUrl: string;
  metadata: {
    feedId: number;
    title: string;
    createdDate: string;
    content: string;
    imageUrl: string;
    type: 'GACHA' | 'EVENT';
  };
}

interface ParsedEvent {
  type: 'GACHA' | 'EVENT';
  title: string;
  startTime: string | null;
  endTime: string | null;
  imageUrl: string;
  officialLink: string;
  targetId: string;
  metadata: {
    weapons?: string[];
    characters?: string[];
    featuredWeapons?: string[];
    featuredCharacters?: string[];
    rawContent: string;
  };
}

function extractItems(content: string): {
  weapons: string[];
  characters: string[];
  featuredWeapons: string[];
  featuredCharacters: string[];
} {
  const $ = cheerio.load(content);
  const text = $.text();

  const weapons: string[] = [];
  const characters: string[] = [];
  const featuredWeapons: string[] = [];
  const featuredCharacters: string[] = [];

  // Extract weapon list: 획득 가능한 6성 무기 목록:
  const weaponMatch = text.match(
    /획득 가능한 6성 무기 목록:\s*([^\n]+?)(?:​|※)/,
  );
  if (weaponMatch) {
    const weaponList = weaponMatch[1]
      .split('/')
      .map((w) => w.trim())
      .filter((w) => w && w.length > 0 && w.length < 50 && !w.includes('▼'));
    weapons.push(...weaponList);
  }

  // Extract character list: 획득 가능한 6성 오퍼레이터 목록:
  const charMatch = text.match(
    /획득 가능한 6성 오퍼레이터 목록:\s*([^\n]+?)(?:·|※)/,
  );
  if (charMatch) {
    const charList = charMatch[1]
      .split('/')
      .map((c) => c.trim())
      .filter(
        (c) =>
          c &&
          c.length > 0 &&
          c.length < 50 &&
          !c.includes('▼') &&
          !c.includes('허가'),
      );
    characters.push(...charList);
  }

  // Extract featured weapon: 확률 증가한 6성 무기:
  const featuredWeaponMatch = text.match(
    /확률 증가한 6성 무기:\s*\[([^\]]+)\]/,
  );
  if (featuredWeaponMatch) {
    featuredWeapons.push(featuredWeaponMatch[1].trim());
  }

  // Extract featured character: 확률 증가한 6성 오퍼레이터:
  const featuredCharMatch = text.match(
    /확률 증가한 6성 오퍼레이터:\s*\[([^\]]+)\]/,
  );
  if (featuredCharMatch) {
    featuredCharacters.push(featuredCharMatch[1].trim());
  }

  return { weapons, characters, featuredWeapons, featuredCharacters };
}

function extractDates(content: string): {
  startTime: string | null;
  endTime: string | null;
} {
  const $ = cheerio.load(content);
  const text = $.text();

  // Extract Asia server times: 2026/02/07 12:00 ~ 2026/02/24 04:00
  const dateRangeMatch = text.match(
    /Asia 서버:\s*(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2})\s*~\s*(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2})/,
  );

  if (dateRangeMatch) {
    const startTime = new Date(
      dateRangeMatch[1].replace(/\//g, '-').replace(' ', 'T') + ':00+08:00',
    ).toISOString();
    const endTime = new Date(
      dateRangeMatch[2].replace(/\//g, '-').replace(' ', 'T') + ':00+08:00',
    ).toISOString();
    return { startTime, endTime };
  }

  // For events with vague end dates (e.g., "~ 버전 업데이트 전까지")
  const startOnlyMatch = text.match(
    /Asia 서버:\s*(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2})/,
  );
  if (startOnlyMatch) {
    const startTime = new Date(
      startOnlyMatch[1].replace(/\//g, '-').replace(' ', 'T') + ':00+08:00',
    ).toISOString();
    return { startTime, endTime: null };
  }

  // Alternative pattern for Americas/Europe if Asia not found
  const altDateMatch = text.match(
    /(?:Americas|Europe).*?(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2})\s*~\s*(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2})/,
  );
  if (altDateMatch) {
    const startTime = new Date(
      altDateMatch[1].replace(/\//g, '-').replace(' ', 'T') + ':00-05:00',
    ).toISOString();
    const endTime = new Date(
      altDateMatch[2].replace(/\//g, '-').replace(' ', 'T') + ':00-05:00',
    ).toISOString();
    return { startTime, endTime };
  }

  return { startTime: null, endTime: null };
}

async function parseEndfieldEvents() {
  console.log('Starting Endfield event parsing...');

  // Read the scraped events
  const inputPath = path.join(
    process.cwd(),
    'data',
    'crawlers',
    'endfield',
    'events_preview.json',
  );
  const scrapedEvents: ScrapedEvent[] = JSON.parse(
    fs.readFileSync(inputPath, 'utf-8'),
  );

  const parsedEvents: ParsedEvent[] = [];

  for (const event of scrapedEvents) {
    const { startTime, endTime } = extractDates(event.metadata.content);

    const parsedEvent: ParsedEvent = {
      type: event.metadata.type,
      title: event.metadata.title,
      startTime,
      endTime,
      imageUrl: event.metadata.imageUrl,
      officialLink:
        event.sourceUrl ||
        `https://game.naver.com/lounge/Arknights_Endfield/feed/${event.metadata.feedId}`,
      targetId: event.metadata.feedId.toString(),
      metadata: {
        rawContent: event.metadata.content,
      },
    };

    // Extract items for GACHA events
    if (event.metadata.type === 'GACHA') {
      const { weapons, characters, featuredWeapons, featuredCharacters } =
        extractItems(event.metadata.content);

      if (weapons.length > 0) {
        parsedEvent.metadata.weapons = weapons;
      }
      if (characters.length > 0) {
        parsedEvent.metadata.characters = characters;
      }
      if (featuredWeapons.length > 0) {
        parsedEvent.metadata.featuredWeapons = featuredWeapons;
      }
      if (featuredCharacters.length > 0) {
        parsedEvent.metadata.featuredCharacters = featuredCharacters;
      }
    }

    parsedEvents.push(parsedEvent);
  }

  // Save parsed events
  const outputPath = path.join(
    process.cwd(),
    'data',
    'crawlers',
    'endfield',
    'parsed_events.json',
  );

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(parsedEvents, null, 2), 'utf-8');
  console.log(`\nParsed ${parsedEvents.length} events`);
  console.log(`Output saved to: ${outputPath}`);

  // Print summary
  console.log('\n=== Summary ===');
  parsedEvents.forEach((event, index) => {
    console.log(`\n${index + 1}. ${event.title}`);
    console.log(`   Type: ${event.type}`);
    console.log(`   Start: ${event.startTime || 'N/A'}`);
    console.log(`   End: ${event.endTime || 'N/A'}`);

    if (
      event.metadata.featuredWeapons &&
      event.metadata.featuredWeapons.length > 0
    ) {
      console.log(
        `   Featured Weapons: ${event.metadata.featuredWeapons.join(', ')}`,
      );
    }
    if (
      event.metadata.featuredCharacters &&
      event.metadata.featuredCharacters.length > 0
    ) {
      console.log(
        `   Featured Characters: ${event.metadata.featuredCharacters.join(', ')}`,
      );
    }
    if (event.metadata.weapons && event.metadata.weapons.length > 0) {
      console.log(
        `   Weapons (${event.metadata.weapons.length}): ${event.metadata.weapons.slice(0, 3).join(', ')}${event.metadata.weapons.length > 3 ? '...' : ''}`,
      );
    }
    if (event.metadata.characters && event.metadata.characters.length > 0) {
      console.log(
        `   Characters (${event.metadata.characters.length}): ${event.metadata.characters.slice(0, 3).join(', ')}${event.metadata.characters.length > 3 ? '...' : ''}`,
      );
    }
  });
}

parseEndfieldEvents().catch(console.error);
