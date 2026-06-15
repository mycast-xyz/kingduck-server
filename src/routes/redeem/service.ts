import { prisma } from '../../utils/prisma';

// B-H2: 공개 목록 무제한 로드 방지. 리딤 그룹 수는 수백 이하이므로
// 1000으로 충분하나, 초과 시 조용히 잘림(silent truncation).
const MAX_LIST = 1000;

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
    take: MAX_LIST,
  });

  return redeemGroups;
};
