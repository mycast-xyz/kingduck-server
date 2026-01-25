import { Router } from 'express';
import * as controller from './controller';

const router = Router();

/**
 * @swagger
 * /api/v0/item/list:
 *   get:
 *     summary: 아이템 리스트 조회
 *     tags: [Item]
 *     responses:
 *       200:
 *         description: 아이템 리스트 반환 성공
 */
router.get('/list', controller.getList);

export default router;
