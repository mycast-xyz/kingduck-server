import express from 'express';
import multer from 'multer';
import AdminController from './AdminController';
import CrawlerController from './CrawlerController';
import SystemStatsController from './SystemStatsController';
import UserManagementController from './UserManagementController';
import { authorize } from '../../middleware/auth';

const router = express.Router();

// 게임 아이콘 업로드 — 메모리 저장(sharp가 버퍼를 webp 변환), 3MB 제한.
const iconUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
});

// 모든 Admin 라우트는 ADMIN/MANAGER 권한 필요.
// recheckDb: 어드민은 민감 작업이라 매 요청 DB에서 role/밴 상태를 재확인(강등/밴 즉시 반영, B-S6).
router.use(authorize(['ADMIN', 'MANAGER'], { recheckDb: true }));

// 대시보드 / 감사 로그

/**
 * @swagger
 * /api/v0/admin/dashboard/summary:
 *   get:
 *     summary: 대시보드 요약 통계 (게임/캐릭터/아이템/이벤트/유저/대기 이벤트 수)
 *     tags: [Admin - Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 요약 통계 반환 성공
 */
router.get('/dashboard/summary', AdminController.getDashboardSummary);

/**
 * @swagger
 * /api/v0/admin/audit-log:
 *   get:
 *     summary: 전역 활동(감사) 로그 조회
 *     tags: [Admin - Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 활동 로그 반환 성공
 */
router.get('/audit-log', AdminController.getAuditLog);

/**
 * @swagger
 * /api/v0/admin/game/list:
 *   get:
 *     summary: 게임 목록 및 통계 조회
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 게임 목록 반환 성공
 *       401:
 *         description: 인증 실패
 *       403:
 *         description: 권한 없음
 */
router.get('/game/list', AdminController.getGameList);

/**
 * @swagger
 * /api/v0/admin/game:
 *   post:
 *     summary: 게임 생성 (어드민 직접 등록)
 *     tags: [Admin - Game CRUD]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [slug, name]
 *             properties:
 *               slug:
 *                 type: string
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: 게임 생성 성공
 *       400:
 *         description: 필수 항목 누락
 *       409:
 *         description: 동일 slug 게임이 이미 존재
 */
router.post('/game', AdminController.createGame);

/**
 * @swagger
 * /api/v0/admin/game/{slug}:
 *   put:
 *     summary: 게임 수정 (어드민, slug 불변)
 *     tags: [Admin - Game CRUD]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: 게임 수정 성공
 *       404:
 *         description: 게임을 찾을 수 없음
 */
router.put('/game/:slug', AdminController.updateGame);

/**
 * @swagger
 * /api/v0/admin/game/{slug}/icon:
 *   post:
 *     summary: 게임 아이콘 업로드/교체
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     consumes: [multipart/form-data]
 *     responses:
 *       200:
 *         description: 업로드 성공(갱신된 iconUrl 반환)
 */
router.post(
  '/game/:slug/icon',
  iconUpload.single('file'),
  AdminController.uploadGameIcon,
);
// 등급별 카드 색상(JSON) 저장.
router.put('/game/:slug/rarity-colors', AdminController.updateRarityColors);
// 등급 표시 방식(별 반복/이미지) 저장 + 티어 이미지 업로드.
router.put('/game/:slug/rarity-display', AdminController.updateRarityDisplay);
router.post(
  '/game/:slug/rarity-image/:tier',
  iconUpload.single('file'),
  AdminController.uploadRarityImage,
);

// 속성/특성(Element) 아이콘 + 한글명 관리 — 필터 아이콘/라벨이 DB(Element) 기반이라 여기서 채운다.
router.get('/element/list', AdminController.getElementList);
router.put('/element/:id', AdminController.updateElement);
router.post(
  '/element/:id/icon',
  iconUpload.single('file'),
  AdminController.uploadElementIcon,
);

