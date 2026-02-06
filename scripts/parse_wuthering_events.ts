import axios from 'axios';
import fs from 'fs';
import path from 'path';

const URL =
  'https://hw-media-cdn-mingchao.kurogame.com/akiwebsite/website2.0/json/G152/kr/MainMenu.json';

interface WutheringArticle {
  articleId: number;
  articleTitle: string;
  articleContent: string;
  createTime: string;
  startTime: string;
  articleType: number;
}

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
    content: string;
    weapons?: {
      rarity5: string[];
      rarity4: string[];
    };
    characters?: {
      rarity5: string[];
      rarity4: string[];
    };
  };
}

// Helper: Extract weapons/characters from gacha event content
function extractGachaItems(content: string): {
  weapons?: { rarity5: string[]; rarity4: string[] };
  characters?: { rarity5: string[]; rarity4: string[] };
} {
  const result: any = {};

  // 무기 패턴: 5성 무기 「불길」, 4성 무기 「야귀의 신념」, 「멸망의 주파수」
  const weaponMatch = content.match(
    /5성 무기 (「[^」]+」(?:,\s*「[^」]+」)*)[^4]*4성 무기 (「[^」]+」(?:,\s*「[^」]+」)*)/,
  );
  if (weaponMatch) {
    const rarity5 = [
      ...new Set(
        weaponMatch[1]
          .match(/「([^」]+)」/g)
          ?.map((m) => m.replace(/[「」]/g, '')) || [],
      ),
    ];
    const rarity4 = [
      ...new Set(
        weaponMatch[2]
          .match(/「([^」]+)」/g)
          ?.map((m) => m.replace(/[「」]/g, '')) || [],
      ),
    ];
    result.weapons = { rarity5, rarity4 };
  }

  // 캐릭터 패턴: 5성 공명자 「에이메스」 or 5성 캐릭터
  const charMatch = content.match(
    /5성 (?:공명자|캐릭터) (「[^」]+」(?:,\s*「[^」]+」)*)[^4]*4성 (?:공명자|캐릭터) (「[^」]+」(?:,\s*「[^」]+」)*)/,
  );
  if (charMatch) {
    const rarity5 = [
      ...new Set(
        charMatch[1]
          .match(/「([^」]+)」/g)
          ?.map((m) => m.replace(/[「」]/g, '')) || [],
      ),
    ];
    const rarity4 = [
      ...new Set(
        charMatch[2]
          .match(/「([^」]+)」/g)
          ?.map((m) => m.replace(/[「」]/g, '')) || [],
      ),
    ];
    result.characters = { rarity5, rarity4 };
  }

  return result;
}

