import { prisma } from '../../utils/prisma';

// B-H2: 공개 목록 무제한 로드 방지. 게임 1종당 아이템 수는 수백 이하이므로
// 1000으로 충분하나, 초과 시 조용히 잘림(silent truncation) — gameId 필터를 사용할 것.
const MAX_LIST = 1000;

const withOriginalId = <T extends { metadata?: unknown }>(i: T) => ({
  ...i,
  originalId: (i.metadata as any)?.originalId as string | undefined,
});

export const getItemList = async (originalId?: string, gameId?: number) => {
  const where: any = {};

  if (gameId) {
    where.gameId = gameId;
  }

  if (originalId) {
    // Try to match strict string or number inside metadata.originalId
    // Since we don't know if it's stored as number or string in JSON, we can try robust check or just strict equals if consistent.
    // Based on previous scrapes, it's often a number. Prisma JSON filter 'equals' usually respects type.
    // However, input query is string. We might try to cast to number.
    const numId = Number(originalId);
    if (!isNaN(numId)) {
      where.OR = [
        {
          metadata: {
            path: ['originalId'],
            equals: numId,
          },
        },
        {
          metadata: {
            path: ['originalId'],
            equals: String(numId),
          },
        },
      ];
    } else {
      where.metadata = {
        path: ['originalId'],
        equals: originalId,
      };
    }
  }

  const results = await prisma.item.findMany({
    where,
    orderBy: { id: 'asc' },
    take: MAX_LIST,
    include: {
      game: true,
    },
  });
  return results.map(withOriginalId);
};

export const getItemByName = async (gameSlug: string, name: string) => {
  const result = await prisma.item.findFirst({
    where: {
      game: { slug: gameSlug },
      name: { equals: name, mode: 'insensitive' },
    },
    include: {
      game: true,
    },
  });
  return result ? withOriginalId(result) : result;
};