/**
 * @swagger
 * /api/v0/admin/character/list:
 *   get:
 *     summary: 캐릭터 목록 조회
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: 페이지 번호
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: 페이지당 아이템 수
 *       - in: query
 *         name: gameId
 *         schema:
 *           type: integer
 *         description: 게임 ID
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: 캐릭터 이름 검색
 *     responses:
 *       200:
 *         description: 캐릭터 목록 반환 성공
 */
router.get('/character/list', AdminController.getCharacterList);

/**
 * @swagger
 * /api/v0/admin/character:
 *   post:
 *     summary: 캐릭터 생성 (어드민 직접 등록)
 *     tags: [Admin - Character CRUD]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [gameId, name]
 *             properties:
 *               gameId:
 *                 type: integer
 *               name:
 *                 type: string
 *               rarity:
 *                 type: integer
 *               elementId:
 *                 type: integer
 *               pathId:
 *                 type: integer
 *               weaponType:
 *                 type: string
 *               role:
 *                 type: string
 *               originalId:
 *                 type: string
 *               description:
 *                 type: string
 *               imageUrl:
 *                 type: string
 *               metadata:
 *                 type: object
 *     responses:
 *       200:
 *         description: 캐릭터 생성 성공
 *       400:
 *         description: 필수 항목 누락
 *       409:
 *         description: 동일 gameId + originalId 캐릭터가 이미 존재
 */
router.post('/character', AdminController.createCharacter);

/**
 * @swagger
 * /api/v0/admin/character/{id}:
 *   put:
 *     summary: 캐릭터 수정 (어드민)
 *     tags: [Admin - Character CRUD]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: 캐릭터 수정 성공
 *       404:
 *         description: 캐릭터를 찾을 수 없음
 *       409:
 *         description: 동일 gameId + originalId 캐릭터가 이미 존재
 */
router.put('/character/:id', AdminController.updateCharacter);

/**
 * @swagger
 * /api/v0/admin/character/{id}:
 *   delete:
 *     summary: 캐릭터 삭제 (어드민)
 *     tags: [Admin - Character CRUD]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 캐릭터 삭제 성공
 *       404:
 *         description: 캐릭터를 찾을 수 없음
 *       409:
 *         description: 참조 데이터가 있어 삭제 불가
 */
router.delete('/character/:id', AdminController.deleteCharacter);

/**
 * @swagger
 * /api/v0/admin/character/{id}/image:
 *   post:
 *     summary: 캐릭터 이미지 업로드/교체
 *     tags: [Admin - Character CRUD]
 *     security:
 *       - bearerAuth: []
 *     consumes: [multipart/form-data]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 업로드 성공(갱신된 imageUrl 반환)
 *       404:
 *         description: 캐릭터를 찾을 수 없음
 */
router.post(
  '/character/:id/image',
  iconUpload.single('file'),
  AdminController.uploadCharacterImage,
);

// 데이터 공백(재크롤 필요) 집계 — metadata.dataGaps 기반
router.get('/data-gaps', AdminController.getDataGaps);

/**
 * @swagger
 * /api/v0/admin/item/list:
 *   get:
 *     summary: 아이템 목록 조회
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: 페이지 번호
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: 페이지당 아이템 수
 *       - in: query
 *         name: gameId
 *         schema:
 *           type: integer
 *         description: 게임 ID
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: 아이템 타입 (free string, 예 Weapon/Material)
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: 아이템 이름 검색
 *     responses:
 *       200:
 *         description: 아이템 목록 반환 성공
 */
router.get('/item/list', AdminController.getItemList);

/**
 * @swagger
 * /api/v0/admin/item/{id}:
 *   get:
 *     summary: 아이템 상세 조회
 *     tags: [Admin - Item CRUD]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 아이템 상세 반환 성공
 *       404:
 *         description: 아이템을 찾을 수 없음
 */
router.get('/item/:id', AdminController.getItemDetail);

