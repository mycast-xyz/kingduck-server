import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import logger from '../../../utils/logger';

export class EventScraper extends ScraperBase {
  private readonly API_URL =
    'https://bbs-api-os.hoyolab.com/community/post/wapi/getNewsList?gids=6&page_size=15&type=1';

  constructor() {
    super('starrail');
  }

  async scrape(): Promise<ScrapedData[]> {
    logger.info('Starting Star Rail Event scraping...');
    const results: ScrapedData[] = [];

    try {
      const response = await axios.get(this.API_URL, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      });

      if (response.data.retcode !== 0) {
        logger.error(`API Error: ${response.data.message}`);
        return [];
      }

      const list = response.data.data.list;
      logger.info(`Fetched ${list.length} posts.`);

      for (const item of list) {
        const post = item.post;

        // Try to find Korean subject first, fallback to default subject
        let subject = post.subject;
        if (post.multi_language_info?.lang_subject?.['ko-kr']) {
          subject = post.multi_language_info.lang_subject['ko-kr'];
        }

        // Keywords to filter
        const isUpdate = subject.includes('버전 업데이트 안내');
        const isWarp = subject.includes('이벤트 워프');

        if (isUpdate || isWarp) {
          const type = isUpdate ? 'update' : 'warp';

          results.push({
            name: subject,
            sourceUrl: `https://www.hoyolab.com/article/${post.post_id}`,
            metadata: {
              id: post.post_id,
              type: type,
              subject: subject,
              content: post.content, // Summary/Intro
              created_at: post.created_at,
              start_time: post.event_start_date,
              end_time: post.event_end_date,
              cover:
                item.cover?.url ||
                (item.image_list && item.image_list.length > 0
                  ? item.image_list[0].url
                  : ''),
              raw: post,
            },
          });
        }
      }

      logger.info(`Filtered ${results.length} relevant events.`);
    } catch (e) {
      logger.error('Error scraping Star Rail events:', e);
    }

    return results;
  }

  async save(data: ScrapedData[]) {
    const outputDir = path.join(process.cwd(), 'data', 'crawlers', 'starrail');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const filePath = path.join(outputDir, 'events.json');
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    logger.info(`Saved ${data.length} events to ${filePath}`);
  }
}
