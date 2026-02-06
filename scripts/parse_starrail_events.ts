import fs from 'fs';
import path from 'path';

const EVENTS_PATH = path.join(
  process.cwd(),
  'data/crawlers/starrail/events.json',
);

// Prisma Schema-like interface for visualization
interface CalendarEvent {
  title: string;
  startTime: string; // ISO string or KST string
  endTime: string; // ISO string or KST string
  type: 'GACHA' | 'EVENT' | 'UPDATE';
  officialLink?: string; // Mapped from sourceUrl
  metadata: any;
}

function parseEvents() {
  const rawData = fs.readFileSync(EVENTS_PATH, 'utf-8');
  const events = JSON.parse(rawData);

  const parsedEvents: CalendarEvent[] = [];

  for (const eventWrapper of events) {
    const metadata = eventWrapper.metadata;
    if (!metadata) continue;

    const content = metadata.content || '';
    const subject = metadata.subject || '';
    const sourceUrl = eventWrapper.sourceUrl;

    // Filter for "Event Warp" (이벤트 워프)
    if (!subject.includes('이벤트 워프') && !content.includes('이벤트 워프')) {
      continue;
    }
    // ... (omitted lines) ...

    // Extract Dates
    // Pattern: "2026/01/28 12:00 ~ 2026/02/12 15:00"
    const dateRegex =
      /(\d{4}\/\d{2}\/\d{2}\s\d{2}:\d{2}|20\d{2}\/\d{2}\/\d{2}.*\s?버전 업데이트 후)\s?~\s?(\d{4}\/\d{2}\/\d{2}\s\d{2}:\d{2})/;
    const dateMatch = content.match(dateRegex);

    let startTime = '';
    let endTime = '';

    if (dateMatch) {
      const dStart = parseDate(dateMatch[1]);
      const dEnd = parseDate(dateMatch[2]);

      // Handle "Update after" case
      if (dateMatch[1].includes('버전 업데이트 후')) {
        startTime = 'UPDATE_AFTER';
      } else {
        startTime = toKSTString(dStart);
      }
      endTime = toKSTString(dEnd);
    } else {
      //   console.warn(`Could not parse date for event: ${subject}`);
      // Try to fallback?
    }

    // Updated Extraction Logic:
    // 1. Identify "Rate Up" blocks. These start with "●" and end with "의 워프 성공률이 일시적으로 증가합니다."
    // 2. Parse items only from these blocks to avoid footnotes.

    const rateUpBlocks: string[] = [];
    // Regex to capture the block.
    // match "●" followed by anything (non-greedy) until "의 워프 성공률이 일시적으로 증가합니다."
    const blockRegex = /●\s*(.*?)\s*의 워프 성공률이 일시적으로 증가합니다\./g;

    let blockMatch;
    while ((blockMatch = blockRegex.exec(content)) !== null) {
      rateUpBlocks.push(blockMatch[1]);
    }

    const extractFromBlocks = (marker: string, blocks: string[]) => {
      let allNames: string[] = [];

      for (const block of blocks) {
        const parts = block.split('★');
        const found = parts.filter((p) => p.startsWith(marker));

        for (const seg of found) {
          // The segment is inside a valid block, so we generally trust brackets here.
          // But we should still be careful if multiple rarities are in one block (e.g. 5 star and 4 star).
          // They are separated by commas usually.
          // The 'seg' starts at '5 캐릭터' and goes to the end of block or next star.
          // Actually 'split' handles the "next star" cutoff.
          // So 'seg' is "5 캐릭터 [Names] , " (and stopped before next star).

          const matches = [...seg.matchAll(/「(.*?)」/g)];
          allNames.push(...matches.map((m) => m[1]));
        }
      }
      return allNames;
    };

    // Deduplicate items
    const uniqueItems = (items: string[]) => Array.from(new Set(items));

    const char5 = uniqueItems(extractFromBlocks('5 캐릭터', rateUpBlocks));
    const char4 = uniqueItems(extractFromBlocks('4 캐릭터', rateUpBlocks));
    const lc5 = uniqueItems(extractFromBlocks('5 광추', rateUpBlocks));
    const lc4 = uniqueItems(extractFromBlocks('4 광추', rateUpBlocks));

    const hasChars = char5.length > 0 || char4.length > 0;
    const hasLcs = lc5.length > 0 || lc4.length > 0;

    if (hasChars || hasLcs) {
      parsedEvents.push({
        title: subject, // Unified title
        type: 'GACHA',
        startTime,
        endTime,
        officialLink: sourceUrl,
        metadata: {
          original_subject: subject,
          description: 'Event Warp',
          source_id: metadata.id,
          content,
          characters: {
            rarity5: char5.map(cleanName),
            rarity4: char4.map(cleanName),
          },
          items: {
            rarity5: lc5.map(cleanName),
            rarity4: lc4.map(cleanName),
          },
        },
      });
    }
  }

  // Save to file
  const outputPath = path.join(path.dirname(EVENTS_PATH), 'parsed_events.json');
  fs.writeFileSync(outputPath, JSON.stringify(parsedEvents, null, 2));
  console.log(`Saved ${parsedEvents.length} parsed events to ${outputPath}`);
  console.log(JSON.stringify(parsedEvents, null, 2));
}

function cleanName(rawName: string): string {
  return rawName.split('(')[0];
}

function parseDate(dateStr: string): Date {
  const cleaned = dateStr.replace(/\//g, '-');
  const date = new Date(cleaned);
  // User instruction: Server Time is UTC+8. To match KST (UTC+9), add 1 hour.
  date.setHours(date.getHours() + 1);
  return date;
}

function toKSTString(date: Date): string {
  // Manual format to YYYY-MM-DDTHH:mm:ss+09:00 or similar
  // Or just YYYY-MM-DD HH:mm:ss

  // Since we already manipulated the 'date' object to be "13:00" in its internal "Local" representation (if local is KST)
  // Wait, if local is KST, 'date' object holds the epoch.
  // We added 1 hour.
  // If we just want to print "13:00", we can Format it.

  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const min = pad(date.getMinutes());
  const sec = pad(date.getSeconds());

  return `${year}-${month}-${day} ${hour}:${min}:${sec}`;
}

parseEvents();
