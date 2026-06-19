import { Router } from 'express';
import game from './game/router';
import item from './item/router';
import character from './character/router';
import element from './element/router';
import account from './account/router';
import admin from './admin/router';
import video from './video/router';
import redeem from './redeem/router';
import event from './event/router';
import skill from './skill/router';
import { cacheRead } from '../utils/responseCache';

const routes = Router();

// 읽기 데이터는 크롤 때만 바뀌므로 5분 인메모리 캐시 + CDN s-maxage(홈서버 DB 부하 완화).
// account/admin은 캐시하지 않는다(인증·최신 필요). 미들웨어는 GET·비-admin 경로만 캐시한다.
const READ_TTL = 300;

// 라우터 분기시 사용
routes.use('/api/v0/game/', cacheRead(READ_TTL), game);
routes.use('/api/v0/item/', cacheRead(READ_TTL), item);
routes.use('/api/v0/character/', cacheRead(READ_TTL), character);
routes.use('/api/v0/element/', cacheRead(READ_TTL), element);
routes.use('/api/v0/account/', account);
routes.use('/api/v0/admin/', admin);
routes.use('/api/v0/video/', cacheRead(READ_TTL), video);
routes.use('/api/v0/redeem/', cacheRead(READ_TTL), redeem);
routes.use('/api/v0/event/', cacheRead(READ_TTL), event);
routes.use('/api/v0/skill/', cacheRead(READ_TTL), skill);

export default routes;
