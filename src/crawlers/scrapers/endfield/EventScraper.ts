import axios from 'axios';
import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import logger from '../../../utils/logger';
import { prisma } from '../../../utils/prisma';
import { EventType, CrawlerStatus, EventStatus } from '@prisma/client';

export class EventScraper extends ScraperBase {
  private readonly LIST_API_URL =
    'https://comm-api.game.naver.com/nng_main/v1/community/lounge/Arknights_Endfield/feed?boardId=3&buffFilteringYN=N&limit=25&offset=0&order=NEW';
  private readonly DETAIL_API_URL_BASE =
    'https://comm-api.game.naver.com/nng_main/v1/community/lounge/Arknights_Endfield/feed/';

  // Keywords to filter by
  private readonly FILTER_KEYWORDS = [
    '이벤트 설명',
    '한정 판매',
    '허가 헤드헌팅',
  ];

  constructor() {
    super('endfield');
  }

  async scrape(): Promise<ScrapedData[]> {
    logger.info('Starting Endfield Event scraping from Naver...');

    // Get Game ID
    const game = await prisma.game.findUnique({
      where: { slug: this.gameSlug },
    });

    if (!game) {
      logger.error(`Game ${this.gameSlug} not found in database.`);
      return [];
    }

    const results: ScrapedData[] = [];

    try {
      // Fetch the list of posts
      const listResponse = await axios.get(this.LIST_API_URL, {
        timeout: 15000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/json',
        },
      });

      if (listResponse.data.code !== 200) {
        logger.error(`API Error: ${listResponse.data.message}`);
        return [];
      }

      const feeds = listResponse.data.content.feeds;
      logger.info(`Fetched ${feeds.length} posts from Naver.`);

      for (const item of feeds) {
        const feed = item.feed;
        const title = feed.title;

        // Check if title contains any of the filter keywords
        const matchesFilter = this.FILTER_KEYWORDS.some((keyword) =>
          title.includes(keyword),
        );

        if (matchesFilter) {
          logger.info(`Processing: ${title}`);

          // Fetch detail information
          await this.delay(200);
          const detailResponse = await axios.get(
            `${this.DETAIL_API_URL_BASE}${feed.feedId}`,
            {
              timeout: 15000,
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                Accept: 'application/json',
              },
            },
          );

          if (detailResponse.data.code === 200) {
            const detailFeed = detailResponse.data.content?.feed;

            if (!detailFeed) {
              logger.error(
                `No feed data in detail response for ${feed.feedId}`,
              );
              continue;
            }

            // Determine event type based on keywords
            let eventType: EventType = EventType.EVENT;
            if (title.includes('허가 헤드헌팅')) {
              eventType = EventType.GACHA;
            } else if (title.includes('한정 판매')) {
              eventType = EventType.GACHA;
            }

            // Extract dates from content if available
            const pcLink = detailFeed.feedLink?.pc || feed.feedLink?.pc || '';

            // Extract only text sections from HTML content
            const textContent = this.extractTextSections(detailFeed.contents);

            results.push({
              name: title,
              sourceUrl: pcLink,
              metadata: {
                feedId: feed.feedId,
                title: title,
                createdDate: feed.createdDate,
                content: textContent,
                imageUrl: feed.repImageUrl,
                type: eventType,
              },
            });
          }
        }
      }
    } catch (err) {
      logger.error('Error during scraping', err);
      throw err;
    }

    return results;
  }

  private extractItems(content: string): {
    weapons: string[];
    characters: string[];
    featuredWeapons: string[];
    featuredCharacters: string[];
  } {
    const $ = cheerio.load(content);
    const text = $.text();

    const weapons: string[] = [];
    const characters: string[] = [];
    const featuredWeapons: string[] = [];
    const featuredCharacters: string[] = [];

    // Extract weapon list: 획득 가능한 6성 무기 목록:
    const weaponMatch = text.match(
      /획득 가능한 6성 무기 목록:\s*([^\n]+?)(?:​|※)/,
    );
    if (weaponMatch) {
      const weaponList = weaponMatch[1]
        .split('/')
        .map((w) => w.trim())
        .filter((w) => w && w.length > 0 && w.length < 50 && !w.includes('▼'));
      weapons.push(...weaponList);
    }

    // Extract character list: 획득 가능한 6성 오퍼레이터 목록:
    const charMatch = text.match(
      /획득 가능한 6성 오퍼레이터 목록:\s*([^\n]+?)(?:·|※)/,
    );
    if (charMatch) {
      const charList = charMatch[1]
        .split('/')
        .map((c) => c.trim())
        .filter(
          (c) =>
            c &&
            c.length > 0 &&
            c.length < 50 &&
            !c.includes('▼') &&
            !c.includes('허가'),
        );
      characters.push(...charList);
    }

    // Extract featured weapon: 확률 증가한 6성 무기:
    const featuredWeaponMatch = text.match(
      /확률 증가한 6성 무기:\s*\[([^\]]+)\]/,
    );
    if (featuredWeaponMatch) {
      featuredWeapons.push(featuredWeaponMatch[1].trim());
    }

    // Extract featured character: 확률 증가한 6성 오퍼레이터:
    const featuredCharMatch = text.match(
      /확률 증가한 6성 오퍼레이터:\s*\[([^\]]+)\]/,
    );
    if (featuredCharMatch) {
      featuredCharacters.push(featuredCharMatch[1].trim());
    }

    return { weapons, characters, featuredWeapons, featuredCharacters };
  }

  private extractDates(content: string): {
    startTime: Date | null;
    endTime: Date | null;
  } {
    const $ = cheerio.load(content);
    const text = $.text();

    // Extract Asia server times: 2026/02/07 12:00 ~ 2026/02/24 04:00
    const dateRangeMatch = text.match(
      /Asia 서버:\s*(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2})\s*~\s*(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2})/,
    );

    if (dateRangeMatch) {
      const startTime = new Date(
        dateRangeMatch[1].replace(/\//g, '-').replace(' ', 'T') + ':00+08:00',
      );
      const endTime = new Date(
        dateRangeMatch[2].replace(/\//g, '-').replace(' ', 'T') + ':00+08:00',
      );
      return { startTime, endTime };
    }

    // For events with vague end dates (e.g., "~ 버전 업데이트 전까지")
    const startOnlyMatch = text.match(
      /Asia 서버:\s*(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2})/,
    );
    if (startOnlyMatch) {
      const startTime = new Date(
        startOnlyMatch[1].replace(/\//g, '-').replace(' ', 'T') + ':00+08:00',
      );
      return { startTime, endTime: null };
    }

    // Alternative pattern for Americas/Europe if Asia not found
    const altDateMatch = text.match(
      /(?:Americas|Europe).*?(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2})\s*~\s*(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2})/,
    );
    if (altDateMatch) {
      const startTime = new Date(
        altDateMatch[1].replace(/\//g, '-').replace(' ', 'T') + ':00-05:00',
      );
      const endTime = new Date(
        altDateMatch[2].replace(/\//g, '-').replace(' ', 'T') + ':00-05:00',
      );
      return { startTime, endTime };
    }

    return { startTime: null, endTime: null };
  }

  private extractTextSections(htmlContent: string): string {
    const $ = cheerio.load(htmlContent);
    const textSections: string[] = [];

    // Extract all div elements with class "se-section se-section-text se-l-default"
    $('.se-section.se-section-text.se-l-default').each(
      (_index: number, element: any) => {
        const $element = $(element);

        // Remove all class attributes
        $element.find('*').removeAttr('class');
        $element.find('*').removeAttr('style');
        $element.find('*').removeAttr('id');

        let html = $element.html() || '';

        // Remove HTML comments
        html = html.replace(/<!--[\s\S]*?-->/g, '');

        // Remove empty spans and divs
        html = html.replace(/<(span|div)[^>]*>\s*<\/(span|div)>/g, '');

        if (html.trim()) {
          textSections.push(html.trim());
        }
      },
    );

    return textSections.join('\n\n');
  }

  async save(data: ScrapedData[]) {
    logger.info(`Saving ${data.length} events to database...`);

    // Get game ID
    const game = await prisma.game.findUnique({
      where: { slug: this.gameSlug },
    });

    if (!game) {
      logger.error(`Game ${this.gameSlug} not found in database.`);
      return;
    }

    let savedCount = 0;
    let updatedCount = 0;

    for (const item of data) {
      const { weapons, characters, featuredWeapons, featuredCharacters } =
        this.extractItems(item.metadata.content);
      const { startTime, endTime } = this.extractDates(item.metadata.content);

      // Build metadata object
      const metadata: any = {
        rawContent: item.metadata.content,
      };

      if (weapons.length > 0) metadata.weapons = weapons;
      if (characters.length > 0) metadata.characters = characters;
      if (featuredWeapons.length > 0)
        metadata.featuredWeapons = featuredWeapons;
      if (featuredCharacters.length > 0)
        metadata.featuredCharacters = featuredCharacters;

      try {
        // Check if event already exists
        const existing = await prisma.calendarEvent.findFirst({
          where: {
            targetId: item.metadata.feedId.toString(),
            gameId: game.id,
          },
        });

        if (existing) {
          // Update existing event
          await prisma.calendarEvent.update({
            where: { id: existing.id },
            data: {
              type: item.metadata.type,
              title: item.metadata.title,
              startTime: startTime || new Date(),
              endTime: endTime,
              imageUrl: item.metadata.imageUrl,
              officialLink:
                item.sourceUrl ||
                `https://game.naver.com/lounge/Arknights_Endfield/feed/${item.metadata.feedId}`,
              metadata: metadata,
            },
          });
          updatedCount++;
          logger.info(`Updated: ${item.metadata.title}`);
        } else {
          // Create new event
          await prisma.calendarEvent.create({
            data: {
              gameId: game.id,
              type: item.metadata.type,
              title: item.metadata.title,
              startTime: startTime || new Date(),
              endTime: endTime,
              imageUrl: item.metadata.imageUrl,
              officialLink:
                item.sourceUrl ||
                `https://game.naver.com/lounge/Arknights_Endfield/feed/${item.metadata.feedId}`,
              targetId: item.metadata.feedId.toString(),
              metadata: metadata,
              status: EventStatus.PENDING, // 승인 대기 상태로 생성
            },
          });
          savedCount++;
          logger.info(`Created: ${item.metadata.title}`);
        }
      } catch (error) {
        logger.error(`Failed to save event ${item.metadata.title}:`, error);
      }
    }

    logger.info(
      `Database save complete: ${savedCount} created, ${updatedCount} updated`,
    );
  }
}
