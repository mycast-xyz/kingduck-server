import express, { type ErrorRequestHandler } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';

// DB ORM 참조
import { config } from './config/config';
import routers from './routes/';
import { prisma } from './utils/prisma';
import path from 'path';
import logger from './utils/logger';

const app = express();
const port = config.port;

// CORS 허용 origin 화이트리스트: 기본값 + 환경변수 CORS_ORIGINS(콤마 구분) 병합
const whitelist: string[] = [
  'http://localhost:5173',
  'http://121.173.23.70:5173',
  'http://localhost:3000',
  ...(process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : []),
];

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

// 이미지 영상 처리
app.use('/assets', express.static(path.join(__dirname, '../static')));

import { setupSwagger } from './utils/swagger';
setupSwagger(app);

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

const server = app.listen(port, '0.0.0.0', async () => {
  try {
    logger.info(`✅ Example app listening on port ${port} (0.0.0.0)`);

    await prisma.$connect();
    logger.info(`✅ Database connected (Prisma)`);
  } catch (error) {
    logger.error('❌ 서버 시작 실패:', error);
  }
});

server.on('error', (error) => {
  logger.error('❌ 서버 에러 발생:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('❌ 처리되지 않은 Promise 거부:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('❌ 처리되지 않은 예외 발생:', error);
});
