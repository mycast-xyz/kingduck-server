import { prisma } from '../../utils/prisma';

/**
 * 캐릭터 metadata.skills 에서 스킬 목록을 조회한다.
 * Skill 전용 모델이 없으므로 Character.metadata JSON 을 활용한다.
 */
export const getSkillList = async (characterId: number) => {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: {
      id: true,
      name: true,
      metadata: true,
    },
  });

  if (!character) {
    return null;
  }

  const meta = character.metadata as Record<string, any> | null;
  const skills = meta?.skills ?? [];

  return {
    characterId: character.id,
    characterName: character.name,
    skills,
  };
};
