import axios from 'axios';
import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { ImageDownloader } from '../../utils/ImageDownloader';
import logger from '../../../utils/logger';
import { BASE_API_URL, getImageUrl } from './utils';

export class WutheringWavesItemScraper extends ScraperBase {
  constructor() {
    super('wutheringwaves');
  }

  async scrape(): Promise<ScrapedData[]> {
    logger.info('Starting Wuthering Waves Item scraping (API)...');
    try {
      const { data } = await axios.get(`${BASE_API_URL}/item`);
      const list = data.itemList || [];
      const results: ScrapedData[] = [];

      for (const item of list) {
        const imageUrl = getImageUrl(item.Icon);
        let localImageUrl = '';
        if (imageUrl) {
          localImageUrl =
            (await ImageDownloader.downloadAndSave(
              imageUrl,
              this.gameSlug,
              'item',
              item.Id.toString(),
            )) || '';
        }

        results.push({
          name: item.Name,
          sourceUrl: `${BASE_API_URL}/item`,
          imageUrl: localImageUrl,
          rarity: item.QualityId,
          description: '',
          metadata: {
            originalId: item.Id,
            type: item.TypeName || 'Material', // "경험치", "통용 화폐" etc.
            typeId: item.TypeId,
          },
        });
      }
      return results;
    } catch (e) {
      logger.error('Error scraping Wuthering Waves items:', e);
      return [];
    }
  }
}
