import { AsyncLocalStorage } from 'async_hooks';

/**
 * 크롤 진행 상황 + 중단 요청 인메모리 레지스트리.
 *
 * - 어드민 수동 실행(CrawlerController)은 API 서버와 **같은 프로세스**에서 돌아, 이 레지스트리로
 *   실시간 진행(처리/전체)을 공유하고 "정지" 요청을 전달할 수 있다.
 * - Node는 실행 중 작업을 강제 종료할 수 없으므로 **협조적 취소**: 스크래퍼 루프가 매 반복마다
 *   `shouldStop()`을 확인해 스스로 멈춘다(진행 중 1건은 마치고 중단).
 * - key = `${game}:${type}` (예: `nikke:detail`).
 *
 * 동시성: 여러 크롤이 동시에 돌 수 있으므로(전체 실행 등), 각 실행을 `runWith(key, fn)`로 감싸
 * **AsyncLocalStorage**에 key를 묶는다. 그러면 스크래퍼는 key 없이 `report()/shouldStop()`만 호출해도
 * 자신의 실행 컨텍스트에 정확히 귀속된다(키 섞임 없음).
 */
type Entry = {
  processed: number;
  total: number;
  current: string;
  startedAt: number;
  stop: boolean;
};

const runs = new Map<string, Entry>();
const als = new AsyncLocalStorage<string>();

export const crawlProgress = {
  /** 실행 등록(CrawlerController가 호출). */
  begin(key: string, total = 0): void {
    runs.set(key, {
      processed: 0,
      total,
      current: '',
      startedAt: Date.now(),
      stop: false,
    });
  },

  /** 실행을 key 컨텍스트로 감싼다 — 내부 스크래퍼의 report()/shouldStop()가 이 key에 귀속. */
  runWith<T>(key: string, fn: () => Promise<T>): Promise<T> {
    return als.run(key, fn);
  },

  /** 스크래퍼가 루프마다 호출(키 불필요) — 진행/전체/현재 항목 갱신. */
  report(processed: number, total?: number, current = ''): void {
    const key = als.getStore();
    if (!key) return;
    const e = runs.get(key);
    if (!e) return;
    e.processed = processed;
    if (typeof total === 'number') e.total = total;
    e.current = current;
  },

  /** 스크래퍼 루프가 확인(키 불필요) — true면 멈춘다. */
  shouldStop(): boolean {
    const key = als.getStore();
    if (!key) return false;
    return runs.get(key)?.stop ?? false;
  },

  /** "정지" 엔드포인트가 호출 — 중단 요청 set. 진행 중인 키가 없으면 false. */
  requestStop(key: string): boolean {
    const e = runs.get(key);
    if (!e) return false;
    e.stop = true;
    return true;
  },

  finish(key: string): void {
    runs.delete(key);
  },

  getAll(): Array<{ key: string } & Entry> {
    return [...runs.entries()].map(([key, e]) => ({ key, ...e }));
  },
};
