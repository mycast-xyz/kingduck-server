import fs from 'fs';
import path from 'path';

const EVENTS_PATH = path.join(
  process.cwd(),
  'data/crawlers/starrail/events.json',
);

interface ParsedUpdateEvent {
  title: string;
  type: 'MAINTENANCE' | 'EVENT';
  startTime: string;
  endTime: string;
  description?: string;
  metadata?: any;
}

function parseUpdates() {
  const rawData = fs.readFileSync(EVENTS_PATH, 'utf-8');
  const events = JSON.parse(rawData);
  const results: ParsedUpdateEvent[] = [];

  for (const eventWrapper of events) {
    const metadata = eventWrapper.metadata;
    if (!metadata) continue;

    const subject = metadata.subject || '';
    const content = metadata.content || '';

    // Filter for Version Update Guide (버전 업데이트 안내)
    if (!subject.includes('버전 업데이트 안내')) {
      continue;
    }

    // 1. Extract Update Time (Maintenance)
    // "2025/12/17 06:00 (UTC+8)에 시작되며 예상 소요 시간은 5시간입니다."
    const updateTimeRegex =
      /(\d{4}\/\d{2}\/\d{2}\s\d{2}:\d{2})\s?\(UTC\+8\).*?(\d+)시간/;
    const updateMatch = content.match(updateTimeRegex);
    let updateEndTime: Date | null = null;
    let maintainStartTime: Date | null = null;

    if (updateMatch) {
      const startTimeStr = updateMatch[1];
      const durationHours = parseInt(updateMatch[2], 10);

      // Parse Start Time (server time UTC+8)
      // We process all dates as UTC+8 -> KST(+9) logic if consistent with previous steps,
      // OR we just follow specific calculating instructions.
      // User said: "It starts at 2025/12/17 06:00 (UTC+8)... simply add 5 hours to this time".

      const d = new Date(startTimeStr.replace(/\//g, '-'));
      // Treat 'd' as if it is in Local Time or UTC?
      // The string is "2025-12-17 06:00".
      // If we blindly add 5 hours to the hour component:
      maintainStartTime = new Date(d);
      maintainStartTime.setHours(maintainStartTime.getHours() + 1); // Convert Server(+8) to KST(+9) roughly

      updateEndTime = new Date(maintainStartTime);
      updateEndTime.setHours(updateEndTime.getHours() + durationHours);

      // Add Maintenance Event
      const maintenanceEvent: any = {
        gameId: 2, // StarRail
        type: 'MAINTENANCE',
        title: `v${subject.split(' ')[0]} 점검`,
        startTime: toKSTString(maintainStartTime),
        endTime: toKSTString(updateEndTime),
        officialLink: `https://www.hoyolab.com/article/${metadata.id}`,
        targetId: `${metadata.id}_MAINTENANCE`,
        metadata: {
          description: `업데이트 점검 (예상 소요 ${durationHours}시간)`,
          original_subject: subject,
          source_id: metadata.id,
        },
      };
      results.push(maintenanceEvent);
    }

    // 2. Extract New Events
    // Look for "5. 신규 이벤트" or similar section header if number changes
    const eventSectionHeader = /^\d+\.\s*신규 이벤트/m;
    const matchHeader = content.match(eventSectionHeader);

    if (matchHeader && matchHeader.index !== undefined) {
      // Start searching from here
      const startIndex = matchHeader.index + matchHeader[0].length;
      // Find next section (e.g. "6. 기타 내용") or end
      const nextSectionRegex = /^\d+\.\s*|▌/m;
      // We need to find the *next* occurrence of a section header after startIndex.
      // Actually, easiest way is to slice the substring first.
      let eventsText = content.slice(startIndex);

      // Find cut-off point
      const cutOffMatch = eventsText.match(/^\d+\.\s*.*$/m); // Matches "6. 기타 내용"
      if (cutOffMatch && cutOffMatch.index) {
        eventsText = eventsText.slice(0, cutOffMatch.index);
      }

      // Now parse individual events inside `eventsText`
      // They differ by "■ " blocks usually
      const eventBlocks = eventsText
        .split('■ ')
        .filter((s) => s.trim().length > 0);

      for (const block of eventBlocks) {
        const lines = block.split('\n');
        const eventTitle = lines[0].trim(); // First line is title
        const fullBlock = block.trim();

        // Extract Date
        // "이벤트 기간: 3.8 버전 업데이트 후 ~ 2026/02/09 03:59 (서버 시간)"
        // "이벤트 기간: 2026/01/07 12:00 ~ 2026/01/28 11:59 (서버 시간)"
        const periodRegex =
          /이벤트 기간:\s*(.*?)\s*~?\s*(\d{4}\/\d{2}\/\d{2}\s\d{2}:\d{2})?/;
        const periodMatch = fullBlock.match(periodRegex);

        let evtStartStr = '';
        let evtEndStr = '';
        let evtStartTime: Date | null = null;
        let evtEndTime: Date | null = null;

        if (periodMatch) {
          const startRaw = periodMatch[1];
          const endRaw = periodMatch[2]; // Might be undefined if single line? Regex above expects range.
          // Let's refine regex to ensure we capture the END part definitely.
          // Actually the line usually has "~" inside.
        }

        // Better Line-by-line check for "이벤트 기간"
        const periodLine = lines.find((l) => l.includes('이벤트 기간'));
        if (periodLine) {
          const tildeParts = periodLine.split('~');
          if (tildeParts.length >= 2) {
            let startPart = tildeParts[0].replace('이벤트 기간:', '').trim();
            let endPart = tildeParts[1].trim();
            // endPart might have "(서버 시간)" at end
            endPart = endPart.replace(/\(.*\)/, '').trim();

            // Parse Start
            if (startPart.includes('버전 업데이트 후') && updateEndTime) {
              evtStartTime = updateEndTime;
            } else {
              // Try parse date
              const sMatch = startPart.match(
                /\d{4}\/\d{2}\/\d{2}\s\d{2}:\d{2}/,
              );
              if (sMatch) {
                evtStartTime = parseDate(sMatch[0]);
              }
            }

            // Parse End
            const eMatch = endPart.match(/\d{4}\/\d{2}\/\d{2}\s\d{2}:\d{2}/);
            if (eMatch) {
              evtEndTime = parseDate(eMatch[0]);
            }
          }
        }

        if (evtStartTime && evtEndTime) {
          const newEvent: any = {
            gameId: 2, // StarRail
            type: 'EVENT',
            title: eventTitle,
            startTime: toKSTString(evtStartTime),
            endTime: toKSTString(evtEndTime),
            officialLink: `https://www.hoyolab.com/article/${metadata.id}`,
            targetId: `${metadata.id}_${eventTitle}`,
            metadata: {
              description: fullBlock.slice(0, 200) + '...',
              original_subject: subject,
              source_id: metadata.id,
              full_content: fullBlock,
            },
          };
          results.push(newEvent);
        }
      }
    }
  }

  console.log(JSON.stringify(results, null, 2));

  const outputPath = path.join(
    process.cwd(),
    'data/crawlers/starrail/parsed_updates.json',
  );
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`Saved parsed updates to ${outputPath}`);
}

function parseDate(dateStr: string): Date {
  const cleaned = dateStr.replace(/\//g, '-');
  const date = new Date(cleaned);
  // Server Time UTC+8 -> KST UTC+9 (+1h)
  date.setHours(date.getHours() + 1);
  return date;
}

function toKSTString(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const min = pad(date.getMinutes());
  const sec = pad(date.getSeconds());
  return `${year}-${month}-${day} ${hour}:${min}:${sec}`;
}

parseUpdates();
