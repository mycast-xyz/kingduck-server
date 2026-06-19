import 'dotenv/config'; // .env 로드(JWT_SECRET_KEY 등) — config 임포트보다 먼저 실행되어야 함
import express, { type ErrorRequestHandler } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';

// DB ORM 참조
import { config } from './config/config';
import routers from './routes/';
import { prisma } from './utils/prisma';
import { CrawlerStatus } from '@prisma/client';
import path from 'path';
import logger from './utils/logger';

// 크롤은 서버와 별도 프로세스(`pnpm run crawl`)로 돌기 때문에, 프로세스가 크롤 도중 죽으면
// crawler_logs에 RUNNING 상태가 영구히 남고, 중복실행 가드가 그 작업의 재실행을 영영 막는다(B-L3).
// 기동 시 임계 시간(어떤 정상 크롤보다 충분히 긴 값)을 초과한 RUNNING 로그만 FAILED로 정리한다.
// (진행 중인 별도 크롤 프로세스를 오인 종료하지 않도록 임계값을 넉넉히 둔다.)
const STALE_RUNNING_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2시간

async function sweepStaleCrawlerLogs(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_RUNNING_THRESHOLD_MS);
  const { count } = await prisma.crawlerLog.updateMany({
    where: { status: CrawlerStatus.RUNNING, startTime: { lt: cutoff } },
    data: {
      status: CrawlerStatus.FAILED,
      endTime: new Date(),
      errorMsg:
        'Stale RUNNING swept on server startup (process died mid-run; was blocking re-runs).',
    },
  });
  if (count > 0) {
    logger.warn(`🧹 Swept ${count} stale RUNNING crawler log(s) → FAILED.`);
  }
}

const app = express();
// 기본 포트는 application.dev.json(3100). 필요 시 PORT 환경변수로 덮어쓴다.
const port = Number(process.env.PORT) || config.port;

// CORS 허용 origin 화이트리스트: 기본값 + 환경변수 CORS_ORIGINS(콤마 구분) 병합
const whitelist: string[] = [
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:5173',
  'http://121.173.23.70:5173',
  'http://localhost:3000',
  'http://localhost:3100',
  ...(process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : []),
];

// 응답 gzip 압축 — JSON(목록/상세) 전송량 추가 절감. 정적 이미지는 이미 압축돼 있어 영향 적음.
app.use(compression());

// 보안 헤더: helmet 기본값 적용. CSP는 swagger UI(/api-docs)를 깨뜨릴 수 있어 비활성화.
// CORP는 cross-origin 허용: /assets의 공개 이미지(로고·캐릭터)를 다른 origin(프론트)에서
// <img>로 로드해야 하는데, helmet 기본값(same-origin)이 이를 차단한다. 공개 자산이라 안전하며
// API 보안은 CORS+인증이 담당. (verify에서 dev 5173↔3000 이미지 차단 발견)
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

// Private Network Access (PNA) 허용 헤더 추가 - CORS 미들웨어보다 먼저 실행
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Private-Network', 'true');
  next();
});

