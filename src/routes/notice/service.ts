import { prisma } from '../../utils/prisma';

// B-H2: 공개 목록 무제한 로드 방지. 공지 수는 수백 이하이므로 200으로 충분하나,
// 초과 시 조용히 잘림(silent truncation).
const MAX_LIST = 200;

// 공개 공지 목록 — published=true 이고 게시 기간(startAt~endAt) 내인 것만.
// 고정(pinned) 먼저, 그 다음 최신순.
export const getNoticeList = async () => {
  const now = new Date();

  return prisma.notice.findMany({
    where: {
      published: true,
      AND: [
        { OR: [{ startAt: null }, { startAt: { lte: now } }] },
        { OR: [{ endAt: null }, { endAt: { gte: now } }] },
      ],
    },
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    take: MAX_LIST,
  });
};

// 공개 공지 상세 — published=true 인 것만 노출(초안/숨김은 404 처리용 null).
export const getNoticeById = async (id: number) => {
  return prisma.notice.findFirst({
    where: { id, published: true },
  });
};
