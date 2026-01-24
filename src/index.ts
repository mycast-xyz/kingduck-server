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

var corOptions = {
  // 주소 필요
  origin: 'http://localhost:5173',
};

app.use(cors());

// parse requests of content-type - application/json
app.use(bodyParser.json());

// parse requests of content-type - application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: true }));

// 이미지 영상 처리
app.use('/assets', express.static(path.join(__dirname, '../static')));

app.use('/', routers);

const server = app.listen(port, async () => {
  try {
    logger.info(`✅ Example app listening on port ${port}`);

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
