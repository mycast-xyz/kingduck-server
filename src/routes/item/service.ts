import { prisma } from '../../utils/prisma';

export const getItemList = async () => {
  return await prisma.item.findMany({
    orderBy: { id: 'asc' },
    include: {
      game: true,
    },
  });
};
