// @ts-nocheck
import { PrismaClient, EventType } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

// --- Parsing Logic ---
function parseEventContent(content: string) {
  const result: any = {
    period: null,
    banners: [],
  };

  const dateRegex =
    /(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2})\s*~\s*(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2})/;
  const dateMatch = content.match(dateRegex);
  if (dateMatch) {
    result.period = {
      start: dateMatch[1],
      end: dateMatch[2],
    };
  }

  const sections = content.split('▌').slice(1);

  for (const section of sections) {
    // Determine type by checking keywords in the section text
    // The previous logic split by bullet, but sometimes the "type" applies to the whole section
    // or is mixed.

    // Improved logic: Iterate bullets and treat each as a potential banner source
    const bullets = section.split('●').slice(1);

    for (const bullet of bullets) {
      const isCharWrap = bullet.includes('캐릭터 이벤트 워프');
      const isLCWrap = bullet.includes('광추 이벤트 워프');

      // Attempt to find Date in bullet specific if missing from main?
      // (Usually dates are at the top)

      if (isCharWrap) {
        const charBanner: any = {
          title: '',
          type: 'character',
          items: { stars5: [], stars4: [] },
        };

        const star5Match = bullet.match(/한정 ★5 캐릭터\s*「([^」]+)」/);
        if (star5Match) {
          const name = cleanName(star5Match[1]);
          charBanner.items.stars5.push(name);
          charBanner.title = `${name} 픽업 (캐릭터)`;
        }

        const star4Part = bullet.substring(bullet.indexOf('★4 캐릭터'));
        const star4Matches = star4Part.match(/「([^」]+)」/g);
        if (star4Matches) {
          star4Matches.forEach((m: string) =>
            charBanner.items.stars4.push(cleanName(m.replace(/[「」]/g, ''))),
          );
        }

        if (charBanner.items.stars5.length > 0) result.banners.push(charBanner);
      } else if (isLCWrap) {
        const lcBanner: any = {
          title: '',
          type: 'light_cone',
          items: { stars5: [], stars4: [] },
        };

        const star5Match = bullet.match(/한정 ★5 광추\s*「([^」]+)」/);
        if (star5Match) {
          const name = cleanName(star5Match[1]);
          lcBanner.items.stars5.push(name);
          lcBanner.title = `${name} 픽업 (광추)`;
        }

        const star4Part = bullet.substring(bullet.indexOf('★4 광추'));
        const star4Matches = star4Part.match(/「([^」]+)」/g);
        if (star4Matches) {
          star4Matches.forEach((m: string) =>
            lcBanner.items.stars4.push(cleanName(m.replace(/[「」]/g, ''))),
          );
        }

        if (lcBanner.items.stars5.length > 0) result.banners.push(lcBanner);
      }
    }
  }

  return result;
}

function cleanName(name: string): string {
  return name.replace(/\([^)]+\)/g, '').trim();
}

// --- Import Logic ---
async function main() {
  const gameSlug = 'starrail';
  const game = await prisma.game.findUnique({
    where: { slug: gameSlug },
  });

  if (!game) {
    console.error(`Game '${gameSlug}' not found.`);
    return;
  }

  const eventsPath = path.join(
    process.cwd(),
    'data/crawlers/starrail/events.json',
  );
  if (!fs.existsSync(eventsPath)) return;

  const events = JSON.parse(fs.readFileSync(eventsPath, 'utf-8'));
  console.log(`Processing ${events.length} events...`);

  let count = 0;

  for (const event of events) {
    const meta = event.metadata;

    // Only process 'warp' type events with this detailed parser
    // Or try parsing everything
    if (meta.content) {
      const parsed = parseEventContent(meta.content);

      if (parsed.banners.length > 0) {
        // Found banners! Format: YYYY/MM/DD HH:mm
        let startTime = new Date(meta.created_at * 1000);
        let endTime: Date | null = null;

        if (parsed.period) {
          // Manually parse format "2026/01/28 12:00"
          // Construct ISO string
          const parseDate = (str: string) => {
            // "2026/01/28 12:00" -> "2026-01-28T12:00:00"
            const [ymd, hm] = str.split(' ');
            const [y, m, d] = ymd.split('/');
            return new Date(`${y}-${m}-${d}T${hm}:00`);
          };
          try {
            startTime = parseDate(parsed.period.start);
            endTime = parseDate(parsed.period.end);
          } catch (e) {
            console.warn(`Failed to parse date: ${parsed.period.start}`);
          }
        } else if (meta.event_start_date && meta.event_start_date !== '0') {
          // Fallback
        }

        // Create event per banner
        for (const banner of parsed.banners) {
          console.log(
            `Creating GACHA event: ${banner.title} (${startTime.toISOString()})`,
          );
          await prisma.calendarEvent.create({
            data: {
              gameId: game.id,
              type: EventType.GACHA,
              title: banner.title,
              startTime: startTime,
              endTime: endTime,
              imageUrl: meta.cover, // Use main event cover
              officialLink: event.sourceUrl,
              targetId: String(meta.id),
              metadata: {
                parsing_type: 'parsed_banner',
                subtype: banner.type, // character, light_cone
                pickup: banner.items,
                original_subject: meta.subject,
              },
            },
          });
          count++;
        }
      } else {
        // Fallback for non-banner events (like Update Notice)
        if (meta.type === 'update') {
          console.log(`Creating MAINTENANCE event: ${meta.subject}`);
          await prisma.calendarEvent.create({
            data: {
              gameId: game.id,
              type: EventType.MAINTENANCE,
              title: meta.subject,
              startTime: new Date(meta.created_at * 1000),
              officialLink: event.sourceUrl,
              targetId: String(meta.id),
              metadata: { original_content: meta.content?.substring(0, 100) },
            },
          });
          count++;
        }
      }
    }
  }
  console.log(`Imported ${count} calendar events.`);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
