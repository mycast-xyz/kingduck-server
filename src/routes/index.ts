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

const routes = Router();

// 라우터 분기시 사용
routes.use('/api/v0/game/', game);
routes.use('/api/v0/item/', item);
routes.use('/api/v0/character/', character);
routes.use('/api/v0/element/', element);
routes.use('/api/v0/account/', account);
routes.use('/api/v0/admin/', admin);
routes.use('/api/v0/video/', video);
routes.use('/api/v0/redeem/', redeem);
routes.use('/api/v0/event/', event);
routes.use('/api/v0/skill/', skill);

export default routes;
