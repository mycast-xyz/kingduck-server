import { prisma } from '../../utils/prisma';

export const getElementList = async () => {
  return await prisma.element.findMany({
    orderBy: { id: 'asc' },
    include: {
      game: true,
    },
  });
};
