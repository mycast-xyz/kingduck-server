import fs from 'fs';
import path from 'path';

interface ParsedEvent {
  title: string;
  type: 'GACHA' | 'MAINTENANCE';
  startTime: string;
  endTime: string;
  officialLink: string;
  metadata: {
    original_subject: string;
    description: string;
    source_id: string;
    content?: string;
  };
}

interface UpdateEvent {
  gameId: number;
  type: 'EVENT';
  title: string;
  startTime: string;
  endTime: string;
  officialLink: string;
  targetId: string;
  metadata: {
    description: string;
    original_subject: string;
    source_id: string;
    full_content: string;
  };
}

const PARSED_EVENTS_PATH = path.join(
  process.cwd(),
  'data/crawlers/wutheringwaves/parsed_events.json',
);

const OUTPUT_PATH = path.join(
  process.cwd(),
  'data/crawlers/wutheringwaves/parsed_updates.json',
);

function extractMaintenanceTime(content: string): {
  startTime: string | null;
  endTime: string | null;
} {
  // Find maintenance section
  const maintenanceRegex =
    /점검 시간[:：]\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(\d{1,2}):(\d{2})\s*~\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(\d{1,2}):(\d{2})/;
  const match = content.match(maintenanceRegex);

  if (!match) {
    return { startTime: null, endTime: null };
  }

  const [, y1, m1, d1, h1, min1, y2, m2, d2, h2, min2] = match;
  const startTime = `${y1}-${m1.padStart(2, '0')}-${d1.padStart(2, '0')} ${h1.padStart(2, '0')}:${min1}:00`;
  const endTime = `${y2}-${m2.padStart(2, '0')}-${d2.padStart(2, '0')} ${h2.padStart(2, '0')}:${min2}:00`;

  return { startTime, endTime };
}

function extractMaintenanceContent(content: string): string {
  // Extract only the maintenance section
  const maintenanceRegex =
    /\[점검 시간[^\]]*\]([\s\S]*?)(?=\[버전 콘텐츠 안내\]|$)/;
  const match = content.match(maintenanceRegex);

  if (match) {
    return match[0].trim();
  }

  return content.substring(0, 500);
}

function extractEventBlocks(content: string): string[] {
  const eventBlocks: string[] = [];

  // Look for the "신규 이벤트 및 콘텐츠" section
  const eventSectionStart = content.indexOf('✦신규 이벤트 및 콘텐츠✦');

  if (eventSectionStart === -1) {
    return eventBlocks;
  }

  // Find the end of event section
  const afterEventSection = content.substring(eventSectionStart);
  const sectionEndMatch = afterEventSection.match(
    /✦(?:기타 신규 콘텐츠|버전 조정 개선|시스템|육성)✦/,
  );

  const eventSection = sectionEndMatch
    ? afterEventSection.substring(0, sectionEndMatch.index)
    : afterEventSection.substring(0, 10000);

  // First, find major event type sections: [버전 이벤트]:, [콜라보 이벤트]:, [H5 웹 이벤트]:, [신규 콘텐츠]:
  const sectionMarkerRegex = /\[([^\]]*이벤트[^\]]*|신규 콘텐츠)\][:：]\s*/g;
  const sectionMatches = [...eventSection.matchAll(sectionMarkerRegex)];

  for (let i = 0; i < sectionMatches.length; i++) {
    const sectionMatch = sectionMatches[i];
    const sectionType = sectionMatch[1]; // e.g., "버전 이벤트", "콜라보 이벤트"
    const sectionStart = sectionMatch.index! + sectionMatch[0].length;

    // Find where this section ends (next section or end)
    const nextSection = sectionMatches[i + 1];
    const sectionEnd = nextSection ? nextSection.index! : eventSection.length;

    const sectionContent = eventSection.substring(sectionStart, sectionEnd);

    // Now split this section into individual events by looking for [Event Name] pattern
    const individualEventRegex = /\[([^\]]+)\]([^\[]*?)(?=\[|$)/gs;
    const individualMatches = [
      ...sectionContent.matchAll(individualEventRegex),
    ];

    for (const eventMatch of individualMatches) {
      const eventName = eventMatch[1].trim();
      let eventContent = eventMatch[2].trim();

      // Skip if this looks like a section marker (contains "이벤트" keyword without specific event name)
      if (eventName.includes('이벤트') && eventContent.length < 50) {
        continue;
      }

      // Skip very short content
      if (eventContent.length < 50) {
        continue;
      }

      // Construct the full event block with type prefix
      eventBlocks.push(`[${sectionType}]:\n[${eventName}] ${eventContent}`);
    }
  }

  return eventBlocks;
}

