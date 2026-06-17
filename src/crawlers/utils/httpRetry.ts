import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import logger from '../../utils/logger';

/**
 * 크롤러 fetch용 재시도 래퍼 (redesign-plan A5 / B-H7 후속).
 *
 * 외부 소스가 일시적으로 불안정한 경우(네트워크 끊김, 타임아웃, 5xx, 간헐적 DNS)에만
 * **지수 백오프로 재시도**한다. 4xx(404 등)·파싱 오류 같은 결정적 실패는 **즉시 throw**(fail-fast).
 * 죽은 도메인(예: 과거 hakush)은 재시도 후 결국 실패하므로 결과는 같고 약간 느릴 뿐이다.
 */

const DEFAULT_RETRIES = 3; // 총 시도 횟수
const BASE_DELAY_MS = 500;

/** 전이성(재시도 가치 있는) 에러인지 판별. */
export function isRetryableError(err: unknown): boolean {
	if (!axios.isAxiosError(err)) return false;
	const e = err as AxiosError;
	// 응답이 없으면 네트워크/타임아웃/DNS 계열 → 재시도
	if (!e.response) {
		const code = e.code;
		// 명백히 결정적인 것은 제외할 수 있으나, 무응답은 대체로 전이성으로 본다.
		return (
			code === undefined ||
			[
				'ECONNABORTED',
				'ECONNRESET',
				'ETIMEDOUT',
				'ENOTFOUND',
				'EAI_AGAIN',
				'ECONNREFUSED',
				'ERR_NETWORK',
			].includes(code)
		);
	}
	// 5xx만 재시도, 4xx는 fail-fast
	const status = e.response.status;
	return status >= 500 && status < 600;
}

/**
 * axios.get + 전이성 에러 지수 백오프 재시도.
 * @param url 요청 URL
 * @param config axios 설정(timeout 등은 호출부에서 지정)
 * @param retries 총 시도 횟수(기본 3)
 */
export async function axiosGetWithRetry<T = unknown>(
	url: string,
	config?: AxiosRequestConfig,
	retries = DEFAULT_RETRIES,
): Promise<AxiosResponse<T>> {
	let lastErr: unknown;
	for (let attempt = 1; attempt <= retries; attempt++) {
		try {
			return await axios.get<T>(url, config);
		} catch (err) {
			lastErr = err;
			if (attempt === retries || !isRetryableError(err)) throw err;
			const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
			const reason =
				(axios.isAxiosError(err) && (err.code || err.response?.status)) ||
				'unknown';
			logger.warn(
				`HTTP retry ${attempt}/${retries - 1} for ${url} in ${delay}ms (${reason})`,
			);
			await new Promise((r) => setTimeout(r, delay));
		}
	}
	throw lastErr;
}
