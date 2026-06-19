import axios from 'axios';
import { prisma } from '../../../utils/prisma';
import logger from '../../../utils/logger';
import { crawlProgress } from '../../crawlProgress';
import { EventType } from '@prisma/client';

/**
 * 이환(NTE) 이벤트(캘린더) 스크래퍼 — everness.info GraphQL.
 *
 *   query { events { id type name image start{date time} end{date time} description } }
 *   - start/end = EventDate { date:"DD.MM.YYYY", time:"HH:MM" } (KST 표기값). "?" 등 비정상 값은 스킵.
 *   - type 은 현재 'minor' 단일. 이름 키워드로 GACHA/MAINTENANCE/EVENT 분류(니케 EventScraper 발상).
 *
 * CalendarEvent 에 gameId+targetId(=everness event id)+type 기준 upsert(니케 패턴).
 */

const GRAPHQL = 'https://everness.info/api/graphql';
const GAME = 'nte';

const EVENTS_QUERY = `query {
  events { id type name image start { date time } end { date time } description }
}`;

export class NteEventScraper {
  /** "DD.MM.YYYY" + "HH:MM"(KST 표기값) → Date. 표기 시각을 보존하려고 UTC로 구성(리딤 스크래퍼와 동일 발상). */
  private parseDate(d?: { date?: string; time?: string } | null): Date | null {
    if (!d?.date) return null;
    const m = d.date.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!m) return null;
    const [, dd, mm, yyyy] = m;
    let hh = 0;
    let min = 0;
    const tm = (d.time || '').match(/^(\d{1,2}):(\d{1,2})$/);
    if (tm) {
      hh = Number(tm[1]);
      min = Number(tm[2]);
    }
    const pad = (n: number) => String(n).padStart(2, '0');
    const iso = `${yyyy}-${pad(Number(mm))}-${pad(Number(dd))}T${pad(hh)}:${pad(min)}:00Z`;
    const date = new Date(iso);
    return isNaN(date.getTime()) ? null : date;
  }

  private classify(name: string): EventType {
    const n = (name || '').normalize('NFC');
    if (/점검|maintenance/i.test(n)) return EventType.MAINTENANCE;
    if (/모집|픽업|배너|gacha|pick.?up/i.test(n)) return EventType.GACHA;
    return EventType.EVENT;
  }

  async scrape(): Promise<number> {
    logger.info('Starting NTE(이환) event scraping (everness.info GraphQL)...');
    const game = await prisma.game.findUnique({ where: { slug: GAME } });
    if (!game) throw new Error('Game nte not found in database.');

    const res = await axios.post(
      GRAPHQL,
      { query: EVENTS_QUERY },
      {
        timeout: 20000,
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'content-type': 'application/json',
          'Accept-Language': 'ko',
        },
      },
    );
    if (res.data?.errors?.length) {
      throw new Error(`GraphQL error: ${JSON.stringify(res.data.errors).slice(0, 300)}`);
    }
    const events: any[] = res.data?.data?.events || [];
    logger.info(`Found ${events.length} NTE events.`);

    let count = 0;
    let processed = 0;
    for (const ev of events) {
      if (crawlProgress.shouldStop()) break; // 사용자 중단 요청
      crawlProgress.report(processed, events.length, ev.name);
      processed++;
      const start = this.parseDate(ev.start);
      if (!start) {
        logger.warn(`[nte/event] skip "${ev.name}" — invalid start date.`);
        continue;
      }
      const end = this.parseDate(ev.end);
      const type = this.classify(ev.name);
      const title = (ev.name || '').toString().trim() || `event_${ev.id}`;
      const targetId = String(ev.id);
      const metadata: Record<string, any> = { rawType: ev.type ?? null };
      if (ev.description) metadata.description = ev.description;
      if (ev.image) metadata.image = ev.image;

      const existing = await prisma.calendarEvent.findFirst({
        where: { gameId: game.id, targetId, type },
      });
      if (existing) {
        await prisma.calendarEvent.update({
          where: { id: existing.id },
          data: { title, startTime: start, endTime: end, metadata },
        });
      } else {
        await prisma.calendarEvent.create({
          data: { gameId: game.id, type, title, startTime: start, endTime: end, targetId, metadata },
        });
      }
      count++;
    }
    logger.info(`[nte/event] upserted ${count} calendar events.`);
    return count;
  }
}
