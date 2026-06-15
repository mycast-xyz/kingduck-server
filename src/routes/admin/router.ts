import express from 'express';
import AdminController from './AdminController';
import CrawlerController from './CrawlerController';
import SystemStatsController from './SystemStatsController';
import UserManagementController from './UserManagementController';
import { authorize } from '../../middleware/auth';

const router = express.Router();

// 모든 Admin 라우트는 ADMIN 권한 필요
router.use(authorize(['ADMIN', 'MANAGER']));

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
router.put('/user/:userId/role', UserManagementController.updateUserRole);

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
