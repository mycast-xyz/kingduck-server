import express from 'express';
import AdminController from './AdminController';
import { authorize } from '../../middleware/auth';

const router = express.Router();

// 모든 Admin 라우트는 ADMIN 권한 필요
router.use(authorize(['ADMIN', 'MANAGER']));

router.get('/game/list', AdminController.getGameList);
router.get('/character/list', AdminController.getCharacterList);
router.get('/item/list', AdminController.getItemList);

export default router;
