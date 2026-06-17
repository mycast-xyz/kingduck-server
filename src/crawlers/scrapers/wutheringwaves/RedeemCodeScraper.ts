import { PrismaClient } from '@prisma/client';
import puppeteer from 'puppeteer';
import logger from '../../../utils/logger';

const WW_GAME_SLUG = 'wutheringwaves';
const SEARCH_URL =
  'https://arca.live/b/wutheringwaves?mode=best&target=all&keyword=%EB%A6%AC%EB%94%A4%EC%BD%94%EB%93%9C+%EB%AA%A8%EC%9D%8C';

export class RedeemCodeScraper {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async scrape() {
    logger.info(`[WWRedeemCodeScraper] Starting scrape for ${WW_GAME_SLUG}...`);

    // Find Game ID
    const game = await this.prisma.game.findUnique({
      where: { slug: WW_GAME_SLUG },
    });

    if (!game) {
      logger.error(`[WWRedeemCodeScraper] Game not found: ${WW_GAME_SLUG}`);
      return null;
    }

    try {
      const result = await this.scrapeArca();
      if (!result.title || result.codes.length === 0) {
        logger.info('[WWRedeemCodeScraper] No codes or title found.');
        return null;
      }

      await this.saveToDb(game.id, result);
      logger.info('[WWRedeemCodeScraper] Scrape completed.');

      return result;
    } catch (error) {
      logger.error('[WWRedeemCodeScraper] Error:', error);
      return null;
    }
  }

  private async scrapeArca(): Promise<{
    title: string;
    period: string;
    codes: string[];
  }> {
    logger.info(`[WWRedeemCodeScraper] Launching Puppeteer...`);
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      );

      // 1. Go to search page
      await page.goto(SEARCH_URL, { waitUntil: 'networkidle2' });
      await page.waitForSelector('a.vrow');

      // 2. Find the correct post link
      const postLink = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a.vrow'));
        const target = links.find((link) => {
          const title = link.querySelector('.title')?.textContent || '';
          return title.includes('리딤') || title.includes('리듬');
        });
        return target ? (target as HTMLAnchorElement).href : null;
      });

      if (!postLink) {
        logger.info('[WWRedeemCodeScraper] No post found with keyword.');
        return { title: '', period: '', codes: [] };
      }

      logger.info(`[WWRedeemCodeScraper] Found post: ${postLink}`);

      // 3. Go to the post
      await page.goto(postLink, { waitUntil: 'networkidle2' });
      await page.waitForSelector('div.article-content');

      // 4. Extract content
      const result = await page.evaluate(() => {
        const titleElement = document.querySelector('div.article-head .title');
        let title = titleElement ? titleElement.textContent?.trim() || '' : '';

        const contentDiv = document.querySelector('div.article-content');
        if (!contentDiv) return { title, period: '', codes: [] };

        // Period
        let period = '';
        const fullText = (contentDiv as HTMLElement).innerText || '';
        const lines = fullText.split('\n');
        for (const line of lines) {
          // Pattern: "유효기간 : 2026/1/26 00:59까지"
          if (
            (line.includes('유효기간') ||
              line.includes('까지') ||
              line.includes('~')) &&
            /\d/.test(line)
          ) {
            period = line.trim();
            break;
          }
        }

        // Codes
        const extractedCodes: string[] = [];
        const strongs = contentDiv.querySelectorAll('strong');
        strongs.forEach((s) => {
          const txt = s.textContent?.trim();
          if (txt && /^[A-Z0-9]{6,25}$/.test(txt)) {
            extractedCodes.push(txt);
          }
        });

        // Backup: regex on full text
        const matches = fullText.match(/\b[A-Z0-9]{6,25}\b/g);
        if (matches) {
          matches.forEach((m) => extractedCodes.push(m));
        }

        // Filter codes
        const uniqueCodes = [...new Set(extractedCodes)].filter((code) => {
          const rubish = [
            'HTTPS',
            'ARCA',
            'BEST',
            'MODE',
            'LIVE',
            'HTML',
            'HTTP',
            'WUTHERINGWAVES',
            'NAMU',
            'WIKI',
            'YOUTUBE',
            'TWITTER',
            'DISCORD',
            'OFFICIAL',
            'EVENT',
            'NOTICE',
          ];
          if (rubish.includes(code)) return false;
          if (/^\d+$/.test(code)) return false;
          if (code.length < 8) return false;
          return true;
        });

        return {
          title,
          period,
          codes: uniqueCodes,
        };
      });

      return result;
    } finally {
      await browser.close();
    }
  }

  private parseEndTime(periodText: string): Date | null {
    if (!periodText) return null;
    // Format: "2026/1/26 00:59까지" or similar "YYYY/M/D"
    // Regex for "YYYY/M/D" or "YYYY.M.D" or "YYYY-M-D"
    const regex = /(\d{4})[\.\/\-]\s*(\d{1,2})[\.\/\-]\s*(\d{1,2})/;
    const match = periodText.match(regex);
    if (match) {
      const year = parseInt(match[1]);
      const month = parseInt(match[2]);
      const day = parseInt(match[3]);

      // Default to end of day 23:59:00 if no time?
      // User says "2026/1/26 00:59까지"
      // Let's try to parse time if present?
      let hour = 23;
      let minute = 59;

      const timeRegex = /(\d{1,2}):(\d{2})/;
      const timeMatch = periodText.match(timeRegex);
      if (timeMatch) {
        hour = parseInt(timeMatch[1]);
        minute = parseInt(timeMatch[2]);
      }

      // Construct Date object
      // Store as face-value UTC to represent KST
      const isoString = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00Z`;
      return new Date(isoString);
    }
    return null;
  }

  private async saveToDb(
    gameId: number,
    data: { title: string; period: string; codes: string[] },
  ) {
    logger.info(`[WWRedeemCodeScraper] Saving to DB: ${data.title}`);

    const endTime = this.parseEndTime(data.period);

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
      logger.info(`[WWRedeemCodeScraper] Created new group: ${group.id}`);
    } else {
      group = await this.prisma.redeemGroup.update({
        where: { id: group.id },
        data: { periodText: data.period, endTime: endTime },
      });
      logger.info(`[WWRedeemCodeScraper] Updated existing group: ${group.id}`);
    }

    for (const codeStr of data.codes) {
      try {
        await this.prisma.redeemCode.upsert({
          where: { code: codeStr },
          update: {
            groupId: group.id,
          },
          create: {
            groupId: group.id,
            code: codeStr,
          },
        });
        logger.info(`[WWRedeemCodeScraper] Upserted code: ${codeStr}`);
      } catch (e) {
        logger.error(
          `[WWRedeemCodeScraper] Failed to upsert code ${codeStr}: ${e}`,
        );
      }
    }
  }
}
