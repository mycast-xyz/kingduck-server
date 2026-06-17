import { Router } from 'express';
import * as controller from './controller';
import { asyncHandler } from '../../utils/asyncHandler';

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
router.get('/list', asyncHandler(controller.getList));

/**
 * @swagger
 * /api/v0/item/{gameSlug}/name/{name}:
 *   get:
 *     summary: 아이템 상세 조회 (이름)
 *     tags: [Item]
 *     parameters:
 *       - in: path
 *         name: gameSlug
 *         schema:
 *           type: string
 *         required: true
 *         description: string (게임 슬러그)
 *       - in: path
 *         name: name
 *         schema:
 *           type: string
 *         required: true
 *         description: string (아이템 이름)
 *     responses:
 *       200:
 *         description: 아이템 상세 정보 반환 성공
 *       404:
 *         description: 아이템을 찾을 수 없음
 */
router.get('/:gameSlug/name/:name', asyncHandler(controller.getItemByName));

export default router;
