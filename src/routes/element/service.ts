import { prisma } from '../../utils/prisma';

// B-H2: 공개 목록 무제한 로드 방지. 전체 게임 속성 합산도 수백 이하이므로
// 1000으로 충분하나, 초과 시 조용히 잘림(silent truncation).
const MAX_LIST = 1000;

export const getElementList = async () => {
  return await prisma.element.findMany({
    orderBy: { id: 'asc' },
    take: MAX_LIST,
    include: {
      game: true,
    },
  });
};