/**
 * @swagger
 * /api/v0/admin/item:
 *   post:
 *     summary: 아이템 생성 (어드민 직접 등록)
 *     tags: [Admin - Item CRUD]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [gameId, name, type]
 *             properties:
 *               gameId:
 *                 type: integer
 *               name:
 *                 type: string
 *               type:
 *                 type: string
 *               rarity:
 *                 type: integer
 *               originalId:
 *                 type: string
 *               description:
 *                 type: string
 *               imageUrl:
 *                 type: string
 *               metadata:
 *                 type: object
 *     responses:
 *       200:
 *         description: 아이템 생성 성공
 *       400:
 *         description: 필수 항목 누락
 *       409:
 *         description: 동일 gameId + type + originalId 아이템이 이미 존재
 */
router.post('/item', AdminController.createItem);

/**
 * @swagger
 * /api/v0/admin/item/{id}:
 *   put:
 *     summary: 아이템 수정 (어드민)
 *     tags: [Admin - Item CRUD]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: 아이템 수정 성공
 *       404:
 *         description: 아이템을 찾을 수 없음
 *       409:
 *         description: 동일 gameId + type + originalId 아이템이 이미 존재
 */
router.put('/item/:id', AdminController.updateItem);

/**
 * @swagger
 * /api/v0/admin/item/{id}:
 *   delete:
 *     summary: 아이템 삭제 (어드민)
 *     tags: [Admin - Item CRUD]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 아이템 삭제 성공
 *       404:
 *         description: 아이템을 찾을 수 없음
 */
router.delete('/item/:id', AdminController.deleteItem);

/**
 * @swagger
 * /api/v0/admin/item/{id}/image:
 *   post:
 *     summary: 아이템 이미지 업로드/교체
 *     tags: [Admin - Item CRUD]
 *     security:
 *       - bearerAuth: []
 *     consumes: [multipart/form-data]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 업로드 성공(갱신된 imageUrl 반환)
 *       404:
 *         description: 아이템을 찾을 수 없음
 */
router.post(
  '/item/:id/image',
  iconUpload.single('file'),
  AdminController.uploadItemImage,
);

// 리딤(쿠폰) 그룹/코드 CRUD — 리터럴 경로(group/list)를 :id 보다 먼저 등록.

/**
 * @swagger
 * /api/v0/admin/redeem/group/list:
 *   get:
 *     summary: 리딤 그룹 목록 조회 (페이지네이션, 검색)
 *     tags: [Admin - Redeem]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: 페이지 번호
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: 페이지당 항목 수
 *       - in: query
 *         name: gameId
 *         schema:
 *           type: integer
 *         description: 게임 ID
 *       - in: query
 *         name: title
 *         schema:
 *           type: string
 *         description: 그룹 제목 검색
 *     responses:
 *       200:
 *         description: 리딤 그룹 목록 반환 성공
 */
router.get('/redeem/group/list', AdminController.getRedeemGroupList);

/**
 * @swagger
 * /api/v0/admin/redeem/group:
 *   post:
 *     summary: 리딤 그룹 생성 (코드 동봉 가능)
 *     tags: [Admin - Redeem]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [gameId, title]
 *             properties:
 *               gameId:
 *                 type: integer
 *               title:
 *                 type: string
 *               periodText:
 *                 type: string
 *               startTime:
 *                 type: string
 *                 format: date-time
 *               endTime:
 *                 type: string
 *                 format: date-time
 *               codes:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [code]
 *                   properties:
 *                     code:
 *                       type: string
 *                     reward:
 *                       type: string
 *     responses:
 *       200:
 *         description: 리딤 그룹 생성 성공
 *       400:
 *         description: 필수 항목 누락
 *       409:
 *         description: 동일한 코드가 이미 존재
 */
router.post('/redeem/group', AdminController.createRedeemGroup);

/**
 * @swagger
 * /api/v0/admin/redeem/group/{id}:
 *   get:
 *     summary: 리딤 그룹 상세 조회 (코드 전체 포함)
 *     tags: [Admin - Redeem]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 리딤 그룹 상세 반환 성공
 *       404:
 *         description: 리딤 그룹을 찾을 수 없음
 */
