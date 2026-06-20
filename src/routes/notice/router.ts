import { Router } from 'express';
import * as controller from './controller';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

/**
 * @swagger
 * /api/v0/notice/list:
 *   get:
 *     summary: 공개 공지 목록 조회 (게시 중인 것만)
 *     tags: [Notice]
 *     responses:
 *       200:
 *         description: 공지 목록 반환 성공
 * */
router.get('/list', asyncHandler(controller.getNoticeList));

/**
 * @swagger
 * /api/v0/notice/{id}:
 *   get:
 *     summary: 공개 공지 상세 조회
 *     tags: [Notice]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: 공지 ID
 *     responses:
 *       200:
 *         description: 공지 상세 반환 성공
 *       404:
 *         description: 공지를 찾을 수 없음
 * */
router.get('/:id', asyncHandler(controller.getNotice));

export default router;
