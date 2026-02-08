import { prisma } from '../../utils/prisma';

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
  });

  return events;
};

export const getEventById = async (id: number) => {
  const event = await prisma.calendarEvent.findUnique({
    where: { id },
  });

  return event;
};
