import { prisma } from '../../utils/prisma';

export const getCharacterList = async () => {
  return await prisma.character.findMany({
    orderBy: { id: 'asc' },
    include: {
      game: true,
      element: true,
    },
  });
};
