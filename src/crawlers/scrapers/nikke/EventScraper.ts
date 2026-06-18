import axios from 'axios';
import { prisma } from '../../../utils/prisma';
import logger from '../../../utils/logger';
import { EventType } from '@prisma/client';

/**
 * 니케 이벤트(캘린더) 크롤 — blablalink 공식 캘린더 API.
 * activity-calendar 페이지가 호출하는 직접 엔드포인트(렌더 불필요, 인증 없이 200):
 *   POST api.blablalink.com/api/ugc/direct/standalonesite/Dynamics/GetCalendarDetail
 *   (헤더 x-language:ko + x-common-params{language:ko} 으로 한국어 이름 — 없으면 영어)
 *   → { code, data: { character_gacha[], skin_gacha[], version_event[], raid[],
 *        simulation_room[], arena[] } } (start_time/end_time = Unix 초 문자열).
 * 각 섹션을 EventType으로 매핑해 CalendarEvent에 upsert(gameId+targetId+type 기준).
 */
const CAL_API =
  'https://api.blablalink.com/api/ugc/direct/standalonesite/Dynamics/GetCalendarDetail';

// 캘린더 섹션 → 우리 EventType. (arena=상시 PvP 시즌 16종은 노이즈라 제외.)
const SECTION_TYPE: Record<string, EventType> = {
  character_gacha: EventType.GACHA,
  skin_gacha: EventType.GACHA,
  version_event: EventType.EVENT,
  raid: EventType.EVENT,
  simulation_room: EventType.EVENT,
};

export class BlablalinkEventScraper {
  private gameSlug = 'nikke';

  async scrape(): Promise<number> {
    const game = await prisma.game.findUnique({
      where: { slug: this.gameSlug },
    });
    if (!game) throw new Error('Game nikke not found in database.');

    // POST + 한국어 헤더. blablalink 게이트웨이는 x-language/x-common-params로 응답 언어를 정한다.
    const res = await axios.post(
      CAL_API,
      {},
      {
        timeout: 20000,
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'content-type': 'application/json',
          'x-language': 'ko',
          'x-common-params': JSON.stringify({
            source: 'pc_web',
            language: 'ko',
            env: 'prod',
          }),
        },
      },
    );
    const data = res.data?.data;
    if (!data) {
      logger.warn('[nikke/event] GetCalendarDetail returned no data.');
      return 0;
    }

    let count = 0;
    for (const [section, type] of Object.entries(SECTION_TYPE)) {
      // 섹션은 { items: [...] } 형태(일부는 배열일 수 있어 둘 다 허용).
      const raw = data[section];
      const items = Array.isArray(raw) ? raw : raw?.items;
      if (!Array.isArray(items)) continue;
      for (const it of items) {
        const start = Number(it.start_time);
        if (!Number.isFinite(start) || start <= 0) continue;
        const end = Number(it.end_time);
        const title = (it.name || section).toString().trim();
        // 재크롤 안정 키: 섹션+타입+시작시각+이름(시작시각 바뀌면 다음 회차로 새 이벤트).
        const targetId = `${section}:${it.type || ''}:${it.start_time}:${(
          it.name ||
          it.banner ||
          ''
        )
          .toString()
          .slice(0, 24)}`;
        const metadata: Record<string, any> = {
          section,
          rawType: it.type ?? null,
        };
        if (it.description) metadata.description = it.description;
        if (it.banner) metadata.banner = it.banner;
        if (it.characters) metadata.characters = it.characters;
        if (it.costume_name) metadata.costumeName = it.costume_name;

        await this.upsert(
          game.id,
          type,
          title,
          new Date(start * 1000),
          Number.isFinite(end) && end > 0 ? new Date(end * 1000) : null,
          targetId,
          metadata,
        );
        count++;
      }
    }
    logger.info(`[nikke/event] upserted ${count} calendar events.`);
    return count;
  }

  private async upsert(
    gameId: number,
    type: EventType,
    title: string,
    startTime: Date,
    endTime: Date | null,
    targetId: string,
    metadata: any,
  ) {
    const existing = await prisma.calendarEvent.findFirst({
      where: { gameId, targetId, type },
    });
    if (existing) {
      await prisma.calendarEvent.update({
        where: { id: existing.id },
        data: { title, startTime, endTime, metadata },
      });
    } else {
      await prisma.calendarEvent.create({
        data: { gameId, type, title, startTime, endTime, targetId, metadata },
      });
    }
  }
}
