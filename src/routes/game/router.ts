import { Router } from 'express';
import * as controller from './controller';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

/**
 * @swagger
 * /api/v0/game/list:
 *   get:
 *     summary: 게임 리스트 조회
 *     tags: [Game]
 *     responses:
 *       200:
 *         description: 게임 리스트 반환 성공
 */

router.get('/list', asyncHandler(controller.getList));

/**
 * @swagger
 * /api/v0/game/{slug}:
 *   get:
 *     summary: 게임 상세 조회
 *     tags: [Game]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: string (게임 슬러그)
 *     responses:
 *       200:
 *         description: 게임 상세 정보 반환 성공
 *       404:
 *         description: 게임을 찾을 수 없음
 */
router.get('/:slug', asyncHandler(controller.getDetail));

export default router;
