import { Request, Response } from 'express';
import { prisma } from '../../utils/prisma';
import { CrawlerStatus } from '@prisma/client';
import { CRAWLER_TASKS } from '../../crawlers/scheduler';
import { DataSyncService } from '../../crawlers/services/DataSyncService';
import { Browser } from '../../crawlers/core/Browser';
import logger from '../../utils/logger';

export class CrawlerController {
  // 게임 이름 매핑 (DB에서 가져오거나 상수로 정의)
  private readonly GAME_NAMES: Record<string, string> = {
    starrail: '붕괴: 스타레일',
    reverse1999: '리버스: 1999',
    wutheringwaves: '명조: 워더링 웨이브',
    endfield: '명일방주: 엔드필드',
  };

  /**
   * 전체 크롤러 상태 조회 (지원 목록 + 최근 실행 기록)
   * GET /api/v0/admin/crawler/status
   */
  getStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      // 1. CRAWLER_TASKS를 기반으로 게임별 크롤러 목록 구성
      const gamesMap = new Map<string, Set<string>>();
      // 동결 상태 조회용: `${game}:${type}` → { enabled, reason }
      const disabledMap = new Map<
        string,
        { enabled: boolean; reason?: string }
      >();

      CRAWLER_TASKS.forEach((task) => {
        if (!gamesMap.has(task.game)) {
          gamesMap.set(task.game, new Set());
        }
        gamesMap.get(task.game)?.add(task.type);
        if (task.enabled === false) {
          disabledMap.set(`${task.game}:${task.type}`, {
            enabled: false,
            reason: task.disabledReason,
          });
        }
      });

      // 2. DB에서 게임 정보 조회 (ID 매핑용)
      const slugs = Array.from(gamesMap.keys());
      const games = await prisma.game.findMany({
        select: { id: true, slug: true, name: true },
        where: {
          slug: { in: slugs },
        },
      });

      const gameIdMap = new Map<string, number>();
      games.forEach((g) => gameIdMap.set(g.slug, g.id));

      // N+1 방지(B-H5): (game,type)별 findFirst 대신 대상 게임 로그를 한 번에 조회하고
      // startTime 내림차순에서 (gameId,type)별 첫(=최신) 항목만 Map에 남긴다.
      const gameIds = Array.from(gameIdMap.values());
      const allLogs = gameIds.length
        ? await prisma.crawlerLog.findMany({
            where: { gameId: { in: gameIds } },
            orderBy: { startTime: 'desc' },
            select: {
              gameId: true,
              crawlerType: true,
              startTime: true,
              status: true,
              itemsFound: true,
              errorMsg: true,
            },
          })
        : [];
      const latestLogMap = new Map<string, (typeof allLogs)[number]>();
      for (const log of allLogs) {
        const key = `${log.gameId}:${log.crawlerType}`;
        if (!latestLogMap.has(key)) latestLogMap.set(key, log);
      }

      // 3. 상태 조회 및 데이터 병합 (위 Map 기반, per-type 쿼리 없음)
      const statusList = slugs.map((gameSlug) => {
          const gameId = gameIdMap.get(gameSlug);
          const crawlerTypes = Array.from(gamesMap.get(gameSlug) || []);
          const gameName =
            this.GAME_NAMES[gameSlug] ||
            games.find((g) => g.slug === gameSlug)?.name ||
            gameSlug;

          // 게임 ID가 없는 경우 (DB에 미등록)
          if (!gameId) {
            return {
              gameSlug,
              gameName,
              crawlers: crawlerTypes.map((type) => {
                const disabled = disabledMap.get(`${gameSlug}:${type}`);
                return {
                  type,
                  lastRun: null,
                  status: null,
                  itemsFound: 0,
                  errorMsg: 'Game not found in DB',
                  enabled: disabled ? false : true,
                  disabledReason: disabled?.reason || null,
                };
              }),
            };
          }

          const crawlers = crawlerTypes.map((type) => {
            const latest = latestLogMap.get(`${gameId}:${type}`);
            const disabled = disabledMap.get(`${gameSlug}:${type}`);
            return {
              type,
              lastRun: latest?.startTime || null,
              status: latest?.status || null, // RUNNING, SUCCESS, FAILED
              itemsFound: latest?.itemsFound || 0,
              errorMsg: latest?.errorMsg || null,
              enabled: disabled ? false : true,
              disabledReason: disabled?.reason || null,
            };
          });

          return {
            gameId,
            gameSlug,
            gameName,
            crawlers,
          };
        });

