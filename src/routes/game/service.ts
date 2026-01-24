import { prisma } from '../../utils/prisma';

export const getGameList = async () => {
  return await prisma.game.findMany({
    orderBy: { id: 'asc' },
  });
};

export const getGameBySlug = async (slug: string) => {
  return await prisma.game.findUnique({
    where: { slug },
    include: {
      elements: true,
    },
  });
};
