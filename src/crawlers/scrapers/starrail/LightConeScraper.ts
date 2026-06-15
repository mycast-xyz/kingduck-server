import axios from 'axios';
import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { ImageDownloader } from '../../utils/ImageDownloader';
import logger from '../../../utils/logger';
import { prisma } from '../../../utils/prisma';

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
      const { data: lcMap } = await axios.get(this.LIST_API_URL, { timeout: 15000 });
      const lcIds = Object.keys(lcMap);
      logger.info(`Found ${lcIds.length} lightcones.`);

      for (const id of lcIds) {
        try {
          // Check if item already exists in database
          const existingItem = await prisma.item.findFirst({
            where: {
              metadata: {
                path: ['originalId'],
                equals: id,
              },
            },
          });

          if (existingItem) {
            logger.info(`LightCone ${id} already exists, skipping...`);
            continue;
          }

          const detailUrl = `${this.DETAIL_API_BASE}/${id}.json`;
          const { data: detail } = await axios.get(detailUrl, { timeout: 15000 });

          const name =
            detail.Name || lcMap[id].Name || lcMap[id].name || `LC_${id}`;

          // Parse rarity from "CombatPowerLightconeRarity3" -> 3
          let rarity = 3; // default
          if (detail.Rarity && typeof detail.Rarity === 'string') {
            const match = detail.Rarity.match(/Rarity(\d+)/);
            if (match) {
              rarity = parseInt(match[1]);
            }
          }

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

          // Process Refinements and Stats
          const refinements = this.processRefinements(detail.Refinements);
          const stats = this.processStats(detail.Stats);

          results.push({
            name: name,
            sourceUrl: detailUrl,
            imageUrl: localIconUrl,
            rarity: rarity,
            metadata: {
              originalId: id,
              cardImageUrl: localDetailUrl,
              type: 'LightCone',
              rarity: rarity,
              path: detail.BaseType,
              refinements,
              stats,
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

  private processRefinements(refinements: any): any {
    if (!refinements) return null;

    const levels: Record<string, number[]> = {};
    if (refinements.Level) {
      for (const lv of Object.keys(refinements.Level)) {
        levels[lv] = refinements.Level[lv].ParamList || [];
      }
    }

    return {
      name: refinements.Name,
      desc: refinements.Desc,
      levels,
    };
  }

  private processStats(stats: any[]): any {
    if (!stats || !Array.isArray(stats) || stats.length === 0) return null;

    // Growth rates are usually the same across all promotion levels
    const baseEntry = stats[0];
    const growth = {
      hp: baseEntry.BaseHPAdd,
      atk: baseEntry.BaseAttackAdd,
      def: baseEntry.BaseDefenceAdd,
    };

    const promotions = stats.map((s) => ({
      promotion: s.Promotion || 0,
      maxLevel: s.MaxLevel,
      hp: s.BaseHP,
      atk: s.BaseAttack,
      def: s.BaseDefence,
    }));

    return {
      growth,
      promotions,
    };
  }
}
