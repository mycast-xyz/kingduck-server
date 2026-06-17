import axios from 'axios';
import logger from '../../utils/logger';

/**
 * starrailstation.com 공용 유틸.
 *
 * SRS의 각 페이지 HTML에는 `window.PAGE_CONFIG = {...}` 형태로 데이터 JSON이 임베드되어 있다.
 * 이 모듈은 그 JSON을 추출/파싱한다. (원래 RelicScraper에 있던 로직을 공용화 — character /
 * lightcone / relic 스크래퍼가 공유.)
 *
 * 설계 원칙(B-H6 연계): 마커 미발견·파싱 실패 시 **빈 객체를 조용히 반환하지 않고 throw** 한다.
 * silent 0건으로 SUCCESS 위장하는 것을 막기 위함. 호출자가 부분 실패를 집계/표면화한다.
 */

export const SRS_BASE = 'https://starrailstation.com';
export const SRS_CDN = 'https://cdn.starrailstation.com/assets/';

const REQUEST_HEADERS = {
	'User-Agent':
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
	Accept:
		'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
	'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
};

/**
 * SRS CDN 이미지 절대 URL을 만든다. iconPath가 비어 있으면 null.
 */
export function srsAssetUrl(iconPath?: string | null): string | null {
	if (!iconPath) return null;
	return `${SRS_CDN}${iconPath}.webp`;
}

/**
 * SRS는 속성/운명을 한국어 이름으로 준다. 그러나 프론트 필터·DB elements는 **영문 키**로
 * 매칭하므로(HonkaiStarRailInit.type / 기존 데이터 기준) 역매핑이 필요하다.
 * 매핑이 없으면(신규 속성 등) 원문을 그대로 둔다.
 */
const DAMAGE_TYPE_KO_TO_EN: Record<string, string> = {
	얼음: 'Ice',
	바람: 'Wind',
	화염: 'Fire',
	허수: 'Imaginary',
	번개: 'Thunder',
	양자: 'Quantum',
	물리: 'Physical'
};
const PATH_KO_TO_EN: Record<string, string> = {
	보존: 'Knight',
	수렵: 'Rogue',
	지식: 'Mage',
	공허: 'Warlock',
	파멸: 'Warrior',
	화합: 'Shaman',
	풍요: 'Priest',
	기억: 'Memory',
	환락: 'Elation'
};

/** 속성(damageType) 한국어 → 영문 키 */
export function mapDamageTypeToEn(ko?: string | null): string | undefined {
	if (!ko) return undefined;
	return DAMAGE_TYPE_KO_TO_EN[ko] || ko;
}

/** 운명의 길(path/baseType) 한국어 → 영문 키 */
export function mapPathToEn(ko?: string | null): string | undefined {
	if (!ko) return undefined;
	return PATH_KO_TO_EN[ko] || ko;
}

/**
 * 주어진 SRS 페이지에서 `window.PAGE_CONFIG` JSON을 추출해 반환한다.
 *
 * @param url 전체 URL (예: https://starrailstation.com/kr/characters)
 * @throws 마커 미발견 / 여는 중괄호 없음 / 짝 중괄호 없음 / JSON 파싱 실패 시
 */
export async function fetchPageConfig(url: string): Promise<any> {
	const { data: html } = await axios.get<string>(url, {
		timeout: 15000,
		headers: REQUEST_HEADERS,
		responseType: 'text',
		// HTML이 application/json이 아니므로 axios가 자동 파싱하지 않도록 transform 무력화
		transformResponse: (d) => d
	});

	if (typeof html !== 'string') {
		throw new Error(`PAGE_CONFIG fetch returned non-string body for ${url}`);
	}

	const markerMatch = html.match(/window\.PAGE_CONFIG\s*=\s*\{/);
	if (!markerMatch || markerMatch.index === undefined) {
		throw new Error(
			`PAGE_CONFIG marker not found at ${url} (HTML head: ${html.substring(0, 200)})`
		);
	}

	const jsonStartIdx = html.indexOf('{', markerMatch.index);
	if (jsonStartIdx === -1) {
		throw new Error(`PAGE_CONFIG opening brace not found at ${url}`);
	}

	// 중괄호 깊이를 세어 짝이 맞는 닫는 괄호 위치를 찾는다.
	let configString = '';
	let depth = 0;
	for (let i = jsonStartIdx; i < html.length; i++) {
		const char = html[i];
		if (char === '{') depth++;
		else if (char === '}') depth--;
		if (depth === 0) {
			configString = html.substring(jsonStartIdx, i + 1);
			break;
		}
	}

	if (!configString) {
		throw new Error(`PAGE_CONFIG matching closing brace not found at ${url}`);
	}

	try {
		return JSON.parse(configString);
	} catch (parseErr: any) {
		throw new Error(
			`PAGE_CONFIG JSON parse failed at ${url}: ${parseErr.message} ` +
				`(start: ${configString.substring(0, 80)} ... end: ${configString.substring(
					configString.length - 80
				)})`
		);
	}
}
