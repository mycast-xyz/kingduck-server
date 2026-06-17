import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * async 라우트 핸들러 래퍼.
 *
 * Express 4는 async 핸들러에서 발생한 rejection을 자동으로 에러 미들웨어로 전달하지 않는다.
 * 핸들러마다 try/catch를 복붙하지 않으려면 이 래퍼로 감싸 reject를 `next(err)`로 흘려보낸다.
 * 종단 에러 미들웨어(src/index.ts)가 최종 응답을 책임진다.
 *
 * 사용: `router.get('/x', asyncHandler(controller.method))`
 */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