// Helper: Parse time from Korean format
function parseKoreanTime(timeStr: string): string | null {
  // 2026년 2월 26일 09:59 -> 2026-02-26 09:59:00
  const match = timeStr.match(
    /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(\d{1,2}):(\d{2})/,
  );
  if (match) {
    const [, year, month, day, hour, minute] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} ${hour.padStart(2, '0')}:${minute}:00`;
  }
  return null;
}

// Helper: Extract time range from content
function extractTimeRange(content: string): {
  startTime: string;
  endTime: string;
} {
  // Pattern 1: "버전 업데이트 이후 ~"
  if (content.includes('버전 업데이트 이후')) {
    const endMatch = content.match(
      /버전 업데이트 이후\s*~\s*(\d{4}년\s*\d{1,2}월\s*\d{1,2}일\s*\d{1,2}:\d{2})/,
    );
    if (endMatch) {
      const endTime = parseKoreanTime(endMatch[1]);
      return {
        startTime: 'UPDATE_AFTER',
        endTime: endTime || 'UNKNOWN',
      };
    }
  }

  // Pattern 2: Full time range with Korean time
  // 2026년 1월 15일 10:00 ~ 2026년 2월 4일 11:59 (서버 시간)
  // 2026년 1월 15일 11:00 ~ 2026년 2월 4일 12:59 (한국 시간)
  const koreanTimeMatch = content.match(
    /(\d{4}년\s*\d{1,2}월\s*\d{1,2}일\s*\d{1,2}:\d{2})\s*~\s*(\d{4}년\s*\d{1,2}월\s*\d{1,2}일\s*\d{1,2}:\d{2})\s*\(한국 시간\)/,
  );

  if (koreanTimeMatch) {
    const startTime = parseKoreanTime(koreanTimeMatch[1]);
    const endTime = parseKoreanTime(koreanTimeMatch[2]);
    return {
      startTime: startTime || 'UNKNOWN',
      endTime: endTime || 'UNKNOWN',
    };
  }

  // Pattern 3: Server time (fallback)
  const serverTimeMatch = content.match(
    /(\d{4}년\s*\d{1,2}월\s*\d{1,2}일\s*\d{1,2}:\d{2})\s*~\s*(\d{4}년\s*\d{1,2}월\s*\d{1,2}일\s*\d{1,2}:\d{2})\s*\(서버 시간\)/,
  );

  if (serverTimeMatch) {
    const startTime = parseKoreanTime(serverTimeMatch[1]);
    const endTime = parseKoreanTime(serverTimeMatch[2]);
    return {
      startTime: startTime || 'UNKNOWN',
      endTime: endTime || 'UNKNOWN',
    };
  }

  return { startTime: 'UNKNOWN', endTime: 'UNKNOWN' };
}

// Helper: Sort events by time
function sortEventsByTime(events: ParsedEvent[]): ParsedEvent[] {
  return [...events].sort((a, b) => {
    if (a.startTime === 'UPDATE_AFTER') return 1;
    if (b.startTime === 'UPDATE_AFTER') return -1;
    if (a.startTime === 'UNKNOWN') return 1;
    if (b.startTime === 'UNKNOWN') return -1;
    return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
  });
}

async function parseWutheringEvents() {
  try {
    console.log('Fetching data...');
    const response = await axios.get(URL);
    const rawData = response.data;

    if (!rawData || !Array.isArray(rawData.article)) {
      console.error('Invalid data structure');
      return;
    }

    const articles: WutheringArticle[] = rawData.article;
    const cutoffDate = new Date('2025-12-01T00:00:00');

    // Filter and Deduplicate
    const processedMap = new Map<number, boolean>();
    const results: ParsedEvent[] = [];

    for (const item of articles) {
      if (processedMap.has(item.articleId)) continue;
      processedMap.set(item.articleId, true);

      const itemDate = new Date(item.startTime);
      if (itemDate < cutoffDate) continue;

      const title = item.articleTitle;
      const isTuning = title.includes('이벤트 튜닝');
      const isUpdate = title.includes('버전 내용 안내');

      if (!isTuning && !isUpdate) continue;

      // Fetch Detail
      const detailUrl = `https://hw-media-cdn-mingchao.kurogame.com/akiwebsite/website2.0/json/G152/kr/article/${item.articleId}.json`;
      let cleanContent = '';

      try {
        const detailRes = await axios.get(detailUrl);
        if (detailRes.data && detailRes.data.articleContent) {
          cleanContent = detailRes.data.articleContent
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ');
        }
      } catch (e) {
        console.error(`Failed to fetch detail for ${item.articleId}`);
        continue;
      }

      const timeRange = extractTimeRange(cleanContent);
      const gachaItems = isTuning ? extractGachaItems(cleanContent) : {};

      const event: ParsedEvent = {
        title: title,
        type: isTuning ? 'GACHA' : 'MAINTENANCE',
        startTime: timeRange.startTime,
        endTime: timeRange.endTime,
        officialLink: `https://wutheringwaves.kurogames.com/kr/main/news/detail/${item.articleId}`,
        metadata: {
          original_subject: title,
          description: isTuning ? 'Gacha Event' : 'Update Guide',
          source_id: item.articleId.toString(),
          content: cleanContent,
          ...gachaItems,
        },
      };

      results.push(event);

      // Small delay
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    console.log(`Parsed ${results.length} events. Sorting by time...`);

    // Sort events by time
    const sorted = sortEventsByTime(results);

    console.log(`Total ${sorted.length} events.`);
    console.log(JSON.stringify(sorted, null, 2));

    const outputPath = path.join(
      process.cwd(),
      'data/crawlers/wutheringwaves/parsed_events.json',
    );
    if (!fs.existsSync(path.dirname(outputPath))) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    }
    fs.writeFileSync(outputPath, JSON.stringify(sorted, null, 2), 'utf-8');
    console.log(`Saved parsed events to ${outputPath}`);
  } catch (error) {
    console.error('Error parsing events:', error);
  }
}

parseWutheringEvents();
