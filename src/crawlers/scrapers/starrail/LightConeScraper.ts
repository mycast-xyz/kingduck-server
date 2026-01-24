import axios from 'axios';
import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { ImageDownloader } from '../../utils/ImageDownloader';
import logger from '../../../utils/logger';

export class LightConeScraper extends ScraperBase {
  private readonly LIST_API_URL =
    'https://api.hakush.in/hsr/data/lightcone.json';
  private readonly DETAIL_API_BASE =
    'https://api.hakush.in/hsr/data/kr/lightcone';

  constructor() {
    super('starrail');
  }

  async scrape(): Promise<ScrapedData[]> {
    logger.info('Starting Star Rail LightCone scraping (API mode)...');
    const results: ScrapedData[] = [];

    try {
      const { data: lcMap } = await axios.get(this.LIST_API_URL);
      const lcIds = Object.keys(lcMap);
      logger.info(`Found ${lcIds.length} lightcones.`);

      for (const id of lcIds) {
        try {
          const detailUrl = `${this.DETAIL_API_BASE}/${id}.json`;
          const { data: detail } = await axios.get(detailUrl);

          const name = detail.name || lcMap[id].name || `LC_${id}`;

          // Images
          // List Icon: https://api.hakush.in/hsr/UI/lightconemediumicon/{id}.webp
          const iconRemoteUrl = `https://api.hakush.in/hsr/UI/lightconemediumicon/${id}.webp`;
          const localIconUrl = await ImageDownloader.downloadAndSave(
            iconRemoteUrl,
            'starrail',
            'lightcone',
            `icon_${id}`,
          );

          // Detail Image: https://api.hakush.in/hsr/UI/lightconemaxfigures/{id}.webp
          const detailRemoteUrl = `https://api.hakush.in/hsr/UI/lightconemaxfigures/${id}.webp`;
          const localDetailUrl = await ImageDownloader.downloadAndSave(
            detailRemoteUrl,
            'starrail',
            'lightcone',
            `card_${id}`,
          );

          results.push({
            name: name,
            sourceUrl: detailUrl,
            imageUrl: localIconUrl,
            metadata: {
              originalId: id,
              cardImageUrl: localDetailUrl,
              type: 'LightCone',
              rarity: detail.rarity,
              path: detail.baseType,
            },
          });
        } catch (innerErr) {
          logger.error(`Failed to process LightCone ${id}:`, innerErr);
        }
      }
    } catch (e) {
      logger.error('Error scraping LightCones:', e);
    }
    return results;
  }
}
