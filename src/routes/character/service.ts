import { prisma } from '../../utils/prisma';

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
  return results.map(withOriginalId);
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
  return result ? withOriginalId(result) : result;
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
  return result ? withOriginalId(result) : result;
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