// OPTIONS 요청에 대해 PNA 헤더 포함하여 응답.
// origin 반사 금지: 화이트리스트에 있을 때만 그 origin을 echo하고 Credentials 허용.
app.options('*', (req, res) => {
  const origin = req.headers.origin;
  res.header('Access-Control-Allow-Private-Network', 'true');
  if (origin && whitelist.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  res.header(
    'Access-Control-Allow-Methods',
    'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  );
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization',
  );
  res.sendStatus(204);
});

app.use(
  cors({
    origin: function (origin, callback) {
      // origin 없는 요청(서버 간, curl 등)은 허용
      if (!origin) {
        callback(null, true);
        return;
      }
      if (whitelist.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn(`Blocked by CORS: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    optionsSuccessStatus: 200,
  }),
);

// parse requests of content-type - application/json
app.use(bodyParser.json());

// parse requests of content-type - application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: true }));

// 이미지/영상 정적 서빙. 캐릭터 이미지는 사실상 불변, 게임 아이콘은 ?v= 캐시버스팅이 있어
// 장기 캐시가 안전하다. (기본 max-age=0 → 네비마다 304 재검증 왕복 제거)
app.use(
  '/assets',
  express.static(path.join(__dirname, '../static'), {
    maxAge: '30d',
    immutable: true,
  }),
);

import { setupSwagger } from './utils/swagger';
setupSwagger(app);

// 헬스 체크: DB 연결까지 확인. 오케스트레이터/로드밸런서/compose healthcheck가 사용.
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'ok', db: 'up' });
  } catch (e) {
    logger.error('Health check DB ping 실패:', e);
    res.status(503).json({ status: 'error', db: 'down' });
  }
});

// SEO 사이트맵 — 정적 페이지 + 게임 섹션 + 전 캐릭터 상세 URL. robots.txt가 참조하고 서치콘솔에 제출.
app.get('/sitemap.xml', async (_req, res) => {
  try {
    const SITE = 'https://www.kingduck.xyz';
    const [games, chars, itemGames] = await Promise.all([
      prisma.game.findMany({ select: { slug: true } }),
      prisma.character.findMany({
        select: { id: true, game: { select: { slug: true } } },
      }),
      prisma.item.findMany({
        distinct: ['gameId'],
        select: { game: { select: { slug: true } } },
      }),
    ]);
    const itemSlugs = new Set(
      itemGames.map((i) => i.game?.slug).filter(Boolean) as string[],
    );

    const urls: string[] = ['/', '/privacy', '/terms'];
    for (const g of games) {
      urls.push(
        `/list/${g.slug}`,
        `/calendar/${g.slug}`,
        `/coupon/${g.slug}`,
        `/tier-list/${g.slug}`,
      );
      if (itemSlugs.has(g.slug)) urls.push(`/item/${g.slug}`);
    }
    for (const c of chars) {
      if (c.game?.slug) urls.push(`/content/${c.game.slug}/${c.id}`);
    }

    const body =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls.map((u) => `  <url><loc>${SITE}${u}</loc></url>`).join('\n') +
      `\n</urlset>\n`;
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(body);
  } catch (e) {
    logger.error('sitemap.xml 생성 실패:', e);
    res.status(500).send('error');
  }
});

app.use('/', routers);

// 404 핸들러: 매칭되는 라우트가 없을 때 일관된 JSON 응답.
app.use((req, res) => {
  res.status(404).json({ resultCode: 404, message: 'Not Found' });
});

// 종단 에러 미들웨어: 동기 throw 및 next(err)로 전달된 에러를 잡아
// 응답이 영영 전송되지 않고 매달리는 문제를 막는다.
// (Express 4에서 async 라우트의 reject는 자동 전달되지 않으므로 핸들러 측 try/catch 또는 asyncHandler가 함께 필요하다.)
const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  logger.error('❌ 처리되지 않은 라우트 에러:', err);
  if (res.headersSent) {
    return next(err);
  }
  const status =
    typeof err?.resultCode === 'number' && err.resultCode >= 400 && err.resultCode < 600
      ? err.resultCode
      : 500;
  res.status(status).json({
    resultCode: status,
    message: err?.message || 'Internal Server Error',
  });
};
app.use(errorHandler);

// DB는 listen 전에 연결한다(재시도 후 실패 시 fail-fast). 연결 없이 listen하면
// 헬스 위장 + 모든 요청 500인 좀비 프로세스가 된다(B-L1).
const MAX_DB_RETRIES = 5;
async function connectWithRetry(): Promise<void> {
  for (let attempt = 1; attempt <= MAX_DB_RETRIES; attempt++) {
    try {
      await prisma.$connect();
      logger.info('✅ Database connected (Prisma)');
      return;
    } catch (error) {
      logger.error(`❌ DB 연결 실패 (시도 ${attempt}/${MAX_DB_RETRIES}):`, error);
      if (attempt === MAX_DB_RETRIES) {
        logger.error('❌ DB 연결 재시도 소진 — 프로세스를 종료합니다(exit 1).');
        await prisma.$disconnect().catch(() => {});
        process.exit(1);
      }
      await new Promise((r) => setTimeout(r, attempt * 2000)); // 선형 백오프
    }
  }
}

// graceful shutdown: in-flight 요청을 마무리하고 DB 연결을 정리한 뒤 종료한다.
function setupGracefulShutdown(srv: import('http').Server): void {
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`🛑 ${signal} 수신 — graceful shutdown 시작`);

    // 30초 내 정리되지 않으면 강제 종료
    const force = setTimeout(() => {
      logger.error('❌ graceful shutdown 타임아웃 — 강제 종료');
      process.exit(1);
    }, 30_000);
    force.unref();

    srv.close(async () => {
      try {
        await prisma.$disconnect();
        logger.info('✅ 정리 완료 — 종료');
        process.exit(0);
      } catch (e) {
        logger.error('❌ 종료 중 오류:', e);
        process.exit(1);
      }
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

async function startServer(): Promise<void> {
  await connectWithRetry();

  // 기동 시 좀비 RUNNING 크롤 로그 정리 (B-L3)
  await sweepStaleCrawlerLogs().catch((e) =>
    logger.error('stale 크롤 로그 정리 실패:', e),
  );

  const server = app.listen(port, '0.0.0.0', () => {
    logger.info(`✅ Example app listening on port ${port} (0.0.0.0)`);
  });

  server.on('error', (error) => {
    logger.error('❌ 서버 에러 발생:', error);
  });

  setupGracefulShutdown(server);
}

startServer();

process.on('unhandledRejection', (reason) => {
  logger.error('❌ 처리되지 않은 Promise 거부:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('❌ 처리되지 않은 예외 발생:', error);
});
