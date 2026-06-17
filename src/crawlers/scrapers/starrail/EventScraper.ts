import { axiosGetWithRetry } from '../../utils/httpRetry';
import fs from 'fs';
import path from 'path';
import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import logger from '../../../utils/logger';
import { prisma } from '../../../utils/prisma';
import { EventType } from '@prisma/client';

export class EventScraper extends ScraperBase {
  private readonly API_URL =
    'https://bbs-api-os.hoyolab.com/community/post/wapi/getNewsList?gids=6&page_size=15&type=1';

  constructor() {
    super('starrail');
  }

  async scrape(): Promise<ScrapedData[]> {
    logger.info('Starting Star Rail Event scraping...');

    // Get Game ID
    const game = await prisma.game.findUnique({
      where: { slug: this.gameSlug },
    });

    if (!game) {
      // 실패를 SUCCESS/0건으로 위장하지 않는다 (B-H6)
      throw new Error(`Game ${this.gameSlug} not found in database.`);
    }

    const results: ScrapedData[] = [];

    try {
      const response = await axiosGetWithRetry<any>(this.API_URL, {
        timeout: 15000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      });

      if (response.data.retcode !== 0) {
        // API 오류를 SUCCESS/0건으로 위장하지 않는다 (B-H6)
        throw new Error(`Star Rail event API error: ${response.data.message}`);
      }

      const list = response.data.data.list;
      logger.info(`Fetched ${list.length} posts.`);

      for (const item of list) {
        const post = item.post;

        // Try to find Korean subject
        let subject = post.subject;
        if (post.multi_language_info?.lang_subject?.['ko-kr']) {
          subject = post.multi_language_info.lang_subject['ko-kr'];
        }

        const isWarp = subject.includes('이벤트 워프');
        const isUpdate = subject.includes('버전 업데이트 안내');

        if (isWarp) {
          await this.processWarpEvent(post, subject, game.id);
        } else if (isUpdate) {
          await this.processUpdateEvent(post, subject, game.id);
        }

        if (isWarp || isUpdate) {
          let content = post.content;
          if (post.post_id) {
            const fullContentSource = await this.fetchFullContent(post.post_id);
            if (fullContentSource) content = fullContentSource;
          }

          results.push({
            name: subject,
            sourceUrl: `https://www.hoyolab.com/article/${post.post_id}`,
            metadata: {
              id: post.post_id,
              subject: subject,
              content: content,
              created_at: post.created_at,
            },
          });
        }
      }
    } catch (err) {
      logger.error('Error during scraping', err);
      // 빈 배열로 삼키면 스케줄러가 SUCCESS/0건으로 기록한다 → 실패를 표면화 (B-H6)
      throw err;
    }

    return results;
  }

