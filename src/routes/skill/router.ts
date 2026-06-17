import { Router } from 'express';
import * as controller from './controller';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

/**
 * @swagger
 * /api/v0/skill/list:
 *   get:
 *     summary: 캐릭터 스킬 목록 조회
 *     tags: [Skill]
 *     description: |
 *       Character.metadata.skills 에서 스킬 데이터를 반환한다.
 *       Prisma 스키마에 독립적인 Skill 모델이 없으므로
 *       characterId 로 캐릭터를 조회한 뒤 metadata 내 skills 배열을 반환한다.
 *     parameters:
 *       - in: query
 *         name: characterId
 *         schema:
 *           type: integer
 *         required: true
 *         description: 캐릭터 ID
 *     responses:
 *       200:
 *         description: 스킬 목록 반환 성공
 *       400:
 *         description: characterId 누락 또는 유효하지 않음
 *       404:
 *         description: 캐릭터를 찾을 수 없음
 */
router.get('/list', asyncHandler(controller.getList));

export default router;
