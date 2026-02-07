import { Router } from 'express';
import * as controller from './controller';

const router = Router();

/**
 * @swagger
 * /api/v0/event/{slug}:
 *   get:
 *     summary: 게임 이벤트/가챠 일정 조회
 *     tags: [Event]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: string (게임 슬러그)
 *     responses:
 *       200:
 *         description: 이벤트 목록 반환 성공
 *       404:
 *         description: 게임을 찾을 수 없음
 * */
router.get('/:slug', controller.getEvents);

export default router;
