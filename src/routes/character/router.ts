import { Router } from 'express';
import {
  getList,
  getDetail,
  getCharacterDetailByName,
  getDetailByOriginalId,
} from './controller';

const router = Router();

/**
 * @swagger
 * /api/v0/character/{gameSlug}/list:
 *   get:
 *     summary: 캐릭터 리스트 조회
 *     tags: [Character]
 *     parameters:
 *       - in: path
 *         name: gameSlug
 *         schema:
 *           type: string
 *         required: true
 *         description: string (게임 슬러그)
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [elements]
 *         required: false
 *         description: string (조회 타입)
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         required: false
 *         description: string (캐릭터 이름 검색)
 *       - in: query
 *         name: elementId
 *         schema:
 *           type: integer
 *         required: false
 *         description: number (속성 ID 필터)
 *       - in: query
 *         name: pathId
 *         schema:
 *           type: integer
 *         required: false
 *         description: number (Path ID 필터)
 *       - in: query
 *         name: rarity
 *         schema:
 *           type: integer
 *         required: false
 *         description: number (희귀도 필터)
 *     responses:
 *       200:
 *         description: 캐릭터 리스트 반환 성공
 */
router.get('/:gameSlug/list', getList);

/**
 * @swagger
 * /api/v0/character/{gameSlug}/{id}:
 *   get:
 *     summary: 캐릭터 상세 조회
 *     tags: [Character]
 *     parameters:
 *       - in: path
 *         name: gameSlug
 *         schema:
 *           type: string
 *         required: true
 *         description: string (게임 슬러그)
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: number (캐릭터 ID)
 *     responses:
 *       200:
 *         description: 캐릭터 상세 정보 반환 성공
 *       404:
 *         description: 캐릭터를 찾을 수 없음
 */
router.get('/:gameSlug/:id', getDetail);
/**
 * @swagger
 * /api/v0/character/{gameSlug}/name/{name}:
 *   get:
 *     summary: 캐릭터 상세 조회 (이름)
 *     tags: [Character]
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
 *         description: string (캐릭터 이름)
 *     responses:
 *       200:
 *         description: 캐릭터 상세 정보 반환 성공
 *       404:
 *         description: 캐릭터를 찾을 수 없음
 */
router.get('/:gameSlug/name/:name', getCharacterDetailByName);

/**
 * @swagger
 * /api/v0/character/{gameId}/original/{originalId}:
 *   get:
 *     summary: 캐릭터 상세 조회 (Original ID)
 *     tags: [Character]
 *     parameters:
 *       - in: path
 *         name: gameId
 *         schema:
 *           type: integer
 *         required: true
 *         description: number (게임 ID)
 *       - in: path
 *         name: originalId
 *         schema:
 *           type: string
 *         required: true
 *         description: string (Metadata Original ID)
 *     responses:
 *       200:
 *         description: 캐릭터 상세 정보 반환 성공
 *       404:
 *         description: 캐릭터를 찾을 수 없음
 */
router.get('/:gameId/original/:originalId', getDetailByOriginalId);

export default router;