router.get('/redeem/group/:id', AdminController.getRedeemGroupDetail);

/**
 * @swagger
 * /api/v0/admin/redeem/group/{id}:
 *   put:
 *     summary: 리딤 그룹 수정 (gameId·codes 불변)
 *     tags: [Admin - Redeem]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               periodText:
 *                 type: string
 *               startTime:
 *                 type: string
 *                 format: date-time
 *               endTime:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: 리딤 그룹 수정 성공
 *       404:
 *         description: 리딤 그룹을 찾을 수 없음
 */
router.put('/redeem/group/:id', AdminController.updateRedeemGroup);

/**
 * @swagger
 * /api/v0/admin/redeem/group/{id}:
 *   delete:
 *     summary: 리딤 그룹 삭제 (코드는 Cascade 자동 삭제)
 *     tags: [Admin - Redeem]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 리딤 그룹 삭제 성공
 *       404:
 *         description: 리딤 그룹을 찾을 수 없음
 */
router.delete('/redeem/group/:id', AdminController.deleteRedeemGroup);

/**
 * @swagger
 * /api/v0/admin/redeem/group/{id}/code:
 *   post:
 *     summary: 리딤 코드 추가 (기존 그룹에)
 *     tags: [Admin - Redeem]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code:
 *                 type: string
 *               reward:
 *                 type: string
 *     responses:
 *       200:
 *         description: 리딤 코드 추가 성공
 *       400:
 *         description: 필수 항목 누락
 *       404:
 *         description: 리딤 그룹을 찾을 수 없음
 *       409:
 *         description: 동일한 코드가 이미 존재
 */
router.post('/redeem/group/:id/code', AdminController.addRedeemCode);

/**
 * @swagger
 * /api/v0/admin/redeem/code/{codeId}:
 *   delete:
 *     summary: 리딤 코드 삭제
 *     tags: [Admin - Redeem]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: codeId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 리딤 코드 삭제 성공
 *       404:
 *         description: 리딤 코드를 찾을 수 없음
 */
router.delete('/redeem/code/:codeId', AdminController.deleteRedeemCode);

// 공지(Notice) CRUD — 리터럴 경로(notice/list)를 :id 보다 먼저 등록.

/**
 * @swagger
 * /api/v0/admin/notice/list:
 *   get:
 *     summary: 공지 목록 조회 (페이지네이션, 검색)
 *     tags: [Admin - Notice]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: 페이지 번호
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: 페이지당 항목 수
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: 카테고리 일치 필터
 *       - in: query
 *         name: title
 *         schema:
 *           type: string
 *         description: 제목 검색
 *     responses:
 *       200:
 *         description: 공지 목록 반환 성공
 */
router.get('/notice/list', AdminController.getNoticeList);

/**
 * @swagger
 * /api/v0/admin/notice:
 *   post:
 *     summary: 공지 생성 (어드민 직접 등록)
 *     tags: [Admin - Notice]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, content]
 *             properties:
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *               category:
 *                 type: string
 *               pinned:
 *                 type: boolean
 *               published:
 *                 type: boolean
 *               startAt:
 *                 type: string
 *                 format: date-time
 *               endAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: 공지 생성 성공
 *       400:
 *         description: 필수 항목 누락
 */
router.post('/notice', AdminController.createNotice);

/**
 * @swagger
 * /api/v0/admin/notice/{id}:
 *   get:
 *     summary: 공지 상세 조회
 *     tags: [Admin - Notice]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 공지 상세 반환 성공
 *       404:
 *         description: 공지를 찾을 수 없음
 */
router.get('/notice/:id', AdminController.getNoticeDetail);

/**
 * @swagger
 * /api/v0/admin/notice/{id}:
 *   put:
 *     summary: 공지 수정 (어드민)
 *     tags: [Admin - Notice]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: 공지 수정 성공
 *       404:
 *         description: 공지를 찾을 수 없음
 */
router.put('/notice/:id', AdminController.updateNotice);

