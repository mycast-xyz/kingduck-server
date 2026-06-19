import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { youtube } from '../../../utils/youtubeApiClient';
import { prisma } from '../../../utils/prisma';
import logger from '../../../utils/logger';
import { crawlProgress } from '../../crawlProgress';

/**
 * 이환(NTE) 공식 한국 채널(@NTE_KO, "이환")에서 캐릭터 Shorts를 수집한다.
 *
 * 니케 YoutubeShortsScraper와 동일한 방식:
 *   - 제목에서 DB nte 캐릭터명을 직접 매칭(가장 긴 이름 우선 — 부분일치 오매칭 방지).
 *   - **세로(9:16) 숏츠만**: videos.list `part:['player']` + `maxWidth`로 player.embedWidth/Height를
 *     받아 ew>=eh(가로)면 제외. 길이 ≤60초만(숏츠 기준).
 * 채널 제목은 "이환 | 라크리모사 코스튬 쇼츠", "이환丨캐릭터 쇼케이스 丨라크리모사" 등 구분자(|·丨·ㅣ)가
 * 다양해 엄격한 종류 화이트리스트를 두지 않고, 세로+길이+캐릭터명 매칭으로 거른 뒤 키워드로 type만 라벨링.
 */
export class NteYoutubeShortsScraper extends ScraperBase {
  private readonly CHANNEL_HANDLE = '@NTE_KO';

  constructor() {
    super('nte');
  }

  async scrape(): Promise<ScrapedData[]> {
    logger.info(`Starting NTE YouTube Shorts scraping for ${this.CHANNEL_HANDLE}...`);
    const results: ScrapedData[] = [];

    try {
      if (!process.env.YOUTUBE_API_KEY) {
        logger.error('YOUTUBE_API_KEY is not defined. Check your .env file.');
        return results;
      }

      // 0. DB 캐릭터명(매칭 대상). 긴 이름부터 매칭.
      const dbCharacters = await prisma.character.findMany({
        where: { game: { slug: 'nte' } },
        select: { name: true },
      });
      const names = Array.from(new Set(dbCharacters.map((c) => c.name)))
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);
      logger.info(`Loaded ${names.length} NTE character names from DB`);
      if (names.length === 0) {
        logger.warn('No NTE characters in DB — run the character scraper first.');
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

      // 2. 업로드 영상 ID 수집(안전 상한 40페이지).
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
        if (++pageCount >= 40) break;
      } while (nextPageToken);
      logger.info(`Collected ${videoIds.length} video IDs`);

      // 3. 영상 상세(길이/제목/플레이어 종횡비).
      const videoDetails: any[] = [];
      for (let i = 0; i < videoIds.length; i += 50) {
        const detailsResponse: any = await youtube.videos.list({
          part: ['contentDetails', 'snippet', 'player'],
          id: videoIds.slice(i, i + 50),
          maxWidth: 320, // player.embedWidth/embedHeight → 종횡비 판별용
        });
        videoDetails.push(...(detailsResponse.data.items || []));
      }
      logger.info(`Fetched details for ${videoDetails.length} videos`);

      // 4. Shorts(≤60s, 세로) + 제목에서 캐릭터명 매칭
      let processed = 0;
      for (const video of videoDetails) {
        if (crawlProgress.shouldStop()) break; // 사용자 중단 요청
        crawlProgress.report(processed, videoDetails.length, video.snippet?.title || '');
        processed++;
        const durationSeconds = this.parseDuration(video.contentDetails?.duration || '');
        if (durationSeconds > 60) continue;

        // 세로(9:16) 숏츠만. 16:9 가로 영상(PV 등)은 제외.
        const ew = Number(video.player?.embedWidth) || 0;
        const eh = Number(video.player?.embedHeight) || 0;
        if (ew > 0 && eh > 0 && ew >= eh) continue;

        const videoId = video.id;
        const title: string = video.snippet?.title || '';
        if (!videoId || !title) continue;

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
          type: this.classifyType(title),
        });
        logger.info(
          `Found NTE Shorts: ${title} (Matched: ${matchedName}, ${durationSeconds}s)`,
        );
      }

      logger.info(`Scraped ${results.length} NTE Shorts via API`);
    } catch (e) {
      logger.error('Error scraping NTE YouTube Shorts:', e);
    }

    return results;
  }

  /** 제목 키워드로 type 라벨링(거르지는 않음 — 세로+길이+이름 매칭으로 이미 필터). */
  private classifyType(title: string): string {
    const t = title.normalize('NFC');
    if (/코스튬/.test(t)) return '코스튬';
    if (/캐릭터\s*PV|쇼케이스|character/i.test(t)) return '캐릭터 PV';
    if (/애니메이션|EP|MV/i.test(t)) return '애니메이션';
    if (/인게임|게임\s*플레이|gameplay/i.test(t)) return '인게임';
    return '쇼츠';
  }

  /** 제목에 포함된 DB 캐릭터명 중 가장 긴 것을 반환. names는 길이 내림차순. */
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
    return parseInt(m[1] || '0') * 3600 + parseInt(m[2] || '0') * 60 + parseInt(m[3] || '0');
  }
}
