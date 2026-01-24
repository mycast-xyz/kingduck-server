import axios from 'axios';
import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { ImageDownloader } from '../../utils/ImageDownloader';
import logger from '../../../utils/logger';

export class RelicScraper extends ScraperBase {
  private readonly LIST_API_URL =
    'https://api.hakush.in/hsr/data/relicset.json';
  private readonly DETAIL_API_BASE =
    'https://api.hakush.in/hsr/data/kr/relicset';

  constructor() {
    super('starrail');
  }

  async scrape(): Promise<ScrapedData[]> {
    logger.info('Starting Star Rail Relic scraping (API mode)...');
    const results: ScrapedData[] = [];

    try {
      const { data: setMap } = await axios.get(this.LIST_API_URL);
      const setIds = Object.keys(setMap);
      logger.info(`Found ${setIds.length} relic sets.`);

      for (const id of setIds) {
        try {
          const detailUrl = `${this.DETAIL_API_BASE}/${id}.json`;
          const { data: detail } = await axios.get(detailUrl);

          const name = detail.name || setMap[id].name || `RelicSet_${id}`;

          // Set Image: https://api.hakush.in/hsr/UI/itemfigures/{id}.webp
          const setRemoteUrl = `https://api.hakush.in/hsr/UI/itemfigures/${id}.webp`;
          const localSetUrl = await ImageDownloader.downloadAndSave(
            setRemoteUrl,
            'starrail',
            'relic',
            `set_${id}`,
          );

          // Note: Individual pieces (Heads, Hands etc) logic could be added here iterating over detail.site or similar if provided.
          // For now, storing set info.

          results.push({
            name: name,
            sourceUrl: detailUrl,
            imageUrl: localSetUrl,
            metadata: {
              originalId: id,
              type: 'RelicSet',
              '2pc': detail.RequireNum?.['2']?.Desc || '',
              '4pc': detail.RequireNum?.['4']?.Desc || '',
              parts: detail.Parts || {},
            },
          });
        } catch (innerErr) {
          logger.error(`Failed to process RelicSet ${id}:`, innerErr);
        }
      }
    } catch (e) {
      logger.error('Error scraping RelicSets:', e);
    }
    return results;
  }
}
