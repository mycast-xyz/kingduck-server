import { prisma } from '../../utils/prisma';

// 사이트 설정(key-value) — site_settings 테이블. 키가 없으면 기본값으로 머지해 항상 완전한 셰이프를 반환한다.
// value는 Json 컬럼. homeRecentGamesLimit는 정수·1~50 범위.

export interface SiteSettings {
  homeHeroBackground: string; // 'random' | 'bg_01'..'bg_05' | 'assets/image/site/...webp'
  homeRecentGamesLimit: number;
}

export const SETTING_DEFAULTS: SiteSettings = {
  homeHeroBackground: 'random',
  homeRecentGamesLimit: 6,
};

const RECENT_GAMES_MIN = 1;
const RECENT_GAMES_MAX = 50;

// homeRecentGamesLimit 정수화 + 1~50 클램프.
function clampRecentGamesLimit(v: unknown): number {
  const n = parseInt(String(v), 10);
  if (!Number.isFinite(n)) return SETTING_DEFAULTS.homeRecentGamesLimit;
  return Math.min(RECENT_GAMES_MAX, Math.max(RECENT_GAMES_MIN, n));
}

// 전 행을 읽어 기본값 위에 머지한다(키 없으면 기본값 유지).
export const getSettings = async (): Promise<SiteSettings> => {
  const rows = await prisma.siteSetting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const heroRaw = map.get('homeHeroBackground');
  const limitRaw = map.get('homeRecentGamesLimit');

  return {
    homeHeroBackground:
      typeof heroRaw === 'string' && heroRaw.length > 0
        ? heroRaw
        : SETTING_DEFAULTS.homeHeroBackground,
    homeRecentGamesLimit:
      limitRaw === undefined || limitRaw === null
        ? SETTING_DEFAULTS.homeRecentGamesLimit
        : clampRecentGamesLimit(limitRaw),
  };
};

// 제공된 키만 upsert(value는 Json). 갱신 후 머지된 전체 설정을 반환한다.
export const updateSettings = async (input: {
  homeHeroBackground?: unknown;
  homeRecentGamesLimit?: unknown;
}): Promise<SiteSettings> => {
  const upserts: Promise<unknown>[] = [];

  if (input.homeHeroBackground !== undefined) {
    const value = String(input.homeHeroBackground);
    upserts.push(
      prisma.siteSetting.upsert({
        where: { key: 'homeHeroBackground' },
        update: { value },
        create: { key: 'homeHeroBackground', value },
      }),
    );
  }

  if (input.homeRecentGamesLimit !== undefined) {
    const value = clampRecentGamesLimit(input.homeRecentGamesLimit);
    upserts.push(
      prisma.siteSetting.upsert({
        where: { key: 'homeRecentGamesLimit' },
        update: { value },
        create: { key: 'homeRecentGamesLimit', value },
      }),
    );
  }

  await Promise.all(upserts);
  return getSettings();
};
