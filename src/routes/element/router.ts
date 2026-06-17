import { Router } from 'express';
import * as controller from './controller';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

/**
 * @swagger
 * /api/v0/element/list:
 *   get:
 *     summary: 엘리먼트 리스트 조회
 *     tags: [Element]
 *     description: 모든 엘리먼트 리스트를 조회합니다
 *     responses:
 *       200:
 *         description: 엘리먼트 리스트 반환 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   gameId:
 *                     type: integer
 *                   name:
 *                     type: string
 *                   type:
 *                     type: string
 *                   iconUrl:
 *                     type: string
 *                     nullable: true
 *                   game:
 *                     type: object
 *       500:
 *         description: 서버 오류
 */
router.get('/list', asyncHandler(controller.getList));

export default router;