  private async fetchFullContent(postId: string): Promise<string | null> {
    try {
      await this.delay(200);
      const detailUrl = `https://bbs-api-os.hoyolab.com/community/post/wapi/getPostFull?post_id=${postId}`;
      const detailRes = await axiosGetWithRetry<any>(detailUrl, {
        timeout: 15000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'ko,en;q=0.9',
          'X-Rpc-Language': 'ko-kr',
          'x-rpc-timezone': 'Asia/Seoul',
        },
      });

      if (detailRes.data.retcode === 0) {
        const detailPost = detailRes.data.data.post.post;
        if (detailPost.structured_content) {
          try {
            const struct = JSON.parse(detailPost.structured_content);
            if (Array.isArray(struct)) {
              return struct.map((node: any) => node.insert || '').join('');
            }
          } catch (e) {
            /* ignore */
          }
        }
        return detailPost.desc || detailPost.content;
      }
    } catch (e) {
      logger.warn(`Failed to fetch detail for ${postId}`);
    }
    return null;
  }

  private async processWarpEvent(post: any, subject: string, gameId: number) {
    // Fetch details
    let content = post.content;
    try {
      await this.delay(200);
      const detailUrl = `https://bbs-api-os.hoyolab.com/community/post/wapi/getPostFull?post_id=${post.post_id}`;
      const detailRes = await axiosGetWithRetry<any>(detailUrl, {
        timeout: 15000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'ko,en;q=0.9',
          'X-Rpc-Language': 'ko-kr',
          'x-rpc-timezone': 'Asia/Seoul',
        },
      });

      if (detailRes.data.retcode === 0) {
        const detailPost = detailRes.data.data.post.post;
        if (detailPost.structured_content) {
          try {
            const struct = JSON.parse(detailPost.structured_content);
            if (Array.isArray(struct)) {
              content = struct.map((node: any) => node.insert || '').join('');
            }
          } catch (e) {
            /* ignore */
          }
        } else {
          content = detailPost.desc || detailPost.content;
        }
      }
    } catch (e) {
      logger.warn(`Failed to fetch detail for ${post.post_id}`);
    }

    // Safe check content
    if (typeof content !== 'string') return;

    // Extract Dates
    // Pattern: "2026/01/28 12:00 ~ 2026/02/12 15:00"
    const dateRegex =
      /(\d{4}\/\d{2}\/\d{2}\s\d{2}:\d{2}|20\d{2}\/\d{2}\/\d{2}.*\s?버전 업데이트 후)\s?~\s?(\d{4}\/\d{2}\/\d{2}\s\d{2}:\d{2})/;
    const dateMatch = content.match(dateRegex);

    let startTime: Date;
    let endTime: Date | null = null;

    if (dateMatch) {
      if (dateMatch[1].includes('버전 업데이트 후')) {
        // Usually updates start around 11:00 or 12:00 KST.
        // Without precise time, we might default to creation time or leave it logic bound.
        // For now, let's use the created_at as a fallback or a fixed time if we can guess.
        startTime = new Date(post.created_at * 1000); // Fallback
      } else {
        startTime = this.parseDate(dateMatch[1]);
      }
      endTime = this.parseDate(dateMatch[2]);
    } else {
      // If no date found, use post creation time and arbitrary end
      startTime = new Date(post.created_at * 1000);
      endTime = new Date(startTime.getTime() + 7 * 24 * 60 * 60 * 1000); // +7 days
    }

    // Extraction Logic
    const rateUpBlocks = this.extractRateUpBlocks(content);
    const uniqueItems = (items: string[]) => Array.from(new Set(items));

    const char5 = uniqueItems(this.extractFromBlocks('5 캐릭터', rateUpBlocks));
    const char4 = uniqueItems(this.extractFromBlocks('4 캐릭터', rateUpBlocks));
    const lc5 = uniqueItems(this.extractFromBlocks('5 광추', rateUpBlocks));
    const lc4 = uniqueItems(this.extractFromBlocks('4 광추', rateUpBlocks));

    if (
      char5.length > 0 ||
      char4.length > 0 ||
      lc5.length > 0 ||
      lc4.length > 0
    ) {
      const officialLink = `https://www.hoyolab.com/article/${post.post_id}`;

      const metadata = {
        original_subject: subject,
        description: 'Event Warp',
        source_id: post.post_id,
        content: content.substring(0, 5000), // Truncate content for metadata safety
        characters: {
          rarity5: char5.map(this.cleanName),
          rarity4: char4.map(this.cleanName),
        },
        items: {
          rarity5: lc5.map(this.cleanName),
          rarity4: lc4.map(this.cleanName),
        },
      };

      // Valid Date Confirmation for database
      if (isNaN(startTime.getTime())) startTime = new Date();
      // If invalid end time, leave as is or null? Prisma needs Date or null.
      if (endTime && isNaN(endTime.getTime())) endTime = null;

      // Upsert to DB logic (Find -> Create/Update)
      await this.upsertEvent({
        gameId,
        type: EventType.GACHA,
        title: subject,
        startTime,
        endTime,
        officialLink,
        targetId: post.post_id,
        metadata,
      });
    }
  }

  private async processUpdateEvent(post: any, subject: string, gameId: number) {
    let content = post.content;
    // Fetch full content if needed (updates usually need it)
    if (post.post_id) {
      const fullContentSource = await this.fetchFullContent(post.post_id);
      if (fullContentSource) content = fullContentSource;
    }

    if (typeof content !== 'string') return;

    // 1. Maintenance Time
    const updateTimeRegex =
      /(\d{4}\/\d{2}\/\d{2}\s\d{2}:\d{2})\s?\(UTC\+8\).*?(\d+)시간/;
    const updateMatch = content.match(updateTimeRegex);

    let maintainStartTime: Date | null = null;
    let updateEndTime: Date | null = null;

    if (updateMatch) {
      const startTimeStr = updateMatch[1];
      const durationHours = parseInt(updateMatch[2], 10);

      const d = new Date(startTimeStr.replace(/\//g, '-'));
      maintainStartTime = new Date(d);
      maintainStartTime.setHours(maintainStartTime.getHours() + 1); // Server+8 -> KST+9

      updateEndTime = new Date(maintainStartTime);
      updateEndTime.setHours(updateEndTime.getHours() + durationHours);

      await this.upsertEvent({
        gameId,
        type: EventType.MAINTENANCE,
        title: `v${subject.split(' ')[0]} 점검`,
        startTime: maintainStartTime,
        endTime: updateEndTime,
        officialLink: `https://www.hoyolab.com/article/${post.post_id}`,
        targetId: `${post.post_id}_MAINTENANCE`,
        metadata: {
          description: `업데이트 점검 (예상 소요 ${durationHours}시간)`,
          original_subject: subject,
          source_id: post.post_id,
        },
      });
    }

    // 2. In-Game Events extraction
    const eventSectionHeader = /^\d+\.\s*신규 이벤트/m;
    const matchHeader = content.match(eventSectionHeader);

    if (matchHeader && matchHeader.index !== undefined) {
      const startIndex = matchHeader.index + matchHeader[0].length;
      const nextSectionRegex = /^\d+\.\s*|▌/m;
      let eventsText = content.slice(startIndex);

      const cutOffMatch = eventsText.match(/^\d+\.\s*.*$/m);
      if (cutOffMatch && cutOffMatch.index) {
        eventsText = eventsText.slice(0, cutOffMatch.index);
      }

      const eventBlocks = eventsText
        .split('■ ')
        .filter((s: string) => s.trim().length > 0);

      for (const block of eventBlocks) {
        const lines = block.split('\n');
        const eventTitle = lines[0].trim();
        const fullBlock = block.trim();

        const periodLine = lines.find((l: string) => l.includes('이벤트 기간'));
        if (periodLine) {
          const tildeParts = periodLine.split('~');
          if (tildeParts.length >= 2) {
            let startPart = tildeParts[0].replace('이벤트 기간:', '').trim();
            let endPart = tildeParts[1].trim();
            endPart = endPart.replace(/\(.*\)/, '').trim();

            let evtStartTime: Date | null = null;
            let evtEndTime: Date | null = null;

            if (startPart.includes('버전 업데이트 후') && updateEndTime) {
              evtStartTime = updateEndTime;
            } else {
              const sMatch = startPart.match(
                /\d{4}\/\d{2}\/\d{2}\s\d{2}:\d{2}/,
              );
              if (sMatch) evtStartTime = this.parseDate(sMatch[0]);
            }

            const eMatch = endPart.match(/\d{4}\/\d{2}\/\d{2}\s\d{2}:\d{2}/);
            if (eMatch) evtEndTime = this.parseDate(eMatch[0]);

            if (evtStartTime && evtEndTime) {
              await this.upsertEvent({
                gameId,
                type: EventType.EVENT,
                title: eventTitle,
                startTime: evtStartTime,
                endTime: evtEndTime,
                officialLink: `https://www.hoyolab.com/article/${post.post_id}`,
                targetId: `${post.post_id}_${eventTitle}`,
                metadata: {
                  description: fullBlock.slice(0, 200) + '...',
                  original_subject: subject,
                  source_id: post.post_id,
                  full_content: fullBlock,
                },
              });
            }
          }
        }
      }
    }
  }

  private async upsertEvent(data: any) {
    const existing = await prisma.calendarEvent.findFirst({
      where: {
        gameId: data.gameId,
        targetId: data.targetId,
        type: data.type,
      },
    });

    if (existing) {
      await prisma.calendarEvent.update({
        where: { id: existing.id },
        data: {
          title: data.title,
          startTime: data.startTime,
          endTime: data.endTime,
          officialLink: data.officialLink,
          metadata: data.metadata,
        },
      });
      logger.info(`Updated event: ${data.title}`);
    } else {
      await prisma.calendarEvent.create({
        data: {
          gameId: data.gameId,
          type: data.type,
          title: data.title,
          startTime: data.startTime,
          endTime: data.endTime,
          officialLink: data.officialLink,
          targetId: data.targetId,
          metadata: data.metadata,
        },
      });
      logger.info(`Created event: ${data.title}`);
    }
  }

  // Helpers
  private extractRateUpBlocks(content: string): string[] {
    const rateUpBlocks: string[] = [];
    const blockRegex = /●\s*(.*?)\s*의 워프 성공률이 일시적으로 증가합니다\./g;
    let blockMatch;
    while ((blockMatch = blockRegex.exec(content)) !== null) {
      rateUpBlocks.push(blockMatch[1]);
    }
    return rateUpBlocks;
  }

  private extractFromBlocks(marker: string, blocks: string[]): string[] {
    let allNames: string[] = [];
    for (const block of blocks) {
      const parts = block.split('★');
      const found = parts.filter((p) => p.startsWith(marker));
      for (const seg of found) {
        const matches = [...seg.matchAll(/「(.*?)」/g)];
        allNames.push(...matches.map((m) => m[1]));
      }
    }
    return allNames;
  }

  private cleanName(rawName: string): string {
    return rawName.split('(')[0];
  }

  private parseDate(dateStr: string): Date {
    const cleaned = dateStr.replace(/\//g, '-');
    const date = new Date(cleaned);
    // Server Time UTC+8 -> KST UTC+9 (+1h)
    date.setHours(date.getHours() + 1);
    return date;
  }

  async save(data: ScrapedData[]) {
    const outputDir = path.join(process.cwd(), 'data', 'crawlers', 'starrail');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const filePath = path.join(outputDir, 'events.json');
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    logger.info(`Saved ${data.length} events to ${filePath}`);
  }
}
