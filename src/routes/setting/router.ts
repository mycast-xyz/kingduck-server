import { Router } from 'express';
import * as controller from './controller';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

/**
 * @swagger
 * /api/v0/setting:
 *   get:
 *     summary: 사이트 설정 조회 (공개)
 *     tags: [Setting]
 *     responses:
 *       200:
 *         description: 사이트 설정 반환 성공 (키 없으면 기본값)
 * */
router.get('/', asyncHandler(controller.getSetting));

export default router;
