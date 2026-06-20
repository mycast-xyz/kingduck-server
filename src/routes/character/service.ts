import { prisma } from '../../utils/prisma';
import { Prisma } from '@prisma/client';

// B-H2: 공개 목록 무제한 로드 방지. 게임 1종당 캐릭터/속성 수는 수백 이하이므로
// 1000으로 충분하나, 초과 시 조용히 잘림(silent truncation) — 필터를 사용할 것.
const MAX_LIST = 1000;

interface CharacterFilter {
  name?: string;
  elementId?: number;
  rarity?: number;
  pathId?: number;
}

const withOriginalId = <T extends { originalId?: string | null; metadata?: unknown }>(c: T) => ({
  ...c,
  originalId: (c.originalId ?? (c.metadata as any)?.originalId) as string | undefined,
});

// 팀빌드 추천 override: 어드민이 등록한 published TeamRecommendation이 1건 이상이면
// 크롤 데이터(metadata.teams)를 그 목록으로 교체한다. 0건이면 기존 metadata.teams 그대로 유지.
// 앵커 캐릭터 id로 조회, sortOrder asc. metadata가 null/비객체면 빈 객체로 안전 처리.
const applyTeamOverride = async <T extends { id: number; metadata?: unknown }>(
  character: T,
): Promise<T> => {
  const records = await prisma.teamRecommendation.findMany({
    where: { characterId: character.id, published: true },
    orderBy: { sortOrder: 'asc' },
  });
  if (records.length === 0) return character;

  const base =
    character.metadata && typeof character.metadata === 'object'
      ? (character.metadata as Record<string, unknown>)
      : {};
  return {
    ...character,
    metadata: {
      ...base,
      teams: records.map((t) => ({
        name: t.name,
        slots: t.slots,
        ...(t.tags ? { tags: t.tags } : {}),
      })),
    },
  } as T;
};

export const getCharacterList = async (
  gameSlug: string,
  filter?: CharacterFilter,
) => {
  const { name, elementId, rarity, pathId } = filter || {};

  const results = await prisma.character.findMany({
    where: {
      game: { slug: gameSlug },
      ...(name && { name: { contains: name, mode: 'insensitive' } }),
      ...(elementId && { elementId }),
      ...(rarity && { rarity }),
      ...(pathId && { pathId }),
    },
    orderBy: { id: 'asc' },
    take: MAX_LIST,
    // 리스트 카드는 이름/아이콘/등급/속성만 쓴다. 무거운 metadata(캐릭당 ~100KB)·description은
    // 목록에서 제외하고(상세 getCharacter에서만 반환) 카드 필드 + 관계만 select.
    // (명조 list 7.7MB → ~50KB) — 상세 진입은 단건이라 영향 없음.
    select: {
      id: true,
      gameId: true,
      elementId: true,
      pathId: true,
      name: true,
      rarity: true,
      weaponType: true,
      role: true,
      originalId: true,
      imageUrl: true,
      createdAt: true,
      updatedAt: true,
      element: true,
      path: true,
      game: true,
    },
  });

  // metadata에서 클라이언트 필터용 필드만 JSON path 추출 (full metadata 로드 금지 — 성능).
  // 니케(class/corp/burst) + 블루아카이브(school). 해당 게임 외엔 값이 없어 null → 영향 없음.
  // (역할은 Character.role 컬럼에 저장되어 위 select가 이미 반환하므로 여기서 추출하지 않는다.)
  type MetaRow = {
    id: number | bigint;
    class: string | null;
    corp: string | null;
    burst: string | null;
    school: string | null;
  };
  const metaRows = await prisma.$queryRaw<MetaRow[]>(
    Prisma.sql`
      SELECT id,
        metadata->>'class'  AS "class",
        metadata->>'corp'   AS "corp",
        metadata->>'burst'  AS "burst",
        metadata->>'school' AS "school"
      FROM characters
      WHERE game_id = (SELECT id FROM games WHERE slug = ${gameSlug})
      ORDER BY id ASC
      LIMIT ${MAX_LIST}
    `
  );
  const metaMap = new Map(metaRows.map((m) => [Number(m.id), m]));

  return results.map((r) => {
    const meta = metaMap.get(r.id);
    return {
      ...withOriginalId(r),
      class: meta?.class ?? null,
      corp: meta?.corp ?? null,
      burst: meta?.burst ?? null,
      school: meta?.school ?? null,
    };
  });
};

export const getCharacter = async (gameSlug: string, id: number) => {
  const result = await prisma.character.findFirst({
    where: {
      id,
      game: { slug: gameSlug },
    },
    include: {
      game: true,
      element: true,
      path: true,
      videos: true,
    },
  });
  return result ? applyTeamOverride(withOriginalId(result)) : result;
};

export const getCharacterByOriginalId = async (
  gameId: number,
  originalId: string,
) => {
  const result = await prisma.character.findFirst({
    // 인덱스 컬럼 기반(B-H4b). 기존 JSON-path 스캔 제거.
    where: { gameId, originalId },
    include: {
      game: true,
      element: true,
      path: true,
      videos: true,
    },
  });
  return result ? withOriginalId(result) : result;
};

export const getElementList = async (gameSlug: string) => {
  return await prisma.element.findMany({
    where: {
      game: { slug: gameSlug },
    },
    orderBy: { id: 'asc' },
    take: MAX_LIST,
  });
};

export const getCharacterAdmin = async (id: number) => {
  const result = await prisma.character.findUnique({
    where: { id },
    include: {
      game: true,
      element: true,
      path: true,
      videos: true,
    },
  });
  return result ? applyTeamOverride(withOriginalId(result)) : result;
};

export const getCharacterByName = async (gameSlug: string, name: string) => {
  const result = await prisma.character.findFirst({
    where: {
      game: { slug: gameSlug },
      name: { equals: name, mode: 'insensitive' },
    },
    include: {
      game: true,
      element: true,
      path: true,
      videos: true,
    },
  });
  return result ? withOriginalId(result) : result;
};
