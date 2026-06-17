import { Response } from 'express';

/**
 * 표준 API 응답 봉투 빌더 (redesign-plan B-M1).
 *
 * admin 계열 응답은 `{ resultCode, resultMsg, data }` 형태로 통일한다(과거 일부가 `items`를
 * 쓰던 불일치 제거). 신규/리팩터 핸들러는 이 빌더를 사용해 형태를 일관되게 유지한다.
 * (공개 계열의 raw 응답 → 봉투 전환은 프론트 파서와 동시 작업이 필요해 별도 단계로 둔다.)
 */
export interface ApiEnvelope<T = unknown> {
	resultCode: number;
	resultMsg: string;
	data: T;
}

/** 성공 응답(200). data에 페이로드. */
export function sendOk<T>(
	res: Response,
	data: T,
	resultMsg = '성공',
): Response {
	return res.status(200).json({ resultCode: 200, resultMsg, data });
}

/** 실패 응답. status와 resultCode를 일치시킨다. */
export function sendError(
	res: Response,
	status: number,
	resultMsg: string,
): Response {
	return res.status(status).json({ resultCode: status, resultMsg, data: null });
}
