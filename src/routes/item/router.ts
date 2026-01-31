import { Router } from 'express';
import * as controller from './controller';

const router = Router();

/**
 * @swagger
 * /api/v0/item/list:
 *   get:
 *     summary: 아이템 리스트 조회
 *     tags: [Item]
 *     parameters:
 *       - in: query
 *         name: originalId
 *         schema:
 *           type: string
 *         description: Original ID from game metadata
 *       - in: query
 *         name: gameId
 *         schema:
 *           type: integer
 *         description: Game ID
 *     responses:
 *       200:
 *         description: 아이템 리스트 반환 성공
 */
router.get('/list', controller.getList);

export default router;
