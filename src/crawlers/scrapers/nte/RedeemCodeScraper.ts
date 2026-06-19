import axios from 'axios';
import { prisma } from '../../../utils/prisma';
import logger from '../../../utils/logger';

/**
 * 이환(NTE) 리딤코드(쿠폰) 스크래퍼 — everness.info GraphQL `promocodes`.
 *
 *   query { promocodes { id code is_expired start{date time} end{date time} rewards{item_id amount} } }
 *   - rewards.item_id 는 내부 아이템 id라 `items{id name}` 맵으로 한글 보상명을 해석한다.
 *
 * RedeemGroup('이환 쿠폰') 하나에 RedeemCode(code unique)들을 upsert(스타레일 RedeemCodeScraper 발상).
 * (RedeemCode 모델엔 개별 만료시각 컬럼이 없어 그룹 단위로 묶는다.)
 */

const GRAPHQL = 'https://everness.info/api/graphql';
const GAME = 'nte';
const GROUP_TITLE = '이환 쿠폰';

const QUERY = `query {
  promocodes { id code is_expired start { date time } end { date time } rewards { item_id amount } }
  items { id name }
}`;

export class NteRedeemCodeScraper {
  private parseDate(d?: { date?: string; time?: string } | null): Date | null {
    if (!d?.date) return null;
    const m = d.date.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!m) return null;
    const [, dd, mm, yyyy] = m;
    const tm = (d.time || '').match(/^(\d{1,2}):(\d{1,2})$/);
    const pad = (n: number) => String(n).padStart(2, '0');
    const iso = `${yyyy}-${pad(Number(mm))}-${pad(Number(dd))}T${pad(
      tm ? Number(tm[1]) : 0,
    )}:${pad(tm ? Number(tm[2]) : 0)}:00Z`;
    const date = new Date(iso);
    return isNaN(date.getTime()) ? null : date;
  }

  async scrape(): Promise<{ codes: string[] } | null> {
    logger.info('Starting NTE(이환) redeem code scraping (everness.info promocodes)...');
    const game = await prisma.game.findUnique({ where: { slug: GAME } });
    if (!game) {
      logger.error('Game nte not found in database.');
      return null;
    }

    const res = await axios.post(
      GRAPHQL,
      { query: QUERY },
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
    const promocodes: any[] = res.data?.data?.promocodes || [];
    const items: any[] = res.data?.data?.items || [];
    const nameMap = new Map<string, string>(items.map((i) => [String(i.id), i.name]));
    logger.info(`Found ${promocodes.length} NTE promocodes.`);
    if (promocodes.length === 0) return { codes: [] };

    // 유효한 코드의 만료 최댓값을 그룹 endTime으로(없으면 null → 영속).
    let groupEnd: Date | null = null;
    for (const p of promocodes) {
      if (p.is_expired) continue;
      const e = this.parseDate(p.end);
      if (e && (!groupEnd || e > groupEnd)) groupEnd = e;
    }

    let group = await prisma.redeemGroup.findFirst({
      where: { gameId: game.id, title: GROUP_TITLE },
    });
    if (!group) {
      group = await prisma.redeemGroup.create({
        data: { gameId: game.id, title: GROUP_TITLE, endTime: groupEnd },
      });
    } else {
      group = await prisma.redeemGroup.update({
        where: { id: group.id },
        data: { endTime: groupEnd },
      });
    }

    const codes: string[] = [];
    for (const p of promocodes) {
      const code = (p.code || '').toString().trim();
      if (!code) continue;
      const reward =
        (p.rewards || [])
          .map((r: any) => {
            const nm = nameMap.get(String(r.item_id)) || r.item_id;
            return r.amount ? `${nm} x${r.amount}` : nm;
          })
          .join(', ') || null;
      try {
        await prisma.redeemCode.upsert({
          where: { code },
          update: { groupId: group.id, reward },
          create: { groupId: group.id, code, reward },
        });
        codes.push(code);
      } catch (e) {
        logger.error(`[nte/redeem] failed to upsert code ${code}:`, e);
      }
    }
    logger.info(`[nte/redeem] upserted ${codes.length} codes.`);
    return { codes };
  }
}
