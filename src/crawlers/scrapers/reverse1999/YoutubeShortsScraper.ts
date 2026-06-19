import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { youtube } from '../../../utils/youtubeApiClient';
import { prisma } from '../../../utils/prisma';
import logger from '../../../utils/logger';
import { crawlProgress } from '../../crawlProgress';

export class YoutubeShortsScraper extends ScraperBase {
  private readonly CHANNEL_HANDLE = '@Reverse1999KR';

  constructor() {
    super('reverse1999');
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
        where: { game: { slug: 'reverse1999' } },
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

        // Collect video IDs
        items.forEach((item: any) => {
          const videoId = item.snippet?.resourceId?.videoId;
          if (videoId) videoIds.push(videoId);
        });

        nextPageToken = response.data.nextPageToken;
        // Limit to 10 pages (500 videos) to avoid excessive API usage
        if (pageCount >= 10) break;
      } while (nextPageToken);

      logger.info(`Collected ${videoIds.length} video IDs`);

      // 3. Fetch video details to get duration (for Shorts filtering)
      const videoDetails: any[] = [];
      for (let i = 0; i < videoIds.length; i += 50) {
        const batch = videoIds.slice(i, i + 50);
        const detailsResponse: any = await youtube.videos.list({
          part: ['contentDetails', 'snippet'],
          id: batch,
        });
        videoDetails.push(...(detailsResponse.data.items || []));
      }

      logger.info(`Fetched details for ${videoDetails.length} videos`);

      // 4. Filter for Shorts (60 seconds or less) and extract character names
      let processed = 0;
      for (const video of videoDetails) {
        if (crawlProgress.shouldStop()) break; // 사용자 중단 요청
        crawlProgress.report(processed, videoDetails.length, video.snippet?.title || '');
        processed++;
        const duration = video.contentDetails?.duration;
        const durationSeconds = this.parseDuration(duration);

        // Filter for Shorts only (60 seconds or less)
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

        // Extract character name from title or description using hashtag
        const characterName = this.extractCharacterName(title, description);

        if (!characterName) {
          logger.debug(
            `Skipping video: No hashtag character name found in title or description for "${title}"`,
          );
          continue;
        }

        // Validate against DB
        let matchedName = null;
        const normalizedCharName = characterName.normalize('NFC').toLowerCase();

        for (const dbName of validNames) {
          const normalizedDbName = dbName.normalize('NFC').toLowerCase();
          if (
            normalizedCharName === normalizedDbName ||
            normalizedCharName.includes(normalizedDbName) ||
            normalizedDbName.includes(normalizedCharName)
          ) {
            matchedName = dbName;
            break;
          }
        }

        if (!matchedName) {
          logger.debug(
            `Skipping video: Character "${characterName}" not found in DB for title "${title}"`,
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
          `Found Shorts: ${title} (Matched: ${matchedName}, Duration: ${durationSeconds}s, URL: ${url})`,
        );
      }

      logger.info(`Scraped ${results.length} Shorts videos via API`);
    } catch (e) {
      logger.error('Error scraping YouTube Shorts via API:', e);
    }

    return results;
  }

  /**
   * Parse ISO 8601 duration to seconds
   */
  private parseDuration(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1] || '0');
    const minutes = parseInt(match[2] || '0');
    const seconds = parseInt(match[3] || '0');

    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Extract character name from title or description using hashtag
   * Priority: title first, then description
   * Skips generic/version hashtags to find character-specific ones
   */
  private extractCharacterName(
    title: string,
    description: string,
  ): string | undefined {
    // List of generic hashtags to exclude
    const excludeHashtags = [
      '리버스1999',
      '리버스1999가방속순례',
      '리버스1999흘러가는축제',
      '리버스1999한밤의기적소리',
      '리버스1999머나먼길',
      '리버스1999올리브가지전선',
      '리버스0에서21까지',
      'Discovery채널',
      '리버스1999xDiscovery',
      '리버스1999복낙원',
      '리버스1999애니버서리2주년버전',
      '리버스1999차이나타운무비',
      '리버스1999애니버서리버전',
      '리버스1999슬픈열대',
      '리버스1999어쌔신크리드콜라보',
      '어쌔신크리드',
      '리버스1987우주의서곡',
      '리버스1999광기의역사',
      '울루루연대기런던의여명',
      '리버스1999가방속순례특별버전',
      '리버스1999지구에서의마지막밤',
      'AssassinsCreed',
      '리버스1987우주산책',
      '리버스64칸의흑백',
      '올림포스를나는독수리처럼',
      '안개의도시선수권대회',
      '누아르',
      '오래된책장의새로운이야기',
      '침몰하지않는배',
      '파울리스타나의무더위',
      '리버스1999비이성의미궁',
      '야간순찰파견관리국에온걸환영해',
      '제3행성의이상한여정',
      '영화배우가되고싶지않은경관은좋은댄서가아니다',
      '곡선의집',
      '불타버린폐허에서',
      '뉴바벨크리터회사',
      '리버스1999루트77유령의도로',
      '비이성의미궁',
      '허리케인캣의친구',
      '두번째징조',
    ];

    // Try to find character hashtags in title first
    const titleMatches = title.match(/#([가-힣a-zA-Z0-9&]+)/g) || [];
    for (const match of titleMatches) {
      const hashtagName = match.substring(1).trim();
      if (!excludeHashtags.includes(hashtagName)) {
        return hashtagName;
      }
    }

    // If not found in title, try description
    const descMatches = description.match(/#([가-힣a-zA-Z0-9&]+)/g) || [];
    for (const match of descMatches) {
      const hashtagName = match.substring(1).trim();
      if (!excludeHashtags.includes(hashtagName)) {
        return hashtagName;
      }
    }

    return undefined;
  }
}
