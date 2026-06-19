import puppeteer, { Browser as PuppeteerBrowser } from 'puppeteer';
import logger from '../../utils/logger';

export class Browser {
  private static instance: Browser;
  private browser: PuppeteerBrowser | null = null;

  private constructor() {}

  public static getInstance(): Browser {
    if (!Browser.instance) {
      Browser.instance = new Browser();
    }
    return Browser.instance;
  }

  public async init() {
    if (!this.browser) {
      try {
        logger.info('Launching Puppeteer browser...');
        this.browser = await puppeteer.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            // 저메모리(홈서버 4GB) 안정화: /dev/shm 대신 일반 메모리/디스크 사용(OOM·크래시 방지),
            // GPU 비활성.
            '--disable-dev-shm-usage',
            '--disable-gpu',
          ],
        });
      } catch (error) {
        logger.error('Failed to launch browser', error);
        throw error;
      }
    }
  }

  public async getPage() {
    if (!this.browser) {
      await this.init();
    }
    return await this.browser!.newPage();
  }

  public async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logger.info('Browser closed.');
    }
  }
}