function parseEventTimeFromBlock(block: string): {
  startTime: string | null;
  endTime: string | null;
} {
  // Try multiple patterns to find event period

  // Pattern 1: ✦이벤트 기간✦ or ✦오픈 시간✦ with colon
  let periodRegex = /✦(?:이벤트 기간|오픈 시간|이벤트 시간)✦[:：]\s*([^\n]+)/i;
  let periodMatch = block.match(periodRegex);

  // Pattern 2: Without colon, just whitespace
  if (!periodMatch) {
    periodRegex = /✦(?:이벤트 기간|오픈 시간|이벤트 시간)✦\s+([^\n]+)/i;
    periodMatch = block.match(periodRegex);
  }

  // Pattern 3: Without ✦ markers
  if (!periodMatch) {
    periodRegex = /(?:이벤트 기간|오픈 시간|오픈 조건)[:：]\s*([^\n]+)/i;
    periodMatch = block.match(periodRegex);
  }

  if (!periodMatch) {
    return { startTime: null, endTime: null };
  }

  const periodText = periodMatch[1];

  // Full datetime range "2026년 2월 15일 05:00 ~ 2026년 3월 18일 12:59"
  const fullDateRegex =
    /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(\d{1,2}):(\d{2})\s*~\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(\d{1,2}):(\d{2})/;
  const fullMatch = periodText.match(fullDateRegex);

  if (fullMatch) {
    const [, y1, m1, d1, h1, min1, y2, m2, d2, h2, min2] = fullMatch;
    const startTime = `${y1}-${m1.padStart(2, '0')}-${d1.padStart(2, '0')} ${h1.padStart(2, '0')}:${min1}:00`;
    const endTime = `${y2}-${m2.padStart(2, '0')}-${d2.padStart(2, '0')} ${h2.padStart(2, '0')}:${min2}:00`;
    return { startTime, endTime };
  }

  // "버전 업데이트 후 ~ date"
  const updateAfterRegex =
    /(?:\d+\.\d+\s*버전\s*업데이트\s*(?:이후|후)|버전\s*업데이트\s*(?:이후|후))\s*~\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(\d{1,2}):(\d{2})/;
  const updateMatch = periodText.match(updateAfterRegex);

  if (updateMatch) {
    const [, y, m, d, h, min] = updateMatch;
    const endTime = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')} ${h.padStart(2, '0')}:${min}:00`;
    return { startTime: 'UPDATE_AFTER', endTime };
  }

  // "버전 업데이트 후 ~" (no specific end time)
  if (periodText.match(/버전\s*업데이트\s*(?:이후|후)\s*~/)) {
    return { startTime: 'UPDATE_AFTER', endTime: 'PERMANENT' };
  }

  return { startTime: null, endTime: null };
}

function extractEventTitle(block: string): string {
  // Block format: "[EventType]:\n[EventName] description..."
  // Extract the event name which appears after ": " and before next description

  const lines = block.split('\n');

  if (lines.length < 2) {
    return 'Unknown Event';
  }

  // Skip first line (event type marker)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines
    if (!line) continue;

    // Skip lines that look like markers (starting with✦)
    if (line.startsWith('✦')) continue;

    // First meaningful line after the marker should contain the event name
    // Extract text in brackets: [Event Name] description
    const bracketMatch = line.match(/\[([^\]]+)\]/);
    if (bracketMatch) {
      return bracketMatch[1].trim();
    }

    // If no brackets, take first substantial word/phrase
    const words = line.split(' ').filter((w) => w.length > 2);
    if (words.length > 0) {
      return words.slice(0, 3).join(' ');
    }
  }

  return 'Unknown Event';
}

