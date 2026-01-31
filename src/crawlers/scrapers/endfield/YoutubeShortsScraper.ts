import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { youtube } from '../../../utils/youtubeApiClient';
import { prisma } from '../../../utils/prisma';
import logger from '../../../utils/logger';

export class EndfieldYoutubeShortsScraper extends ScraperBase {
  private readonly CHANNEL_HANDLE = '@arknightsendfieldKR'; // Official KR Channel

  constructor() {
    super('endfield');
  }

  async scrape(): Promise<ScrapedData[]> {
    logger.info(
      `Starting Endfield YouTube Shorts scraping via API for ${this.CHANNEL_HANDLE}...`,
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
        where: { game: { slug: 'endfield' } },
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

      // 2. Fetch videos from the uploads playlist
      let pageCount = 0;
      const videoIds: string[] = [];

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

        items.forEach((item: any) => {
          const videoId = item.snippet?.resourceId?.videoId;
          if (videoId) videoIds.push(videoId);
        });

        nextPageToken = response.data.nextPageToken;
        if (pageCount >= 10) break; // Limit to 500 videos
      } while (nextPageToken);

      logger.info(`Collected ${videoIds.length} video IDs`);

      // 3. Fetch video details to get duration
      const videoDetails: any[] = [];
      for (let i = 0; i < videoIds.length; i += 50) {
        const batch = videoIds.slice(i, i + 50);
        const detailsResponse: any = await youtube.videos.list({
          part: ['contentDetails', 'snippet'],
          id: batch,
        });
        videoDetails.push(...(detailsResponse.data.items || []));
      }

      // 4. Filter Shorts and match characters
      const requiredKeywords = ['코드명', '오퍼레이터'];

      for (const video of videoDetails) {
        const duration = video.contentDetails?.duration;
        const durationSeconds = this.parseDuration(duration);

        if (durationSeconds > 60) continue;

        const videoId = video.id;
        const title = video.snippet?.title || '';
        const description = video.snippet?.description || '';
        const thumbnail =
          video.snippet?.thumbnails?.high?.url ||
          video.snippet?.thumbnails?.default?.url ||
          '';
        const url = `https://www.youtube.com/shorts/${videoId}`;

        if (!videoId) continue;

        const textToSearch = (title + ' ' + description).toLowerCase();

        // 1. Check for Mandatory Keywords
        const hasKeyword = requiredKeywords.some((keyword) =>
          textToSearch.includes(keyword),
        );

        if (!hasKeyword) continue;

        // 2. Match Character Name (Korean)
        let matchedName: string | null = null;
        for (const dbName of validNames) {
          // Check direct inclusion
          if (textToSearch.includes(dbName)) {
            matchedName = dbName;
            break;
          }
        }

        if (!matchedName) {
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
      }

      logger.info(`Scraped ${results.length} Shorts videos via API`);
    } catch (e) {
      logger.error('Error scraping Endfield Shorts via API:', e);
    }

    return results;
  }

  async save(data: ScrapedData[]) {
    const { DataSyncService } = await import('../../services/DataSyncService');
    const service = new DataSyncService();
    await service.syncVideos('endfield', data);
  }

  private parseDuration(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    const hours = parseInt(match[1] || '0');
    const minutes = parseInt(match[2] || '0');
    const seconds = parseInt(match[3] || '0');
    return hours * 3600 + minutes * 60 + seconds;
  }
}
