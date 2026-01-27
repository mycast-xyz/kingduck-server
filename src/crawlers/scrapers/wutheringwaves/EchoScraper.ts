import axios from 'axios';
import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { ImageDownloader } from '../../utils/ImageDownloader';
import logger from '../../../utils/logger';
import { BASE_API_URL, getImageUrl } from './utils';

export class WutheringWavesEchoScraper extends ScraperBase {
  constructor() {
    super('wutheringwaves');
  }

  async scrape(): Promise<ScrapedData[]> {
    logger.info('Starting Wuthering Waves Echo scraping (API)...');
    try {
      const { data } = await axios.get(`${BASE_API_URL}/echo`);
      const list = data.Echo || [];
      const results: ScrapedData[] = [];

      for (const item of list) {
        const imageUrl = getImageUrl(item.Icon);
        let localImageUrl = '';
        if (imageUrl) {
          localImageUrl =
            (await ImageDownloader.downloadAndSave(
              imageUrl,
              this.gameSlug,
              'echo',
              item.Id.toString(),
            )) || '';
        }

        results.push({
          name: item.Name,
          sourceUrl: `${BASE_API_URL}/echo`,
          imageUrl: localImageUrl,
          rarity: item.QualityId || item.Rarity || 0, // Echo might use Cost or Rarity
          description: item.Attributes || '',
          metadata: {
            originalId: item.Id,
            type: 'Echo',
            element: item.Element?.Name,
            cost: item.Cost, // If available
            phantomType: item.PhantomType,
          },
        });
      }
      return results;
    } catch (e) {
      logger.error('Error scraping Wuthering Waves echoes:', e);
      return [];
    }
  }
}