/**
 * @swagger
 * /api/v0/admin/notice/{id}:
 *   delete:
 *     summary: 공지 삭제 (어드민)
 *     tags: [Admin - Notice]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 공지 삭제 성공
 *       404:
 *         description: 공지를 찾을 수 없음
 */
router.delete('/notice/:id', AdminController.deleteNotice);

// FAQ CRUD — 리터럴 경로(faq/list)를 :id 보다 먼저 등록.

/**
 * @swagger
 * /api/v0/admin/faq/list:
 *   get:
 *     summary: FAQ 목록 조회 (페이지네이션, 검색)
 *     tags: [Admin - FAQ]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: 페이지 번호
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: 페이지당 항목 수
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: 카테고리 일치 필터
 *     responses:
 *       200:
 *         description: FAQ 목록 반환 성공
 */
router.get('/faq/list', AdminController.getFaqList);

/**
 * @swagger
 * /api/v0/admin/faq:
 *   post:
 *     summary: FAQ 생성 (어드민 직접 등록)
 *     tags: [Admin - FAQ]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [question, answer]
 *             properties:
 *               question:
 *                 type: string
 *               answer:
 *                 type: string
 *               category:
 *                 type: string
 *               sortOrder:
 *                 type: integer
 *               published:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: FAQ 생성 성공
 *       400:
 *         description: 필수 항목 누락
 */
router.post('/faq', AdminController.createFaq);

/**
 * @swagger
 * /api/v0/admin/faq/{id}:
 *   get:
 *     summary: FAQ 상세 조회
 *     tags: [Admin - FAQ]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: FAQ 상세 반환 성공
 *       404:
 *         description: FAQ를 찾을 수 없음
 */
router.get('/faq/:id', AdminController.getFaqDetail);

/**
 * @swagger
 * /api/v0/admin/faq/{id}:
 *   put:
 *     summary: FAQ 수정 (어드민)
 *     tags: [Admin - FAQ]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: FAQ 수정 성공
 *       404:
 *         description: FAQ를 찾을 수 없음
 */
router.put('/faq/:id', AdminController.updateFaq);

/**
 * @swagger
 * /api/v0/admin/faq/{id}:
 *   delete:
 *     summary: FAQ 삭제 (어드민)
 *     tags: [Admin - FAQ]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: FAQ 삭제 성공
 *       404:
 *         description: FAQ를 찾을 수 없음
 */
router.delete('/faq/:id', AdminController.deleteFaq);

/**
 * @swagger
 * /api/v0/admin/event/list:
 *   get:
 *     summary: 이벤트 목록 조회 (전체)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: 페이지 번호
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: 페이지당 아이템 수
 *       - in: query
 *         name: gameId
 *         schema:
 *           type: integer
 *         description: 게임 ID
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [GACHA, EVENT, MAINTENANCE, SPECIAL]
 *         description: 이벤트 타입
 *       - in: query
 *         name: title
 *         schema:
 *           type: string
 *         description: 제목 검색
 *     responses:
 *       200:
 *         description: 이벤트 목록 반환 성공
 */
router.get('/event/list', AdminController.getEventList);

/**
 * @swagger
 * /api/v0/admin/event:
 *   post:
 *     summary: 이벤트 생성 (어드민 직접 등록)
 *     tags: [Admin - Event CRUD]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [gameId, title, type, startTime, endTime]
 *             properties:
 *               gameId:
 *                 type: integer
 *               title:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [GACHA, EVENT, MAINTENANCE, SPECIAL]
 *               startTime:
 *                 type: string
 *                 format: date-time
 *               endTime:
 *                 type: string
 *                 format: date-time
 *               image:
 *                 type: string
 *               officialLink:
 *                 type: string
 *               description:
 *                 type: string
 *               characterName:
 *                 type: string
 *     responses:
 *       200:
 *         description: 이벤트 생성 성공
 *       400:
 *         description: 필수 항목 누락
 */
router.post('/event', AdminController.createEvent);

