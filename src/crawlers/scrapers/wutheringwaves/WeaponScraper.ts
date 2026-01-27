import axios from 'axios';
import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { ImageDownloader } from '../../utils/ImageDownloader';
import logger from '../../../utils/logger';
import { BASE_API_URL, getImageUrl } from './utils';

export class WutheringWavesWeaponScraper extends ScraperBase {
  constructor() {
    super('wutheringwaves');
  }

  async scrape(): Promise<ScrapedData[]> {
    logger.info('Starting Wuthering Waves Weapon scraping (API)...');
    try {
      const { data } = await axios.get(`${BASE_API_URL}/weapon`);
      const list = data.weapons || [];
      const results: ScrapedData[] = [];

      for (const item of list) {
        const imageUrl = getImageUrl(item.Icon);
        let localImageUrl = '';
        if (imageUrl) {
          localImageUrl =
            (await ImageDownloader.downloadAndSave(
              imageUrl,
              this.gameSlug,
              'weapon',
              item.Id.toString(),
            )) || '';
        }

        results.push({
          name: item.Name,
          sourceUrl: `${BASE_API_URL}/weapon`,
          imageUrl: localImageUrl,
          rarity: item.QualityId,
          description: '',
          metadata: {
            originalId: item.Id,
            type: item.TypeName || 'Weapon', // "대검", "직검" etc.
            typeId: item.Type,
          },
        });
      }
      return results;
    } catch (e) {
      logger.error('Error scraping Wuthering Waves weapons:', e);
      return [];
    }
  }
}