      res.status(200).json({
        resultCode: 200,
        resultMsg: '성공',
        data: statusList,
      });
    } catch (error) {
      logger.error('getStatus Error:', error);
      res.status(500).json({
        resultCode: 500,
        resultMsg: '서버 오류가 발생했습니다.',
      });
    }
  };

  /**
   * 크롤러 실행 로그 조회
   * GET /api/v0/admin/crawler/logs
   */
  getLogs = async (req: Request, res: Response): Promise<void> => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const gameId = req.query.gameId
        ? parseInt(req.query.gameId as string)
        : undefined;
      const crawlerType = req.query.crawlerType as string;
      const status = req.query.status as CrawlerStatus;

      const skip = (page - 1) * limit;

      const where: any = {};
      if (gameId) where.gameId = gameId;
      if (crawlerType) where.crawlerType = crawlerType;
      if (status) where.status = status;

      const [total, items] = await Promise.all([
        prisma.crawlerLog.count({ where }),
        prisma.crawlerLog.findMany({
          where,
          skip,
          take: limit,
          orderBy: { startTime: 'desc' },
          include: {
            game: { select: { id: true, name: true, slug: true } },
          },
        }),
      ]);

      res.status(200).json({
        resultCode: 200,
        resultMsg: '성공',
        data: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          items,
        },
      });
    } catch (error) {
      logger.error('getLogs Error:', error);
      res.status(500).json({
        resultCode: 500,
        resultMsg: '서버 오류가 발생했습니다.',
      });
    }
  };

  /**
   * 크롤러 수동 실행
   * POST /api/v0/admin/crawler/run
   */
  runCrawler = async (req: Request, res: Response): Promise<void> => {
    try {
      const { gameSlug, crawlerType } = req.body;

      if (!gameSlug || !crawlerType) {
        res.status(400).json({
          resultCode: 400,
          resultMsg: 'gameSlug와 crawlerType이 필요합니다.',
        });
        return;
      }

      // 1. Static Definition에서 해당 태스크 찾기
      const task = CRAWLER_TASKS.find(
        (t) => t.game === gameSlug && t.type === crawlerType,
      );

      if (!task) {
        res.status(400).json({
          resultCode: 400,
          resultMsg: '지원하지 않는 크롤러입니다.',
        });
        return;
      }

      // 동결(freeze)된 크롤러는 수동 실행도 거부 — 죽은 소스로 인한 에러 방지.
      if (task.enabled === false) {
        res.status(423).json({
          resultCode: 423,
          resultMsg:
            task.disabledReason || '현재 비활성화된 크롤러입니다. (동결)',
        });
        return;
      }

      // 2. 게임 DB 확인
      const game = await prisma.game.findUnique({
        where: { slug: gameSlug },
      });

      if (!game) {
        res.status(404).json({
          resultCode: 404,
          resultMsg: '게임을 찾을 수 없습니다.',
        });
        return;
      }

      // 3. 중복 실행 방지 — 이미 RUNNING 상태인 크롤러 거부
      const runningLog = await prisma.crawlerLog.findFirst({
        where: {
          gameId: game.id,
          crawlerType,
          status: CrawlerStatus.RUNNING,
        },
      });

      if (runningLog) {
        res.status(409).json({
          resultCode: 409,
          resultMsg: '이미 실행 중입니다.',
        });
        return;
      }

      // 4. 실행 (비동기)
      // Browser Init은 싱글톤이라 괜찮음
      const browser = Browser.getInstance();
      await browser.init();

      const syncService = new DataSyncService();

      // 로그 생성을 위해 crawlerLog 기록 (RUNNING 상태)
      const crawlerLog = await prisma.crawlerLog.create({
        data: {
          gameId: game.id,
          crawlerType,
          status: CrawlerStatus.RUNNING,
          startTime: new Date(),
        },
      });

      // 백그라운드 실행
      task
        .run(syncService)
        .then(async (itemsFound) => {
          logger.info(`Manual task [${gameSlug}] ${crawlerType} completed.`);
          // 완료 로그 업데이트
          await prisma.crawlerLog.update({
            where: { id: crawlerLog.id },
            data: {
              status: CrawlerStatus.SUCCESS,
              endTime: new Date(),
              itemsFound: itemsFound || 0,
            },
          });
        })
        .catch(async (error) => {
          logger.error(
            `Manual task [${gameSlug}] ${crawlerType} failed:`,
            error,
          );
          // 실패 로그 업데이트
          await prisma.crawlerLog.update({
            where: { id: crawlerLog.id },
            data: {
              status: CrawlerStatus.FAILED,
              endTime: new Date(),
              errorMsg: error instanceof Error ? error.message : String(error),
            },
          });
        });

      // 5. 즉시 응답 (방금 생성한 로그 정보를 반환)
      res.status(200).json({
        resultCode: 200,
        resultMsg: '크롤러 실행이 시작되었습니다.',
        data: {
          logId: crawlerLog.id,
          status: CrawlerStatus.RUNNING,
        },
      });
    } catch (error) {
      logger.error('runCrawler Error:', error);
      res.status(500).json({
        resultCode: 500,
        resultMsg: '서버 오류가 발생했습니다.',
      });
    }
  };

  /**
   * 크롤러 실행 상태 확인
   * GET /api/v0/admin/crawler/run/:logId
   */
  getRunStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const logId = parseInt(req.params.logId as string);

      if (!logId) {
        res.status(400).json({
          resultCode: 400,
          resultMsg: 'logId가 필요합니다.',
        });
        return;
      }

      const log = await prisma.crawlerLog.findUnique({
        where: { id: logId },
        include: {
          game: { select: { id: true, name: true, slug: true } },
        },
      });

      if (!log) {
        res.status(404).json({
          resultCode: 404,
          resultMsg: '크롤러 로그를 찾을 수 없습니다.',
        });
        return;
      }

      res.status(200).json({
        resultCode: 200,
        resultMsg: '성공',
        data: log,
      });
    } catch (error) {
      logger.error('getRunStatus Error:', error);
      res.status(500).json({
        resultCode: 500,
        resultMsg: '서버 오류가 발생했습니다.',
      });
    }
  };
}

export default new CrawlerController();
