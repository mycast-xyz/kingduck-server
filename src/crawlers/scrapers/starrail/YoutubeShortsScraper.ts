import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { youtube } from '../../../utils/youtubeApiClient';
import { prisma } from '../../../utils/prisma';
import logger from '../../../utils/logger';

export class YoutubeShortsScraper extends ScraperBase {
  private readonly CHANNEL_HANDLE = '@Honkaistarrail_kr';

  constructor() {
    super('starrail');
  }

  async scrape(): Promise<ScrapedData[]> {
    logger.info(
      `Starting YouTube Shorts scraping via API for ${this.CHANNEL_HANDLE}...`,
    );
    const results: ScrapedData[] = [];
    let nextPageToken: string | undefined = undefined;

    try {
      if (!process.env.YOUTUBE_API_KEY) {
        logger.error(
          'YOUTUBE_API_KEY is not defined. Please check your .env file.',
        );
        return results;
      }

      // 0. Fetch character names from DB for validation
      const dbCharacters = await prisma.character.findMany({
        where: { game: { slug: 'starrail' } },
        select: { name: true },
      });
      const validNames = new Set(dbCharacters.map((c) => c.name));
      logger.info(`Loaded ${validNames.size} valid character names from DB`);

      // 1. Get channel info by handle
      logger.info(`Resolving channel by handle: ${this.CHANNEL_HANDLE}`);
      const channelResponse: any = await youtube.channels.list({
        part: ['contentDetails', 'snippet', 'id'],
        forHandle: this.CHANNEL_HANDLE,
      });

      const channelItem = channelResponse.data.items?.[0];
      if (!channelItem) {
        logger.error(`Channel not found by handle: ${this.CHANNEL_HANDLE}`);
        logger.error(
          `API Response: ${JSON.stringify(channelResponse.data, null, 2)}`,
        );
        return results;
      }

      const channelId = channelItem.id;
      const uploadsPlaylistId =
        channelItem.contentDetails?.relatedPlaylists?.uploads;

      if (!uploadsPlaylistId) {
        logger.error(
          `Could not find uploads playlist for channel ID: ${channelId}`,
        );
        return results;
      }

      logger.info(`Resolved Channel ID: ${channelId}`);
      logger.info(`Found uploads playlist ID: ${uploadsPlaylistId}`);

      // 2. Fetch videos from the uploads playlist
      let pageCount = 0;
      do {
        pageCount++;
        const response: any = await youtube.playlistItems.list({
          part: ['snippet'],
          playlistId: uploadsPlaylistId,
          maxResults: 50,
          pageToken: nextPageToken,
        });

        const items = response.data.items || [];
        logger.info(
          `Page ${pageCount}: Fetched ${items.length} items from playlist`,
        );

        for (const item of items) {
          const videoId = item.snippet?.resourceId?.videoId;
          const title = item.snippet?.title || '';
          const thumbnail =
            item.snippet?.thumbnails?.high?.url ||
            item.snippet?.thumbnails?.default?.url ||
            '';
          const url = `https://www.youtube.com/shorts/${videoId}`;

          if (!videoId) continue;

          // Filter out unwanted videos

          // 1. Exclude unwanted content
          if (
            title.includes('2차 창작') ||
            title.includes('열차 스타일의 연말 휴가 방식') ||
            title.includes('캐릭터 PV') ||
            title.includes('은하탐구생활') ||
            title.includes('데모') ||
            title.includes('가장 긴 밤') ||
            title.includes('PV')
          ) {
            continue;
          }

          // 2. Filter by character names from DB
          // We search for character names directly in the title now

          // Parse character name from title (keep for metadata, but use for fallback)
          const parsedName = this.parseCharacterName(title);

          // 3. character name validation against DB
          let matchedName = null;
          const normalizedTitle = title.normalize('NFC').toLowerCase();

          // Strategy 1: Search for any DB character name within the full title
          for (const dbName of validNames) {
            const normalizedDbName = dbName.normalize('NFC').toLowerCase();
            if (normalizedTitle.includes(normalizedDbName)) {
              matchedName = dbName;
              break;
            }
          }

          // Strategy 2: If no direct title match, try flexible match with parsed name
          if (!matchedName && parsedName) {
            const searchName = parsedName.trim().normalize('NFC').toLowerCase();
            for (const dbName of validNames) {
              const normalizedDbName = dbName.normalize('NFC').toLowerCase();
              if (
                searchName.includes(normalizedDbName) ||
                normalizedDbName.includes(searchName)
              ) {
                matchedName = dbName;
                break;
              }
            }
          }

          if (!matchedName) {
            logger.debug(
              `Skipping video: No matching character in DB for title "${title}"`,
            );
            continue;
          }

          results.push({
            name: title,
            sourceUrl: url,
            title,
            url,
            thumbnailUrl: thumbnail,
            characterName: matchedName,
            type: 'KeyVisual',
          });

          logger.info(
            `Found Shorts: ${title} (Matched: ${matchedName}, URL: ${url})`,
          );
        }

        nextPageToken = response.data.nextPageToken;
        // Limit to 10 pages (500 videos) to avoid excessive API usage
        if (pageCount >= 10) break;
      } while (nextPageToken);

      logger.info(`Scraped ${results.length} Shorts videos via API`);
    } catch (e) {
      logger.error('Error scraping YouTube Shorts via API:', e);
    }

    return results;
  }

  /**
   * Parse character name from title
   * Expected format includes "| #캐릭터이름" or "| 캐릭터이름"
   */
  private parseCharacterName(title: string): string | undefined {
    // Try to find the part after the last "|"
    const parts = title.split('|');
    if (parts.length < 2) return undefined;

    const lastPart = parts[parts.length - 1].trim();

    // Remove hashtag if present
    const nameMatch = lastPart.match(/^#?([^\s-]+)/);
    if (nameMatch) {
      return nameMatch[1].trim();
    }

    return lastPart || undefined;
  }
}
