import { prisma } from '../../utils/prisma';

export const getRedeemCodes = async (gameSlug: string) => {
  const game = await prisma.game.findUnique({
    where: { slug: gameSlug },
  });

  if (!game) {
    return null;
  }

  const redeemGroups = await prisma.redeemGroup.findMany({
    where: { gameId: game.id },
    include: {
      codes: true,
    },
    orderBy: {
      id: 'desc', // Valid assumption: newer groups have higher IDs usually
    },
  });

  return redeemGroups;
};
