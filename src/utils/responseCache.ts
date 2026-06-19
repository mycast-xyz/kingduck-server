import { Request, Response, NextFunction } from 'express';

/**
 * 읽기 GET 응답 인메모리 캐시 + CDN 친화 Cache-Control 헤더.
 *
 * 목적: 캐릭터/아이템/게임 등 읽기 데이터는 **크롤 때만 바뀌고 평소 정적**인데도 매 요청마다
 * 느린 홈서버 DB를 친다(리스트 TTFB ~1.5s). → 프로세스 인메모리로 응답을 캐시해 DB 부하를 줄이고,
 * `Cache-Control: s-maxage`로 Cloudflare(무료) 엣지 캐시까지 유도한다.
 *
 * **메모리 안전(서버 RAM 4GB 고려):**
 *  - 응답을 **직렬화 문자열**로 저장(객체 그래프보다 메모리 작고, HIT 시 재직렬화 없이 그대로 전송).
 *  - **총 바이트 예산**(기본 24MB)으로 상한 — 초과 시 오래된 항목부터 제거(대략 LRU).
 *  - 단일 거대 응답(>2MB)은 캐시 제외(메모리 스파이크 방지).
 *  - 크롤(DataSyncService sync*) 시 `clearAll()`로 즉시 비움(크롤은 메모리 무거우므로 캐시도 반납).
 *  - TTL 자연 만료(이중 안전). 어드민 경로(`/admin`)는 캐시하지 않음(항상 최신).
 */
type Entry = { body: string; bytes: number; exp: number };
const store = new Map<string, Entry>(); // 삽입 순서 유지 → 앞쪽이 오래된 것
let totalBytes = 0;

const MAX_BYTES = 24 * 1024 * 1024; // 총 예산 24MB (4GB 서버에서 무시 가능한 수준)
const MAX_SINGLE_BYTES = 2 * 1024 * 1024; // 단일 응답 2MB 초과는 캐시 안 함

function dropOldestUntilFits(incoming: number): void {
  while (totalBytes + incoming > MAX_BYTES && store.size > 0) {
    const oldest = store.keys().next().value as string;
    const e = store.get(oldest);
    if (e) totalBytes -= e.bytes;
    store.delete(oldest);
  }
}

export const responseCache = {
  /** 크롤 등 데이터 변경 시 전체 무효화 + 메모리 반납. 크롤은 드물어 전체 비움으로 충분. */
  clearAll(): void {
    store.clear();
    totalBytes = 0;
  },
  stats(): { entries: number; bytes: number } {
    return { entries: store.size, bytes: totalBytes };
  },
};

/**
 * GET 읽기 라우터에 붙이는 캐시 미들웨어.
 * @param ttlSec 서버 캐시 + CDN s-maxage(초)
 */
export function cacheRead(ttlSec: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method !== 'GET' || req.originalUrl.includes('/admin')) {
      next();
      return;
    }

    const key = req.originalUrl;
    res.set(
      'Cache-Control',
      `public, max-age=60, s-maxage=${ttlSec}, stale-while-revalidate=86400`,
    );

    const now = Date.now();
    const hit = store.get(key);
    if (hit && hit.exp > now) {
      // HIT: 저장된 직렬화 문자열을 그대로 전송(재직렬화 없음).
      res.set('X-Cache', 'HIT');
      res.type('application/json').status(200).send(hit.body);
      return;
    }
    if (hit) {
      totalBytes -= hit.bytes;
      store.delete(key);
    }

    // MISS: 성공(200) 응답을 한 번 직렬화해 캐시에 저장하고 그 문자열을 전송.
    const origJson = res.json.bind(res);
    res.json = (body: unknown): Response => {
      const str = JSON.stringify(body);
      const bytes = Buffer.byteLength(str, 'utf8');
      if (res.statusCode === 200 && bytes <= MAX_SINGLE_BYTES) {
        dropOldestUntilFits(bytes);
        store.set(key, { body: str, bytes, exp: Date.now() + ttlSec * 1000 });
        totalBytes += bytes;
      }
      res.set('X-Cache', 'MISS');
      res.type('application/json').send(str);
      return res;
    };
    next();
  };
}
