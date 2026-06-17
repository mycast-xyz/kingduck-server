/**
 * 페이지네이션 입력 클램프 (B-H3 / B2).
 *
 * `?limit=99999999`(전체 로드) 및 `?page=-5`(음수 skip → Prisma 500) 같은 비정상 입력을
 * 방지한다. 여러 컨트롤러에 복제돼 있던 것을 공용화.
 */
export const clampPage = (v: number): number => Math.max(v, 1);

export const clampLimit = (v: number, max = 100): number =>
	Math.min(Math.max(v, 1), max);

/**
 * req.query의 page/limit를 안전하게 파싱·클램프하고 skip까지 계산해 반환한다.
 */
export function parsePagination(
	query: { page?: unknown; limit?: unknown },
	defaults: { page?: number; limit?: number; maxLimit?: number } = {},
): { page: number; limit: number; skip: number } {
	const { page: dPage = 1, limit: dLimit = 10, maxLimit = 100 } = defaults;
	const page = clampPage(parseInt(String(query.page ?? '')) || dPage);
	const limit = clampLimit(
		parseInt(String(query.limit ?? '')) || dLimit,
		maxLimit,
	);
	return { page, limit, skip: (page - 1) * limit };
}
