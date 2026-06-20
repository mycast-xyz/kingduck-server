import { prisma } from '../../utils/prisma';

// B-H2: 공개 목록 무제한 로드 방지. FAQ 수는 수백 이하이므로 200으로 충분하나,
// 초과 시 조용히 잘림(silent truncation).
const MAX_LIST = 200;

// 공개 FAQ 목록 — published=true 만. 카테고리→표시순서로 정렬.
export const getFaqList = async () => {
  return prisma.faq.findMany({
    where: { published: true },
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
    take: MAX_LIST,
  });
};
