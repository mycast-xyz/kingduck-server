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
      logger.info('Launching Puppeteer browser...');
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
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
