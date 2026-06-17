import { PrismaClient } from '@prisma/client';
import puppeteer from 'puppeteer';
import logger from '../../../utils/logger';

const HSR_GAME_SLUG = 'starrail';
const ARCA_URL = 'https://arca.live/b/hkstarrail/132589689?mode=best&p=1';

export class RedeemCodeScraper {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async scrape() {
    logger.info(`[RedeemCodeScraper] Starting scrape for ${HSR_GAME_SLUG}...`);

    // Find Game ID
    const game = await this.prisma.game.findUnique({
      where: { slug: HSR_GAME_SLUG },
    });

    if (!game) {
      logger.error(`[RedeemCodeScraper] Game not found: ${HSR_GAME_SLUG}`);
      return null;
    }

    try {
      const result = await this.scrapeArca();
      if (!result.title || result.codes.length === 0) {
        logger.info('[RedeemCodeScraper] No codes or title found.');
        return null;
      }

      await this.saveToDb(game.id, result);
      logger.info('[RedeemCodeScraper] Scrape completed.');

      return result;
    } catch (error) {
      logger.error('[RedeemCodeScraper] Error:', error);
      return null;
    }
  }

  private async scrapeArca(): Promise<{
    title: string;
    period: string;
    codes: string[];
  }> {
    logger.info(`[RedeemCodeScraper] Launching Puppeteer...`);
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      );

      await page.goto(ARCA_URL, { waitUntil: 'networkidle2' });
      await page.waitForSelector('div.fr-view.article-content table');

      const result = await page.evaluate(() => {
        const contentDiv = document.querySelector(
          'div.fr-view.article-content',
        );
        if (!contentDiv) return { title: '', period: '', codes: [] };

        const firstTable = contentDiv.querySelector('table');
        if (!firstTable) return { title: '', period: '', codes: [] };

        const rows = firstTable.querySelectorAll('tr');
        if (rows.length === 0) return { title: '', period: '', codes: [] };

        const firstRowText = rows[0].innerText.trim();
        const lines = firstRowText
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0);

        const title = lines.length > 0 ? lines[0] : '';
        const period = lines.length > 1 ? lines[1] : '';

        const extractedCodes: string[] = [];
        rows.forEach((row) => {
          const cells = row.querySelectorAll('td');
          cells.forEach((cell) => {
            const text = cell.innerText.trim();
            const matches = text.match(/\b[A-Z0-9]{8,20}\b/g);
            if (matches) {
              matches.forEach((match) => {
                if (
                  [
                    'HTTPS',
                    'ARCA',
                    'BEST',
                    'MODE',
                    'LIVE',
                    'HTML',
                    'HTTP',
                    'FAREWELL',
                    'IFYOUAREREADINGTHIS',
                    'THANKYOU',
                  ].includes(match)
                )
                  return;
                if (/^\d+$/.test(match)) return;
                if (/^20\d{6}$/.test(match)) return;

                if (match === 'OSTARRAILGIFT') {
                  extractedCodes.push('STARRAILGIFT');
                } else {
                  extractedCodes.push(match);
                }
              });
            }
          });
        });
        return {
          title,
          period,
          codes: [...new Set(extractedCodes)],
        };
      });

      return result;
    } finally {
      await browser.close();
    }
  }

  private async saveToDb(
    gameId: number,
    data: { title: string; period: string; codes: string[] },
  ) {
    logger.info(`[RedeemCodeScraper] Saving to DB: ${data.title}`);

    // Parse Period to estimate endTime
    const endTime = this.parseEndTime(data.period);

    // Upsert RedeemGroup
    let group = await this.prisma.redeemGroup.findFirst({
      where: {
        gameId,
        title: data.title,
      },
    });

    if (!group) {
      group = await this.prisma.redeemGroup.create({
        data: {
          gameId,
          title: data.title,
          periodText: data.period,
          endTime: endTime,
        },
      });
      logger.info(`[RedeemCodeScraper] Created new group: ${group.id}`);
    } else {
      // Update period text and endTime if changed
      group = await this.prisma.redeemGroup.update({
        where: { id: group.id },
        data: {
          periodText: data.period,
          endTime: endTime,
        },
      });
      logger.info(`[RedeemCodeScraper] Updated existing group: ${group.id}`);
    }

    // Upsert Codes
    for (const codeStr of data.codes) {
      try {
        await this.prisma.redeemCode.upsert({
          where: { code: codeStr },
          update: {
            groupId: group.id, // Ensure it's linked to this group (might move groups?)
          },
          create: {
            groupId: group.id,
            code: codeStr,
            // reward: // We don't have reward info from this scraper yet
          },
        });
        logger.info(`[RedeemCodeScraper] Upserted code: ${codeStr}`);
      } catch (e) {
        logger.error(
          `[RedeemCodeScraper] Failed to upsert code ${codeStr}: ${e}`,
        );
      }
    }
  }

  private parseEndTime(periodText: string): Date | null {
    // Example: "입력 기한: 2월 8일 00:59까지"
    // Regex to capture Month, Day, Hour, Minute
    const regex = /(\d{1,2})월\s*(\d{1,2})일\s*(\d{1,2}):(\d{1,2})/;
    const match = periodText.match(regex);

    if (match) {
      const month = parseInt(match[1]);
      const day = parseInt(match[2]);
      const hour = parseInt(match[3]);
      const minute = parseInt(match[4]);

      const now = new Date();
      const year = now.getFullYear(); // Assume current year. 2026.

      // Create date object (Month is 0-indexed)
      const endDate = new Date(year, month - 1, day, hour, minute, 0);

      // Handle year rollover if needed (unlikely for short term codes but good practice)
      // If extracted date is way in the past relative to now (e.g. > 11 months), maybe it's next year?
      // But usually codes are fresh. We will trust current year.

      // Add timezone offset correction if server is not KST but text is KST?
      // "2월 8일 00:59" usually implies KST in Arca context.
      // Date(y,m,d,h,m) creates local time. If server is UTC, we should treat this as KST.
      // However, to keep it simple and consistent with other scrapers, we might assume server local is intended or use UTC.
      // Let's assume input is KST (UTC+9).
      // If we create Date object in local time (which might be UTC or KST depending on env), it might differ.

      // Best practice: Store as UTC.
      // However, user requested to store as KST (face value time).
      // So we will construct the time as if it's UTC so DB holds "00:59".
      const pad = (n: number) => n.toString().padStart(2, '0');
      const isoString = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00Z`;

      return new Date(isoString);
    }
    return null;
  }
}
