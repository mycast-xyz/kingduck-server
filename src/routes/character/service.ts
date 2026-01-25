import { prisma } from '../../utils/prisma';

interface CharacterFilter {
  name?: string;
  elementId?: number;
  rarity?: number;
  pathId?: number;
}

export const getCharacterList = async (
  gameSlug: string,
  filter?: CharacterFilter,
) => {
  const { name, elementId, rarity, pathId } = filter || {};

  return await prisma.character.findMany({
    where: {
      game: { slug: gameSlug },
      ...(name && { name: { contains: name, mode: 'insensitive' } }),
      ...(elementId && { elementId }),
      ...(rarity && { rarity }),
      ...(pathId && { pathId }),
    },
    orderBy: { id: 'asc' },
    include: {
      game: true,
      element: true,
      path: true,
    },
  });
};

export const getCharacter = async (gameSlug: string, id: number) => {
  return await prisma.character.findFirst({
    where: {
      id,
      game: { slug: gameSlug },
    },
    include: {
      game: true,
      element: true,
      path: true,
      videos: true,
    },
  });
};

export const getElementList = async (gameSlug: string) => {
  return await prisma.element.findMany({
    where: {
      game: { slug: gameSlug },
    },
    orderBy: { id: 'asc' },
  });
};
