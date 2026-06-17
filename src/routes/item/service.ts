import { prisma } from '../../utils/prisma';

// B-H2: 공개 목록 무제한 로드 방지. 게임 1종당 아이템 수는 수백 이하이므로
// 1000으로 충분하나, 초과 시 조용히 잘림(silent truncation) — gameId 필터를 사용할 것.
const MAX_LIST = 1000;

const withOriginalId = <
  T extends { originalId?: string | null; metadata?: unknown },
>(
  i: T,
) => ({
  ...i,
  // 컬럼 우선, 과거 데이터 호환용 metadata 폴백 (B-H4b)
  originalId: (i.originalId ?? (i.metadata as any)?.originalId) as
    | string
    | undefined,
});

export const getItemList = async (originalId?: string, gameId?: number) => {
  const where: any = {};

  if (gameId) {
    where.gameId = gameId;
  }

  if (originalId) {
    // 인덱스 컬럼 기반(B-H4b). 컬럼은 항상 문자열로 저장됨(과거 metadata의 number/string
    // 혼재 처리 불필요). type을 함께 넘기지 않으므로 동일 id의 다른 타입은 모두 반환됨(기존과 동일).
    where.originalId = originalId;
  }

  const results = await prisma.item.findMany({
    where,
    orderBy: { id: 'asc' },
    take: MAX_LIST,
    include: {
      game: true,
    },
  });
  return results.map(withOriginalId);
};

export const getItemByName = async (gameSlug: string, name: string) => {
  const result = await prisma.item.findFirst({
    where: {
      game: { slug: gameSlug },
      name: { equals: name, mode: 'insensitive' },
    },
    include: {
      game: true,
    },
  });
  return result ? withOriginalId(result) : result;
};
