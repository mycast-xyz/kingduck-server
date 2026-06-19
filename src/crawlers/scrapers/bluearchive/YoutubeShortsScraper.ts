import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { youtube } from '../../../utils/youtubeApiClient';
import { prisma } from '../../../utils/prisma';
import logger from '../../../utils/logger';
import { crawlProgress } from '../../crawlProgress';

/**
 * 블루 아카이브(Blue Archive) 공식 한국 채널(@bluearchive_kr)에서 캐릭터 영상을 수집한다.
 *
 * ZZZ 스크래퍼와 동일한 방식(채널 uploads → 제목에서 DB 캐릭터명 매칭, 가장 긴 이름 우선)이지만,
 * **BA 캐릭터 PV는 가로(16:9)**라 니케/NTE의 세로(9:16) 쇼츠 종횡비 필터를 쓰지 않는다(쓰면 전부 걸러짐).
 * 길이 제한도 두지 않는다(캐릭 PV는 보통 1~3분). 제목에 캐릭명이 들어간 PV/소개/쇼케이스만 수집한다.
 */
export class BlueArchiveYoutubeShortsScraper extends ScraperBase {
  private readonly CHANNEL_HANDLE = '@bluearchive_kr';

  constructor() {
    super('bluearchive');
  }

  async scrape(): Promise<ScrapedData[]> {
    logger.info(`Starting Blue Archive YouTube scraping for ${this.CHANNEL_HANDLE}...`);
    const results: ScrapedData[] = [];

    try {
      if (!process.env.YOUTUBE_API_KEY) {
        logger.error('YOUTUBE_API_KEY is not defined. Check your .env file.');
        return results;
      }

      // 0. DB 캐릭터명(매칭 대상). 긴 이름부터 매칭(부분일치 오매칭 방지 — "아루(수영복)" > "아루").
      const dbCharacters = await prisma.character.findMany({
        where: { game: { slug: 'bluearchive' } },
        select: { name: true },
      });
      const names = Array.from(new Set(dbCharacters.map((c) => c.name)))
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);
      logger.info(`Loaded ${names.length} Blue Archive character names from DB`);
      if (names.length === 0) {
        logger.warn('No Blue Archive characters in DB — run the character scraper first.');
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

      // 2. 업로드 영상 수집(제목+썸네일). 안전 상한 40페이지(=2000개).
      const seen = new Set<string>();
      let nextPageToken: string | undefined = undefined;
      let pageCount = 0;
      let processed = 0;
      do {
        if (crawlProgress.shouldStop()) break; // 사용자 중단 요청
        const response: any = await youtube.playlistItems.list({
          part: ['snippet'],
          playlistId: uploadsPlaylistId,
          maxResults: 50,
          pageToken: nextPageToken,
        });
        for (const item of response.data.items || []) {
          crawlProgress.report(processed, undefined, item.snippet?.title || '');
          processed++;
          const videoId = item.snippet?.resourceId?.videoId;
          const title: string = item.snippet?.title || '';
          if (!videoId || !title || seen.has(videoId)) continue;

          const videoType = this.classifyType(title);
          if (!videoType) continue;

          const matchedName = this.matchCharacter(title, names);
          if (!matchedName) continue;

          seen.add(videoId);

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
          logger.info(
            `Found Blue Archive video: ${title} (Matched: ${matchedName}, ${videoType})`,
          );
        }
        nextPageToken = response.data.nextPageToken;
        if (++pageCount >= 40) break;
      } while (nextPageToken);

      logger.info(`Scraped ${results.length} Blue Archive videos via API`);
    } catch (e) {
      logger.error('Error scraping Blue Archive YouTube videos:', e);
    }

    return results;
  }

  /** 제목으로 영상 종류 분류 — 캐릭터 PV/소개/쇼케이스 위주. 해당 없으면 null(거름). */
  private classifyType(title: string): string | null {
    const t = title.normalize('NFC');
    // 업데이트/버전/OST 등 비캐릭터 영상 제외(캐릭명이 우연히 포함돼도 거른다).
    if (/업데이트|버전|OST|생방송|방송|예고|공지/i.test(t)) return null;
    if (/쇼케이스/.test(t)) return '쇼케이스';
    if (/소개/.test(t)) return '캐릭터 소개';
    if (/PV|캐릭터\s*영상|스페셜\s*영상/i.test(t)) return '캐릭터 PV';
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
