import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { youtube } from '../../../utils/youtubeApiClient';
import { prisma } from '../../../utils/prisma';
import logger from '../../../utils/logger';

/**
 * 니케 공식 한국 채널(@nikkekr)에서 캐릭터 Shorts를 수집한다.
 * 채널이 "NIKKE 프로필 - 벨벳(Velvet) | 승리의 여신: 니케" 형태로 캐릭터별 Shorts를 올리므로,
 * 해시태그 대신 **DB 캐릭터명을 제목에서 직접 매칭**한다(가장 긴 이름 우선 — 부분일치 오매칭 방지).
 */
export class YoutubeShortsScraper extends ScraperBase {
  private readonly CHANNEL_HANDLE = '@nikkekr';

  constructor() {
    super('nikke');
  }

  async scrape(): Promise<ScrapedData[]> {
    logger.info(`Starting Nikke YouTube Shorts scraping for ${this.CHANNEL_HANDLE}...`);
    const results: ScrapedData[] = [];

    try {
      if (!process.env.YOUTUBE_API_KEY) {
        logger.error('YOUTUBE_API_KEY is not defined. Check your .env file.');
        return results;
      }

      // 0. DB 캐릭터명(매칭 대상). 긴 이름부터 매칭하도록 정렬.
      const dbCharacters = await prisma.character.findMany({
        where: { game: { slug: 'nikke' } },
        select: { name: true },
      });
      const names = Array.from(new Set(dbCharacters.map((c) => c.name)))
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);
      logger.info(`Loaded ${names.length} Nikke character names from DB`);
      if (names.length === 0) {
        logger.warn('No Nikke characters in DB — run the character scraper first.');
        return results;
      }

      // 1. 핸들 → 채널 → uploads 재생목록
      const channelResponse: any = await youtube.channels.list({
        part: ['contentDetails', 'snippet', 'id'],
        forHandle: this.CHANNEL_HANDLE,
      });
      const channelItem = channelResponse.data.items?.[0];
      if (!channelItem) {
        logger.error(`Channel not found by handle: ${this.CHANNEL_HANDLE}`);
        return results;
      }
      const uploadsPlaylistId = channelItem.contentDetails?.relatedPlaylists?.uploads;
      if (!uploadsPlaylistId) {
        logger.error('Could not find uploads playlist.');
        return results;
      }
      logger.info(`Uploads playlist: ${uploadsPlaylistId}`);

      // 2. 업로드 영상 ID 수집(최대 10페이지 = 500개)
      const videoIds: string[] = [];
      let nextPageToken: string | undefined = undefined;
      let pageCount = 0;
      do {
        const response: any = await youtube.playlistItems.list({
          part: ['snippet'],
          playlistId: uploadsPlaylistId,
          maxResults: 50,
          pageToken: nextPageToken,
        });
        for (const item of response.data.items || []) {
          const vid = item.snippet?.resourceId?.videoId;
          if (vid) videoIds.push(vid);
        }
        nextPageToken = response.data.nextPageToken;
        if (++pageCount >= 10) break;
      } while (nextPageToken);
      logger.info(`Collected ${videoIds.length} video IDs`);

      // 3. 영상 상세(길이/제목)
      const videoDetails: any[] = [];
      for (let i = 0; i < videoIds.length; i += 50) {
        const detailsResponse: any = await youtube.videos.list({
          part: ['contentDetails', 'snippet', 'player'],
          id: videoIds.slice(i, i + 50),
          maxWidth: 320, // player.embedWidth/embedHeight 계산용 → 종횡비 판별
        });
        videoDetails.push(...(detailsResponse.data.items || []));
      }
      logger.info(`Fetched details for ${videoDetails.length} videos`);

      // 4. Shorts(≤60s) + 제목에서 캐릭터명 매칭
      for (const video of videoDetails) {
        const durationSeconds = this.parseDuration(video.contentDetails?.duration || '');
        if (durationSeconds > 60) continue;

        // 세로(9:16) 쇼츠만. 16:9 가로 영상(PV 등 ≤60초로 섞여 들어옴)은 제외.
        const ew = Number(video.player?.embedWidth) || 0;
        const eh = Number(video.player?.embedHeight) || 0;
        if (ew > 0 && eh > 0 && ew >= eh) continue;

        const videoId = video.id;
        const title: string = video.snippet?.title || '';
        if (!videoId || !title) continue;

        // 우리가 수집할 3종만: 코스튬 소개 / 프로필 / 모션 뷰. 그 외(PV/OST 등)는 건너뜀.
        const videoType = this.classifyType(title);
        if (!videoType) continue;

        const matchedName = this.matchCharacter(title, names);
        if (!matchedName) continue;

        const thumbnail =
          video.snippet?.thumbnails?.high?.url ||
          video.snippet?.thumbnails?.default?.url ||
          '';
        const url = `https://www.youtube.com/shorts/${videoId}`;

        results.push({
          name: title,
          sourceUrl: url,
          title,
          url,
          thumbnailUrl: thumbnail,
          characterName: matchedName,
          type: videoType,
        });
        logger.info(`Found Shorts: ${title} (Matched: ${matchedName}, ${videoType}, ${durationSeconds}s)`);
      }

      logger.info(`Scraped ${results.length} Nikke Shorts via API`);
    } catch (e) {
      logger.error('Error scraping Nikke YouTube Shorts:', e);
    }

    return results;
  }

  /**
   * @nikkekr 제목으로 영상 종류 분류 — 우리가 수집할 3종만.
   * 예) "NIKKE 코스튬 소개 - 프리바티 | ..." / "NIKKE 프로필 - ... | ..." / "NIKKE 모션 VIEW - ... | ..."
   * 해당 없으면 null(PV/OST 등 제외).
   */
  private classifyType(title: string): string | null {
    const t = title.normalize('NFC');
    if (/코스튬\s*소개/.test(t)) return '코스튬 소개';
    if (/프로필/.test(t)) return '프로필';
    if (/모션\s*(뷰|view)/i.test(t)) return '모션 뷰';
    return null;
  }

  /** 제목에 포함된 DB 캐릭터명 중 가장 긴 것을 반환(부분일치 오매칭 방지). names는 길이 내림차순. */
  private matchCharacter(title: string, names: string[]): string | null {
    const t = title.normalize('NFC');
    for (const name of names) {
      if (name.length >= 2 && t.includes(name.normalize('NFC'))) return name;
    }
    return null;
  }

  /** ISO 8601 duration → 초. */
  private parseDuration(duration: string): number {
    const m = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return 0;
    return (
      parseInt(m[1] || '0') * 3600 + parseInt(m[2] || '0') * 60 + parseInt(m[3] || '0')
    );
  }
}
