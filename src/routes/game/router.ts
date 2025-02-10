import express from 'express';

// 컨트롤러 참조
import GameController from './gameController';

const router = express.Router();

//router.use(cors(corsOpt));

// 요청 method 별로 라우팅
router.get('/list/', GameController.getGameList);
router.get('/admin/list', GameController.getAdminGameList);
router.get('/:slug', GameController.getGame);

export default router;
