import { Router } from 'express';
import * as controller from './controller';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

/**
 * @swagger
 * /api/v0/faq/list:
 *   get:
 *     summary: 공개 FAQ 목록 조회 (게시 중인 것만)
 *     tags: [FAQ]
 *     responses:
 *       200:
 *         description: FAQ 목록 반환 성공
 * */
router.get('/list', asyncHandler(controller.getFaqList));

export default router;