/**
 * @swagger
 * /api/v0/admin/event/{id}:
 *   put:
 *     summary: 이벤트 수정 (어드민)
 *     tags: [Admin - Event CRUD]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: 이벤트 수정 성공
 *       404:
 *         description: 이벤트를 찾을 수 없음
 */
router.put('/event/:id', AdminController.updateEvent);

/**
 * @swagger
 * /api/v0/admin/event/{id}:
 *   delete:
 *     summary: 이벤트 삭제 (어드민)
 *     tags: [Admin - Event CRUD]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 이벤트 삭제 성공
 *       404:
 *         description: 이벤트를 찾을 수 없음
 */
router.delete('/event/:id', AdminController.deleteEvent);

// 크롤러 관리

/**
 * @swagger
 * /api/v0/admin/crawler/status:
 *   get:
 *     summary: 전체 크롤러 상태 조회 (지원 목록 + 최근 실행 기록)
 *     tags: [Admin - Crawler]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 크롤러 상태 반환 성공
 */
router.get('/crawler/status', CrawlerController.getStatus);

/**
 * @swagger
 * /api/v0/admin/crawler/logs:
 *   get:
 *     summary: 크롤러 실행 로그 조회
 *     tags: [Admin - Crawler]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: 페이지 번호
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: 페이지당 아이템 수
 *       - in: query
 *         name: gameId
 *         schema:
 *           type: integer
 *         description: 게임 ID
 *       - in: query
 *         name: crawlerType
 *         schema:
 *           type: string
 *         description: 크롤러 타입 (event, character, video)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [RUNNING, SUCCESS, FAILED, PARTIAL]
 *         description: 상태
 *     responses:
 *       200:
 *         description: 크롤러 로그 반환 성공
 */
router.get('/crawler/logs', CrawlerController.getLogs);

/**
 * @swagger
 * /api/v0/admin/crawler/run:
 *   post:
 *     summary: 크롤러 수동 실행
 *     tags: [Admin - Crawler]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               gameSlug:
 *                 type: string
 *                 description: '게임 슬러그 (예: endfield)'
 *               crawlerType:
 *                 type: string
 *                 description: '크롤러 타입 (예: event)'
 *     responses:
 *       200:
 *         description: 크롤러 실행 시작 성공
 *       400:
 *         description: 잘못된 요청
 *       404:
 *         description: 게임을 찾을 수 없음
 */
router.post('/crawler/run', CrawlerController.runCrawler);

// 실행 중 크롤의 실시간 진행 + 중단 요청
router.get('/crawler/progress', CrawlerController.getProgress);
router.post('/crawler/stop', CrawlerController.stopCrawler);

/**
 * @swagger
 * /api/v0/admin/crawler/run/{logId}:
 *   get:
 *     summary: 크롤러 실행 상태 확인
 *     tags: [Admin - Crawler]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: logId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 크롤러 로그 ID
 *     responses:
 *       200:
 *         description: 크롤러 실행 상태 반환 성공
 *       404:
 *         description: 로그를 찾을 수 없음
 */
router.get('/crawler/run/:logId', CrawlerController.getRunStatus);

// 이벤트 승인

/**
 * @swagger
 * /api/v0/admin/event/pending:
 *   get:
 *     summary: 승인 대기 중인 이벤트 조회
 *     tags: [Admin - Event Approval]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: 페이지 번호
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: 페이지당 아이템 수
 *       - in: query
 *         name: gameId
 *         schema:
 *           type: integer
 *         description: 게임 ID
 *     responses:
 *       200:
 *         description: 승인 대기 이벤트 목록 반환 성공
 */
router.get('/event/pending', AdminController.getPendingEvents);

