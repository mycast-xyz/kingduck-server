import { prisma } from '../../utils/prisma';

// B-H2: 공개 목록 무제한 로드 방지. 게임 1종 이벤트 수는 수백 이하이므로
// 1000으로 충분하나, 초과 시 조용히 잘림(silent truncation).
const MAX_LIST = 1000;

export const getEvents = async (gameSlug: string) => {
  const game = await prisma.game.findUnique({
    where: { slug: gameSlug },
  });

  if (!game) {
    return null;
  }

  const events = await prisma.calendarEvent.findMany({
    where: { gameId: game.id },
    orderBy: {
      startTime: 'asc',
    },
    take: MAX_LIST,
  });

  return events;
};

export const getEventById = async (id: number) => {
  const event = await prisma.calendarEvent.findUnique({
    where: { id },
  });

  return event;
};
