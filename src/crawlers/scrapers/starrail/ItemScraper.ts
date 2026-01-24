import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { Browser } from '../../core/Browser';
import { ImageDownloader } from '../../utils/ImageDownloader';
import logger from '../../../utils/logger';

export class ItemScraper extends ScraperBase {
  private readonly BASE_URL = 'https://hsr20.hakush.in/item';

  constructor() {
    super('starrail');
  }

  async scrape(): Promise<ScrapedData[]> {
    logger.info('Starting Star Rail Item scraping...');
    const browser = Browser.getInstance();
    const page = await browser.getPage();
    const results: ScrapedData[] = [];

    try {
      await page.goto(this.BASE_URL, { waitUntil: 'domcontentloaded' });
      // Items might use a different selector or pagination, assume simple grid for now like chars
      // Often items are many pages, here we simplify to scraping the first page or visible items
      await page.waitForSelector('.main-content a');

      const items = await page.evaluate(() => {
        const elements = document.querySelectorAll('.main-content > div > a');
        return Array.from(elements).map((el) => {
          const href = el.getAttribute('href') || '';
          const id = href.split('/').pop() || '';
          const imgEl = el.querySelector('img');
          const imgUrl = imgEl?.src || '';
          // Items usually don't have textOverlay for name in grid sometimes, checking structure
          // If unsure, we try finding text
          const name = el.textContent?.trim() || `Item-${id}`;
          return { id, name, imgUrl, sourceUrl: href };
        });
      });

      logger.info(`Found ${items.length} items (Page 1).`);

      for (const item of items) {
        if (!item.id || !item.imgUrl) continue;
        const localImageUrl = await ImageDownloader.downloadAndSave(
          item.imgUrl,
          'starrail',
          'item',
          item.id,
        );
        results.push({
          name: item.name,
          sourceUrl: `https://hsr20.hakush.in${item.sourceUrl}`,
          imageUrl: localImageUrl,
          metadata: { originalId: item.id, type: 'Material' },
        });
      }
    } catch (e) {
      logger.error('Error scraping Items:', e);
    }
    return results;
  }
}
