import axios from 'axios';
import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { ImageDownloader } from '../../utils/ImageDownloader';
import logger from '../../../utils/logger';
import { prisma } from '../../../utils/prisma';

export class RelicScraper extends ScraperBase {
  private readonly LIST_API_URL =
    'https://api.hakush.in/hsr/data/relicset.json';
  private readonly DETAIL_API_BASE =
    'https://api.hakush.in/hsr/data/kr/relicset';
  private readonly SRS_URL = 'https://starrailstation.com/kr/relics';
  private readonly SRS_CDN = 'https://cdn.starrailstation.com/assets/';

  constructor() {
    super('starrail');
  }

  /**
   * Fetch mapping from StarRailStation (Names -> Image Hashes)
   */
  private async fetchSRSMapping(): Promise<Record<string, any>> {
    try {
      logger.info('Fetching image mapping from StarRailStation...');
      const { data: html } = await axios.get(this.SRS_URL, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      });
      const markerMatch = html.match(/window\.PAGE_CONFIG\s*=\s*\{/);
      if (!markerMatch) {
        logger.warn('StarRailStation PAGE_CONFIG marker not found!');
        logger.warn(
          `HTML Snippet (First 500 chars): ${html.substring(0, 500)}`,
        );
        return {};
      }

      const startIdx = markerMatch.index;
      const jsonStartIdx = html.indexOf('{', startIdx);
      if (jsonStartIdx === -1) {
        logger.warn('StarRailStation PAGE_CONFIG opening brace not found!');
        return {};
      }

      let configString = '';
      let depth = 0;
      for (let i = jsonStartIdx; i < html.length; i++) {
        const char = html[i];
        if (char === '{') depth++;
        else if (char === '}') depth--;

        if (depth === 0) {
          configString = html.substring(jsonStartIdx, i + 1);
          break;
        }
      }

      if (!configString) {
        logger.warn('Failed to find matching closing brace for PAGE_CONFIG');
        return {};
      }

      // If JSON.parse fails, we'll log the string
      let config;
      try {
        config = JSON.parse(configString);
      } catch (parseErr: any) {
        logger.error(
          `JSON parse failed for PAGE_CONFIG. Error: ${parseErr.message}`,
        );
        logger.error(`String start: ${configString.substring(0, 100)}...`);
        logger.error(
          `String end: ...${configString.substring(configString.length - 100)}`,
        );
        return {};
      }
      const mapping: Record<string, any> = {};
      logger.info(`Config keys: ${Object.keys(config).join(', ')}`);

      if (config.entries && Array.isArray(config.entries)) {
        for (const entry of config.entries) {
          // Normalize name: Remove all whitespace for matching
          const normalized = (entry.name || '').replace(/\s/g, '');
          mapping[normalized] = {
            setIcon: entry.iconPath,
            pieces: entry.pieces || {},
          };
        }
      }
      logger.info(`Loaded ${Object.keys(mapping).length} SRS relic mappings.`);
      return mapping;
    } catch (e) {
      logger.error('Failed to fetch SRS mapping:', e);
      return {};
    }
  }

  /**
   * Fetch detailed relic set info from StarRailStation
   */
  private async fetchSRSDetail(id: string): Promise<any> {
    try {
      const url = `${this.SRS_URL}/${id}`;
      const { data: html } = await axios.get(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
      });
      const markerMatch = html.match(/window\.PAGE_CONFIG\s*=\s*\{/);
      if (!markerMatch) return null;

      const startIdx = markerMatch.index;
      const jsonStartIdx = html.indexOf('{', startIdx);
      let configString = '';
      let depth = 0;
      for (let i = jsonStartIdx; i < html.length; i++) {
        const char = html[i];
        if (char === '{') depth++;
        else if (char === '}') depth--;
        if (depth === 0) {
          configString = html.substring(jsonStartIdx, i + 1);
          break;
        }
      }
      return JSON.parse(configString);
    } catch (e) {
      logger.error(`Failed to fetch SRS detail for ${id}:`, e);
      return null;
    }
  }

