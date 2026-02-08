import { prisma } from '../../utils/prisma';

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

  return await prisma.item.findMany({
    where,
    orderBy: { id: 'asc' },
    include: {
      game: true,
    },
  });
};

export const getItemByName = async (gameSlug: string, name: string) => {
  return await prisma.item.findFirst({
    where: {
      game: { slug: gameSlug },
      name: { equals: name, mode: 'insensitive' },
    },
    include: {
      game: true,
    },
  });
};
