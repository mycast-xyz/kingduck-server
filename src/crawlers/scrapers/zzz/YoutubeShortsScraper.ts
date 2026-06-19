import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { youtube } from '../../../utils/youtubeApiClient';
import { prisma } from '../../../utils/prisma';
import logger from '../../../utils/logger';

/**
 * 젠레스 존 제로(ZZZ) 공식 한국 채널(@ZZZ_KO)에서 캐릭터 영상을 수집한다.
 *
 * 니케 스크래퍼와 같은 방식(채널 uploads → 제목에서 DB 캐릭터명 매칭, 가장 긴 이름 우선)이지만
 * ZZZ 공식 채널의 캐릭터 영상은 **가로(16:9) PV/플레이 영상**이라 세로(쇼츠) 필터를 쓰지 않는다.
 * 캐릭터별로 명확히 분류되는 두 종류만 수집한다:
 *   - "캐릭터 PV"   (예: "벨리나 캐릭터 PV 「극작법」 | 젠레스 존 제로")
 *   - "캐릭터 플레이" (예: "프로미아 캐릭터 플레이 「치명적인 경매품」 | 젠레스 존 제로")
 * 그 외(버전 PV/방송/콜라보/Bangboo 등)는 제외.
 */
export class ZzzYoutubeScraper extends ScraperBase {
  private readonly CHANNEL_HANDLE = '@ZZZ_KO';

  constructor() {
    super('zzz');
  }

  async scrape(): Promise<ScrapedData[]> {
    logger.info(`Starting ZZZ YouTube scraping for ${this.CHANNEL_HANDLE}...`);
    const results: ScrapedData[] = [];

    try {
      if (!process.env.YOUTUBE_API_KEY) {
        logger.error('YOUTUBE_API_KEY is not defined. Check your .env file.');
        return results;
      }

      // 0. DB 캐릭터명(매칭 대상). 긴 이름부터 매칭(부분일치 오매칭 방지).
      const dbCharacters = await prisma.character.findMany({
        where: { game: { slug: 'zzz' } },
        select: { name: true },
      });
      const names = Array.from(new Set(dbCharacters.map((c) => c.name)))
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);
      logger.info(`Loaded ${names.length} ZZZ character names from DB`);
      if (names.length === 0) {
        logger.warn('No ZZZ characters in DB — run the character scraper first.');
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
      const uploadsPlaylistId =
        channelItem.contentDetails?.relatedPlaylists?.uploads;
      if (!uploadsPlaylistId) {
        logger.error('Could not find uploads playlist.');
        return results;
      }
      logger.info(`Uploads playlist: ${uploadsPlaylistId}`);

      // 2. 업로드 영상 수집(제목+썸네일). 안전 상한 20페이지(=1000개).
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
          const videoId = item.snippet?.resourceId?.videoId;
          const title: string = item.snippet?.title || '';
          if (!videoId || !title) continue;

          const videoType = this.classifyType(title);
          if (!videoType) continue;

          const matchedName = this.matchCharacter(title, names);
          if (!matchedName) continue;

          const thumbnail =
            item.snippet?.thumbnails?.high?.url ||
            item.snippet?.thumbnails?.default?.url ||
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
          logger.info(`Found ZZZ video: ${title} (Matched: ${matchedName}, ${videoType})`);
        }
        nextPageToken = response.data.nextPageToken;
        if (++pageCount >= 20) break;
      } while (nextPageToken);

      logger.info(`Scraped ${results.length} ZZZ videos via API`);
    } catch (e) {
      logger.error('Error scraping ZZZ YouTube videos:', e);
    }

    return results;
  }

  /** 제목으로 영상 종류 분류 — 캐릭터별 2종만. 해당 없으면 null. */
  private classifyType(title: string): string | null {
    const t = title.normalize('NFC');
    if (/캐릭터\s*PV/i.test(t)) return '캐릭터 PV';
    if (/캐릭터\s*플레이/.test(t)) return '캐릭터 플레이';
    return null;
  }

  /** 제목에 포함된 DB 캐릭터명 중 가장 긴 것 반환(부분일치 오매칭 방지). names는 길이 내림차순. */
  private matchCharacter(title: string, names: string[]): string | null {
    const t = title.normalize('NFC');
    for (const name of names) {
      if (name.length >= 2 && t.includes(name.normalize('NFC'))) return name;
    }
    return null;
  }
}