  async scrape(): Promise<ScrapedData[]> {
    logger.info('Starting Star Rail Relic scraping (Multi-Source mode)...');
    const results: ScrapedData[] = [];

    // 0. Get Star Rail Game ID
    const game = await prisma.game.findUnique({
      where: { slug: 'starrail' },
    });

    if (!game) {
      logger.error('Star Rail game record not found in database!');
      return results;
    }

    // 1. Load SRS Mapping
    const srsMapping = await this.fetchSRSMapping();

    try {
      const { data: setMap } = await axios.get(this.LIST_API_URL);
      const setIds = Object.keys(setMap);
      logger.info(`Found ${setIds.length} relic sets from Hakush.in.`);

      for (const id of setIds) {
        try {
          // Check if relic set already exists in database

          const detailUrl = `${this.DETAIL_API_BASE}/${id}.json`;
          const { data: detail } = await axios.get(detailUrl);

          const name = detail.Name || setMap[id].Name || `RelicSet_${id}`;
          const normalizedName = name.replace(/\s/g, '');

          let localImageUrl = '';

          // 2. Map to SRS Entry
          const srsEntry = srsMapping[normalizedName];
          let srsDetail: any = null;

          if (srsEntry) {
            logger.info(`✅ Mapping success: ${name} (ID: ${id})`);

            // Image Download
            if (srsEntry.setIcon) {
              const imageUrl = this.SRS_CDN + srsEntry.setIcon + '.webp';
              logger.info(`Downloading image: ${imageUrl}`);
              const downloadedPath = await ImageDownloader.downloadAndSave(
                imageUrl,
                'starrail',
                'relic-set',
                id,
              );
              if (downloadedPath) {
                localImageUrl = downloadedPath;
              }
            }

            // Fetch SRS Detail for Lore and detailed skill params
            srsDetail = await this.fetchSRSDetail(id);
          } else {
            logger.warn(
              `❌ Mapping failed: ${name} (Normalized: ${normalizedName}, ID: ${id})`,
            );
          }

          // 3. Process Individual Pieces
          const parts: Record<string, any> = {};
          if (detail.Parts) {
            for (const [partId, partInfo] of Object.entries(
              detail.Parts as any,
            )) {
              const partName = (partInfo as any).Name;

              // Find matching piece in SRS detail
              let srsPiece: any = null;
              if (srsDetail && srsDetail.pieces) {
                const normalizedPartName = partName.replace(/\s/g, '');
                srsPiece = Object.values(srsDetail.pieces).find(
                  (p: any) =>
                    (p.name || '').replace(/\s/g, '') === normalizedPartName,
                );
              }

              let localPartIconUrl = '';
              if (srsPiece && srsPiece.iconPath) {
                const imageUrl = this.SRS_CDN + srsPiece.iconPath + '.webp';
                const downloadedPath = await ImageDownloader.downloadAndSave(
                  imageUrl,
                  'starrail',
                  'relic-piece',
                  partId,
                );
                if (downloadedPath) {
                  localPartIconUrl = downloadedPath;
                }
              }

              parts[partId] = {
                name: partName,
                iconUrl: localPartIconUrl,
                desc: srsPiece?.lore || (partInfo as any).Desc || '',
                story: srsPiece?.loreTitle || (partInfo as any).Story || '',
                rarityData: srsPiece?.rarityData || null,
              };
            }
          }

          // 4. Extract Set Bonuses
          const getSetBonus = (num: number) => {
            const hBonus = detail.RequireNum?.[num.toString()];
            const sBonus = srsDetail?.skills?.find(
              (s: any) => s.useNum === num,
            );
            return {
              desc: sBonus?.desc || hBonus?.Desc || '',
              params: sBonus?.params || hBonus?.ParamList || [],
            };
          };

          const bonus2pc = getSetBonus(2);
          const bonus4pc = getSetBonus(4);

          // 5. DB Upsert
          const metadata = {
            originalId: id,
            type: 'RelicSet',
            '2pc': bonus2pc,
            '4pc': bonus4pc,
            parts: parts,
            srsIconPath: srsEntry?.setIcon,
          };

          const existingItem = await prisma.item.findFirst({
            where: {
              gameId: game.id,
              metadata: {
                path: ['originalId'],
                equals: id,
              },
            },
          });

          if (existingItem) {
            await prisma.item.update({
              where: { id: existingItem.id },
              data: {
                name: name,
                imageUrl: localImageUrl,
                description: `2pc: ${bonus2pc.desc}\n4pc: ${bonus4pc.desc}`,
                metadata: metadata,
              },
            });
            logger.info(`Updated RelicSet: ${name} (ID: ${id})`);
          } else {
            await prisma.item.create({
              data: {
                gameId: game.id,
                name: name,
                type: 'RelicSet',
                rarity: 5,
                imageUrl: localImageUrl,
                description: `2pc: ${bonus2pc.desc}\n4pc: ${bonus4pc.desc}`,
                metadata: metadata,
              },
            });
            logger.info(`Created RelicSet: ${name} (ID: ${id})`);
          }

          results.push({
            name: name,
            sourceUrl: detailUrl,
            imageUrl: localImageUrl,
            metadata: metadata,
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
