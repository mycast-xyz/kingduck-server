import { Router } from 'express';
import * as controller from './controller';

const router = Router();

/**
 * @swagger
 * /api/v0/redeem/{slug}:
 *   get:
 *     summary: 리딤 코드 조회
 *     tags: [Redeem]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: string (게임 슬러그)
 *     responses:
 *       200:
 *         description: 리딤 코드 목록 반환 성공
 *       404:
 *         description: 게임을 찾을 수 없음
 * */
router.get('/:slug', controller.getRedeemCodes);

export default router;