/**
 * @swagger
 * /api/v0/admin/event/approve/{id}:
 *   post:
 *     summary: 이벤트 승인
 *     tags: [Admin - Event Approval]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: 이벤트 ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               edits:
 *                 type: object
 *                 description: 수정할 필드들 (선택사항)
 *                 properties:
 *                   title:
 *                     type: string
 *                   startTime:
 *                     type: string
 *                     format: date-time
 *                   endTime:
 *                     type: string
 *                     format: date-time
 *     responses:
 *       200:
 *         description: 이벤트 승인 성공
 *       400:
 *         description: 잘못된 요청 또는 이미 처리된 이벤트
 *       404:
 *         description: 이벤트를 찾을 수 없음
 */
router.post('/event/approve/:id', AdminController.approveEvent);

/**
 * @swagger
 * /api/v0/admin/event/reject/{id}:
 *   post:
 *     summary: 이벤트 거부
 *     tags: [Admin - Event Approval]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: 이벤트 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: 거부 사유
 *     responses:
 *       200:
 *         description: 이벤트 거부 성공
 *       400:
 *         description: 잘못된 요청 또는 이미 처리된 이벤트
 *       404:
 *         description: 이벤트를 찾을 수 없음
 */
router.post('/event/reject/:id', AdminController.rejectEvent);

// 시스템 모니터링

/**
 * @swagger
 * /api/v0/admin/system/summary:
 *   get:
 *     summary: 시스템 요약 정보 조회 (H/W 사양 등)
 *     tags: [Admin - System]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 시스템 요약 정보 반환 성공
 */
router.get('/system/summary', SystemStatsController.getSystemSummary);

/**
 * @swagger
 * /api/v0/admin/system/stats:
 *   get:
 *     summary: 실시간 시스템 리소스 조회 (CPU, Memory, Network)
 *     tags: [Admin - System]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 시스템 리소스 정보 반환 성공
 */
router.get('/system/stats', SystemStatsController.getSystemStats);

// 사용자 관리

/**
 * @swagger
 * /api/v0/admin/user/list:
 *   get:
 *     summary: 사용자 목록 조회 (검색/필터링)
 *     tags: [Admin - User]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: email
 *         schema:
 *           type: string
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [USER, MANAGER, ADMIN]
 *     responses:
 *       200:
 *         description: 사용자 목록 반환 성공
 */
router.get('/user/list', UserManagementController.getUsers);

/**
 * @swagger
 * /api/v0/admin/user/{userId}:
 *   get:
 *     summary: 단일 사용자 상세 정보 조회
 *     tags: [Admin - User]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 사용자 정보 반환 성공
 *       404:
 *         description: 사용자를 찾을 수 없음
 */
router.get('/user/:userId', UserManagementController.getUser);

/**
 * @swagger
 * /api/v0/admin/user/{userId}/role:
 *   put:
 *     summary: 사용자 권한(Role) 및 세부 권한 수정
 *     tags: [Admin - User]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [USER, MANAGER, ADMIN]
 *               permissions:
 *                 type: object
 *                 description: 세부 권한 JSON
 *     responses:
 *       200:
 *         description: 권한 수정 성공
 */
// role 변경은 ADMIN 전용 — 전역 authorize(['ADMIN','MANAGER']) 이후 추가 검사로 MANAGER 차단
router.put('/user/:userId/role', authorize(['ADMIN'], { recheckDb: true }), UserManagementController.updateUserRole);

/**
 * @swagger
 * /api/v0/admin/user/{userId}/status:
 *   patch:
 *     summary: 사용자 상태 변경 (ACTIVE / BANNED)
 *     tags: [Admin - User]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, BANNED]
 *     responses:
 *       200:
 *         description: 상태 변경 성공
 *       400:
 *         description: 유효하지 않은 상태값
 *       404:
 *         description: 사용자를 찾을 수 없음
 */
router.patch('/user/:userId/status', UserManagementController.updateUserStatus);

/**
 * @swagger
 * /api/v0/admin/user/{userId}/logs:
 *   get:
 *     summary: 특정 사용자의 활동 로그 조회
 *     tags: [Admin - User]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 활동 로그 반환 성공
 */
router.get('/user/:userId/logs', UserManagementController.getUserLogs);

export default router;
