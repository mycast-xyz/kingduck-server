import express from 'express';
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

// Private Network Access (PNA) 허용 헤더 추가 - CORS 미들웨어보다 먼저 실행
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Private-Network', 'true');
  next();
});

// OPTIONS 요청에 대해 명시적으로 PNA 헤더 포함하여 응답
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Private-Network', 'true');
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
  res.sendStatus(204);
});

// 화이트리스트 설정
const whitelist = [
  'http://localhost:5173',
  'http://121.173.23.70:5173',
  'http://localhost:3000',
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || whitelist.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        // 개발 편의를 위해 일단 허용하되 로그 남김 (원한다면 에러 처리: callback(new Error('Not allowed by CORS')))
        logger.warn(`Blocked by CORS: ${origin}`);
        callback(null, true);
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
