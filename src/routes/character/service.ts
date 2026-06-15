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
    include: {
      game: true,
      element: true,
      path: true,
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
    where: {
      gameId,
      metadata: {
        path: ['originalId'],
        equals: originalId,
      },
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