async function parseWutheringUpdates() {
  console.log('=== Parsing Wuthering Waves Update Events ===');

  // Read parsed events
  if (!fs.existsSync(PARSED_EVENTS_PATH)) {
    console.error(`Parsed events file not found: ${PARSED_EVENTS_PATH}`);
    return;
  }

  const rawData = fs.readFileSync(PARSED_EVENTS_PATH, 'utf-8');
  const events: ParsedEvent[] = JSON.parse(rawData);

  const updateEvents: UpdateEvent[] = [];

  // Process only MAINTENANCE events
  const maintenanceEvents = events.filter((e) => e.type === 'MAINTENANCE');
  console.log(`Found ${maintenanceEvents.length} maintenance events\n`);

  for (const event of maintenanceEvents) {
    if (!event.metadata.content) continue;

    console.log(`Processing: ${event.title}`);

    // Extract maintenance time
    const { startTime: maintStartTime, endTime: maintEndTime } =
      extractMaintenanceTime(event.metadata.content);

    if (maintStartTime && maintEndTime) {
      console.log(`  Found maintenance: ${maintStartTime} ~ ${maintEndTime}`);

      const maintenanceContent = extractMaintenanceContent(
        event.metadata.content,
      );

      updateEvents.push({
        gameId: 6,
        type: 'MAINTENANCE' as any,
        title: `${event.title.match(/\d+\.\d+/)?.[0] || ''} 버전 점검`.trim(),
        startTime: maintStartTime,
        endTime: maintEndTime,
        officialLink: event.officialLink,
        targetId: `${event.metadata.source_id}_MAINTENANCE`,
        metadata: {
          description: '버전 업데이트 점검',
          original_subject: event.metadata.original_subject,
          source_id: event.metadata.source_id,
          full_content: maintenanceContent,
        },
      });
    }

    // Extract event blocks
    const eventBlocks = extractEventBlocks(event.metadata.content);
    console.log(`  Found ${eventBlocks.length} event blocks`);

    for (const block of eventBlocks) {
      const eventTitle = extractEventTitle(block);
      const { startTime, endTime } = parseEventTimeFromBlock(block);

      // Skip if we couldn't parse time
      if (!startTime || !endTime) {
        console.log(`  ⚠ Skipping "${eventTitle}": no time found`);
        continue;
      }

      // Handle UPDATE_AFTER
      let finalStartTime = startTime;
      if (startTime === 'UPDATE_AFTER' && maintEndTime) {
        finalStartTime = maintEndTime;
      }

      // Handle PERMANENT end time
      let finalEndTime = endTime;
      if (endTime === 'PERMANENT') {
        // Set to far future
        finalEndTime = '2027-12-31 23:59:00';
      }

      const description =
        block.substring(0, 200).replace(/\n/g, ' ').trim() + '...';

      console.log(`  ✓ "${eventTitle}": ${finalStartTime} ~ ${finalEndTime}`);

      updateEvents.push({
        gameId: 6,
        type: 'EVENT',
        title: eventTitle,
        startTime: finalStartTime,
        endTime: finalEndTime,
        officialLink: event.officialLink,
        targetId: `${event.metadata.source_id}_${eventTitle}`,
        metadata: {
          description,
          original_subject: event.metadata.original_subject,
          source_id: event.metadata.source_id,
          full_content: block.trim(),
        },
      });
    }
  }

  console.log(
    `\nTotal ${updateEvents.length} events parsed (MAINTENANCE + EVENT)`,
  );

  // Save to file
  const outputDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(updateEvents, null, 2), 'utf-8');
  console.log(`Saved to ${OUTPUT_PATH}`);
}

parseWutheringUpdates();
