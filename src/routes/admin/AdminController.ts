import { Request, Response } from 'express';
import { prisma } from '../../utils/prisma';
import logger from '../../utils/logger';
import { sendOk } from '../../utils/responseBuilder';
import { clampPage, clampLimit } from '../../utils/pagination';
import UserActivityService from '../../services/UserActivityService';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

// 어드민 변경 작업 감사 로그 — 비차단(실패해도 메인 응답에 영향 없음, logActivity 내부 try/catch).
// userId는 JWT(req.user)에서. details는 { entity, entityId, summary } 계약.
function logAdminActivity(
  req: Request,
  action: string,
  entity: string,
  entityId: number,
  summary: string,
): void {
  const userId = req.user?.userId;
  if (!userId) return;
  void UserActivityService.logActivity(userId, action, { entity, entityId, summary });
}

export class AdminController {
  /**
   * 대시보드 요약 통계 조회
   * GET /api/v0/admin/dashboard/summary
   */
  async getDashboardSummary(_req: Request, res: Response): Promise<void> {
    try {
      const [games, characters, items, events, users, pendingEvents] =
        await Promise.all([
          prisma.game.count(),
          prisma.character.count(),
          prisma.item.count(),
          prisma.calendarEvent.count(),
          prisma.user.count(),
          prisma.calendarEvent.count({ where: { status: 'PENDING' } }),
        ]);

      sendOk(res, { games, characters, items, events, users, pendingEvents });
    } catch (error) {
      logger.error('getDashboardSummary Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '서버 오류가 발생했습니다.' });
    }
  }

  /**
   * 전역 활동(감사) 로그 조회 — UserActivityService.getLogs를 sendOk 봉투로 래핑.
   * GET /api/v0/admin/audit-log?page&limit
   */
  async getAuditLog(req: Request, res: Response): Promise<void> {
    try {
      const page = clampPage(parseInt(req.query.page as string) || 1);
      const limit = clampLimit(parseInt(req.query.limit as string) || 20);

      // userId 생략 = 전역 조회. getLogs는 { logs, pagination } raw 반환 → 봉투로 감싼다.
      const result = await UserActivityService.getLogs(undefined, page, limit);
      sendOk(res, result);
    } catch (error) {
      logger.error('getAuditLog Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '서버 오류가 발생했습니다.' });
    }
  }
  /**
   * 게임 목록 및 통계 조회
   * GET /api/v0/admin/game/list
   */
  async getGameList(req: Request, res: Response): Promise<void> {
    try {
      const games = await prisma.game.findMany({
        select: {
          id: true,
          slug: true,
          name: true,
          iconUrl: true,
        },
        orderBy: { id: 'asc' },
      });

      // N+1 방지(B-H5): 게임마다 count 3회 대신 groupBy 집계 3회로 일괄 조회.
      const [charCounts, itemCounts, elemCounts] = await Promise.all([
        prisma.character.groupBy({ by: ['gameId'], _count: { _all: true } }),
        prisma.item.groupBy({ by: ['gameId'], _count: { _all: true } }),
        prisma.element.groupBy({ by: ['gameId'], _count: { _all: true } }),
      ]);
      const toCountMap = (
        rows: { gameId: number; _count: { _all: number } }[],
      ) => new Map(rows.map((r) => [r.gameId, r._count._all]));
      const charMap = toCountMap(charCounts);
      const itemMap = toCountMap(itemCounts);
      const elemMap = toCountMap(elemCounts);

      const gameList = games.map((game) => ({
        id: game.id,
        slug: game.slug,
        name: game.name,
        iconUrl: game.iconUrl,
        counts: {
          characters: charMap.get(game.id) ?? 0,
          items: itemMap.get(game.id) ?? 0,
          types: elemMap.get(game.id) ?? 0,
        },
      }));

      // 표준 봉투로 통일: items → data (B-M1)
      sendOk(res, gameList);
    } catch (error) {
      logger.error('getGameList Error:', error);
      res.status(500).json({
        resultCode: 500,
        resultMsg: '서버 오류가 발생했습니다.',
      });
    }
  }

  /**
   * 게임 생성 (어드민 직접 등록)
   * POST /api/v0/admin/game
   */
  async createGame(req: Request, res: Response): Promise<void> {
    try {
      const { slug, name, description } = req.body;

      if (!slug || !name) {
        res.status(400).json({
          resultCode: 400,
          resultMsg: '필수 항목(slug, name)을 모두 입력해주세요.',
        });
        return;
      }

      // 빈 문자열은 null로 정규화(updateElement 컨벤션).
      const normStr = (v: unknown): string | null => {
        if (v === undefined || v === null) return null;
        const s = String(v).trim();
        return s.length > 0 ? s : null;
      };

      const game = await prisma.game.create({
        data: {
          slug: String(slug).trim(),
          name: String(name).trim(),
          description: normStr(description),
        },
      });

      res.status(200).json({
        resultCode: 200,
        resultMsg: '게임이 생성되었습니다.',
        data: game,
      });
    } catch (error) {
      // slug @unique 위반
      if ((error as { code?: string }).code === 'P2002') {
        res.status(409).json({
          resultCode: 409,
          resultMsg: '동일 slug 게임이 이미 존재합니다.',
        });
        return;
      }
      logger.error('createGame Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '서버 오류가 발생했습니다.' });
    }
  }

  /**
   * 게임 수정 (어드민) — slug 불변, name/description 부분 머지
   * PUT /api/v0/admin/game/:slug
   */
  async updateGame(req: Request, res: Response): Promise<void> {
    try {
      const slug = String(req.params.slug);

      const existing = await prisma.game.findUnique({ where: { slug } });
      if (!existing) {
        res.status(404).json({ resultCode: 404, resultMsg: '게임을 찾을 수 없습니다.' });
        return;
      }

      const { name, description } = req.body;

      // 빈 문자열은 null로 정규화(updateElement 컨벤션).
      const normStr = (v: unknown): string | null => {
        const s = String(v).trim();
        return s.length > 0 ? s : null;
      };

      const updateData: any = {};
      if (name !== undefined) updateData.name = String(name).trim();
      if (description !== undefined) updateData.description = normStr(description);

      const game = await prisma.game.update({ where: { slug }, data: updateData });

      res.status(200).json({
        resultCode: 200,
        resultMsg: '게임이 수정되었습니다.',
        data: game,
      });
    } catch (error) {
      // slug @unique 위반(이론상 slug 불변이라 발생 어려우나 item과 동일 방어)
      if ((error as { code?: string }).code === 'P2002') {
        res.status(409).json({
          resultCode: 409,
          resultMsg: '동일 slug 게임이 이미 존재합니다.',
        });
        return;
      }
      logger.error('updateGame Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '서버 오류가 발생했습니다.' });
    }
  }

  /**
   * 게임 아이콘 업로드/교체
   * POST /api/v0/admin/game/:slug/icon  (multipart/form-data, field: file)
   * 업로드 이미지를 webp로 변환해 static/logo/{slug}.webp 에 덮어쓰고 icon_url 을 갱신한다.
   * 같은 파일명이라 캐시 무효화를 위해 icon_url 에 ?v=timestamp 를 붙인다.
   */
  async uploadGameIcon(req: Request, res: Response): Promise<void> {
    try {
      const slug = String(req.params.slug);
      const file = (req as Request & { file?: { buffer: Buffer; mimetype: string } }).file;
      if (!file) {
        res.status(400).json({ resultCode: 400, resultMsg: '이미지 파일이 없습니다.' });
        return;
      }
      if (!file.mimetype?.startsWith('image/')) {
        res.status(400).json({ resultCode: 400, resultMsg: '이미지 파일만 업로드할 수 있습니다.' });
        return;
      }

      const game = await prisma.game.findUnique({ where: { slug } });
      if (!game) {
        res.status(404).json({ resultCode: 404, resultMsg: '게임을 찾을 수 없습니다.' });
        return;
      }

      // static/logo/{slug}.webp 로 저장(express '/assets' → 'static' 매핑과 일치).
      const dir = path.join(process.cwd(), 'static', 'logo');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      await sharp(file.buffer).webp({ quality: 90 }).toFile(path.join(dir, `${slug}.webp`));

      // 캐시 무효화용 버전 쿼리.
      const iconUrl = `assets/logo/${slug}.webp?v=${Date.now()}`;
      const updated = await prisma.game.update({ where: { slug }, data: { iconUrl } });
      logger.info(`Game icon updated: ${slug} → ${iconUrl}`);
      sendOk(res, { slug, iconUrl: updated.iconUrl });
    } catch (error) {
      logger.error('uploadGameIcon Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '아이콘 업로드에 실패했습니다.' });
    }
  }

  // 게임 등급별 카드 색상 저장(JSON). 코드 기본값 위에 머지되어 리스트 카드에 반영.
  async updateRarityColors(req: Request, res: Response): Promise<void> {
    try {
      const slug = String(req.params.slug);
      const rarityColors = req.body?.rarityColors;
      if (rarityColors === undefined) {
        res.status(400).json({ resultCode: 400, resultMsg: 'rarityColors가 필요합니다.' });
        return;
      }
      const game = await prisma.game.findUnique({ where: { slug } });
      if (!game) {
        res.status(404).json({ resultCode: 404, resultMsg: '게임을 찾을 수 없습니다.' });
        return;
      }
      const updated = await prisma.game.update({
        where: { slug },
        data: { rarityColors: rarityColors ?? null },
      });
      logger.info(`Rarity colors updated: ${slug}`);
      sendOk(res, { slug, rarityColors: updated.rarityColors });
    } catch (error) {
      logger.error('updateRarityColors Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '등급 색상 저장에 실패했습니다.' });
    }
  }

  // 등급 표시 방식 저장 { mode:'stars'|'image', images:{tier:url} }.
  async updateRarityDisplay(req: Request, res: Response): Promise<void> {
    try {
      const slug = String(req.params.slug);
      const rarityDisplay = req.body?.rarityDisplay;
      if (rarityDisplay === undefined) {
        res.status(400).json({ resultCode: 400, resultMsg: 'rarityDisplay가 필요합니다.' });
        return;
      }
      const game = await prisma.game.findUnique({ where: { slug } });
      if (!game) {
        res.status(404).json({ resultCode: 404, resultMsg: '게임을 찾을 수 없습니다.' });
        return;
      }
      const updated = await prisma.game.update({
        where: { slug },
        data: { rarityDisplay: rarityDisplay ?? null },
      });
      logger.info(`Rarity display updated: ${slug}`);
      sendOk(res, { slug, rarityDisplay: updated.rarityDisplay });
    } catch (error) {
      logger.error('updateRarityDisplay Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '등급 표시 설정 저장에 실패했습니다.' });
    }
  }

  // 등급 티어 이미지 업로드(예: 니케 SSR 뱃지) → static 저장 + rarity_display.images[tier] 갱신.
  async uploadRarityImage(req: Request, res: Response): Promise<void> {
    try {
      const slug = String(req.params.slug);
      const tier = String(req.params.tier);
      const file = (req as Request & { file?: { buffer: Buffer; mimetype: string } }).file;
      if (!file) {
        res.status(400).json({ resultCode: 400, resultMsg: '이미지 파일이 없습니다.' });
        return;
      }
      if (!file.mimetype?.startsWith('image/')) {
        res.status(400).json({ resultCode: 400, resultMsg: '이미지 파일만 업로드할 수 있습니다.' });
        return;
      }
      const game = await prisma.game.findUnique({ where: { slug } });
      if (!game) {
        res.status(404).json({ resultCode: 404, resultMsg: '게임을 찾을 수 없습니다.' });
        return;
      }
      const dir = path.join(process.cwd(), 'static', 'image', slug, 'rarity');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      await sharp(file.buffer).webp({ quality: 90 }).toFile(path.join(dir, `${tier}.webp`));
      const url = `assets/image/${slug}/rarity/${tier}.webp?v=${Date.now()}`;

      // 기존 rarityDisplay에 images[tier] 머지(없으면 mode=image로 시작).
      const cur = (game.rarityDisplay as { mode?: string; images?: Record<string, string> }) || {};
      const rarityDisplay = {
        ...cur,
        mode: cur.mode || 'image',
        images: { ...(cur.images || {}), [tier]: url },
      };
      const updated = await prisma.game.update({ where: { slug }, data: { rarityDisplay } });
      logger.info(`Rarity image uploaded: ${slug}/${tier} → ${url}`);
      sendOk(res, { slug, tier, url, rarityDisplay: updated.rarityDisplay });
    } catch (error) {
      logger.error('uploadRarityImage Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '등급 이미지 업로드에 실패했습니다.' });
    }
  }

  // 게임별 속성/특성(Element) 목록 — 어드민 아이콘 관리 화면용.
  async getElementList(req: Request, res: Response): Promise<void> {
    try {
      const slug = String(req.query.slug || '');
      const game = await prisma.game.findUnique({ where: { slug } });
      if (!game) {
        res.status(404).json({ resultCode: 404, resultMsg: '게임을 찾을 수 없습니다.' });
        return;
      }
      const elements = await prisma.element.findMany({
        where: { gameId: game.id },
        select: { id: true, name: true, displayName: true, color: true, type: true, iconUrl: true },
        orderBy: [{ type: 'asc' }, { id: 'asc' }],
      });
      sendOk(res, { slug, elements });
    } catch (error) {
      logger.error('getElementList Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '속성 목록 조회에 실패했습니다.' });
    }
  }

  // 속성/특성(Element) 수정 — 한글 표시명/원색(틴트). 보낸 필드만 갱신(빈 문자열은 해제=null).
  async updateElement(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!id) {
        res.status(400).json({ resultCode: 400, resultMsg: '잘못된 id 입니다.' });
        return;
      }
      const data: { displayName?: string | null; color?: string | null } = {};
      if (req.body?.displayName !== undefined) {
        const v = String(req.body.displayName).trim();
        data.displayName = v.length > 0 ? v : null;
      }
      if (req.body?.color !== undefined) {
        const v = String(req.body.color).trim();
        data.color = v.length > 0 ? v : null; // 예: "#e0533d"
      }
      const updated = await prisma.element.update({
        where: { id },
        data,
        select: { id: true, name: true, displayName: true, color: true, type: true, iconUrl: true },
      });
      logger.info(`Element updated: #${id} ${JSON.stringify(data)}`);
      sendOk(res, updated);
    } catch (error) {
      logger.error('updateElement Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '속성 저장에 실패했습니다.' });
    }
  }

  // 속성/특성(Element) 아이콘 업로드/교체 — uploadGameIcon과 동형(sharp→webp→static→iconUrl).
  async uploadElementIcon(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(String(req.params.id), 10);
      const file = (req as Request & { file?: { buffer: Buffer; mimetype: string } }).file;
      if (!id) {
        res.status(400).json({ resultCode: 400, resultMsg: '잘못된 id 입니다.' });
        return;
      }
      if (!file) {
        res.status(400).json({ resultCode: 400, resultMsg: '이미지 파일이 없습니다.' });
        return;
      }
      if (!file.mimetype?.startsWith('image/')) {
        res.status(400).json({ resultCode: 400, resultMsg: '이미지 파일만 업로드할 수 있습니다.' });
        return;
      }

      const element = await prisma.element.findUnique({
        where: { id },
        include: { game: true },
      });
      if (!element) {
        res.status(404).json({ resultCode: 404, resultMsg: '속성을 찾을 수 없습니다.' });
        return;
      }

      const slug = element.game.slug;
      // static/image/{slug}/element/{id}.webp (express '/assets' → 'static'). id로 파일명 → 이름 특수문자 회피.
      const dir = path.join(process.cwd(), 'static', 'image', slug, 'element');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      await sharp(file.buffer).webp({ quality: 90 }).toFile(path.join(dir, `${id}.webp`));

      const iconUrl = `assets/image/${slug}/element/${id}.webp?v=${Date.now()}`;
      const updated = await prisma.element.update({ where: { id }, data: { iconUrl } });
      logger.info(
        `Element icon updated: ${slug}/${element.type}/${element.name} (#${id}) → ${iconUrl}`,
      );
      sendOk(res, { id, iconUrl: updated.iconUrl });
    } catch (error) {
      logger.error('uploadElementIcon Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '아이콘 업로드에 실패했습니다.' });
    }
  }
  /**
   * 캐릭터 목록 조회 (페이지네이션, 검색)
   * GET /api/v0/admin/character/list
   */
  async getCharacterList(req: Request, res: Response): Promise<void> {
    try {
      const page = clampPage(parseInt(req.query.page as string) || 1);
      const limit = clampLimit(parseInt(req.query.limit as string) || 10);
      const gameId = req.query.gameId
        ? parseInt(req.query.gameId as string)
        : undefined;
      const name = req.query.name as string;

      const skip = (page - 1) * limit;

      const where: any = {};
      if (gameId) where.gameId = gameId;
      if (name) where.name = { contains: name, mode: 'insensitive' };

      const [total, items] = await Promise.all([
        prisma.character.count({ where }),
        prisma.character.findMany({
          where,
          skip,
          take: limit,
          orderBy: { id: 'desc' }, // 최신순
          include: {
            game: { select: { id: true, name: true, slug: true } },
            element: { select: { id: true, name: true } },
          },
        }),
      ]);

      res.status(200).json({
        resultCode: 200,
        resultMsg: '성공',
        data: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          items,
        },
      });
    } catch (error) {
      logger.error('getCharacterList Error:', error);
      res.status(500).json({
        resultCode: 500,
        resultMsg: '서버 오류가 발생했습니다.',
      });
    }
  }

  /**
   * 캐릭터 생성 (어드민 직접 등록) — createItem 미러링
   * POST /api/v0/admin/character
   */
  async createCharacter(req: Request, res: Response): Promise<void> {
    try {
      const {
        gameId,
        name,
        rarity,
        elementId,
        pathId,
        weaponType,
        role,
        originalId,
        description,
        imageUrl,
        metadata,
      } = req.body;

      // Character 모델 NOT NULL/관계 필수 컬럼은 gameId, name 둘뿐(나머지 nullable).
      if (!gameId || !name) {
        res.status(400).json({
          resultCode: 400,
          resultMsg: '필수 항목(gameId, name)을 모두 입력해주세요.',
        });
        return;
      }

      // 빈 문자열은 null로 정규화(updateElement 컨벤션) — originalId가 ''이면 unique 충돌 회피.
      const normStr = (v: unknown): string | null => {
        if (v === undefined || v === null) return null;
        const s = String(v).trim();
        return s.length > 0 ? s : null;
      };
      const normInt = (v: unknown): number | null =>
        v !== undefined && v !== null && v !== '' ? parseInt(String(v)) : null;

      const character = await prisma.character.create({
        data: {
          gameId: parseInt(String(gameId)),
          name: String(name),
          rarity: normInt(rarity),
          elementId: normInt(elementId),
          pathId: normInt(pathId),
          weaponType: normStr(weaponType),
          role: normStr(role),
          originalId: normStr(originalId),
          description: normStr(description),
          imageUrl: normStr(imageUrl),
          metadata: metadata ?? undefined,
        },
        include: {
          game: { select: { id: true, name: true, slug: true } },
        },
      });

      logAdminActivity(
        req,
        'CHARACTER_CREATE',
        'character',
        character.id,
        `캐릭터 '${character.name}' 생성(${character.game.slug})`,
      );

      res.status(200).json({
        resultCode: 200,
        resultMsg: '캐릭터가 생성되었습니다.',
        data: character,
      });
    } catch (error) {
      // @@unique([gameId, originalId]) 위반 (B-H4b)
      if ((error as { code?: string }).code === 'P2002') {
        res.status(409).json({
          resultCode: 409,
          resultMsg: '동일 gameId + originalId 캐릭터가 이미 존재합니다.',
        });
        return;
      }
      logger.error('createCharacter Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '서버 오류가 발생했습니다.' });
    }
  }

  /**
   * 캐릭터 수정 (어드민) — updateItem 미러링, !==undefined 필드만 머지
   * PUT /api/v0/admin/character/:id
   */
  async updateCharacter(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!id) {
        res.status(400).json({ resultCode: 400, resultMsg: '잘못된 id 입니다.' });
        return;
      }

      const existing = await prisma.character.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({ resultCode: 404, resultMsg: '캐릭터를 찾을 수 없습니다.' });
        return;
      }

      const {
        gameId,
        name,
        rarity,
        elementId,
        pathId,
        weaponType,
        role,
        originalId,
        description,
        imageUrl,
        metadata,
      } = req.body;

      // 빈 문자열은 null로 정규화(updateElement 컨벤션).
      const normStr = (v: unknown): string | null => {
        const s = String(v).trim();
        return s.length > 0 ? s : null;
      };
      const normInt = (v: unknown): number | null =>
        v === null || v === '' ? null : parseInt(String(v));

      const updateData: any = {};
      if (gameId !== undefined) updateData.gameId = parseInt(String(gameId));
      if (name !== undefined) updateData.name = String(name);
      if (rarity !== undefined) updateData.rarity = normInt(rarity);
      if (elementId !== undefined) updateData.elementId = normInt(elementId);
      if (pathId !== undefined) updateData.pathId = normInt(pathId);
      if (weaponType !== undefined) updateData.weaponType = normStr(weaponType);
      if (role !== undefined) updateData.role = normStr(role);
      if (originalId !== undefined) updateData.originalId = normStr(originalId);
      if (description !== undefined) updateData.description = normStr(description);
      if (imageUrl !== undefined) updateData.imageUrl = normStr(imageUrl);
      if (metadata !== undefined) updateData.metadata = metadata;

      const character = await prisma.character.update({
        where: { id },
        data: updateData,
        include: {
          game: { select: { id: true, name: true, slug: true } },
        },
      });

      logAdminActivity(
        req,
        'CHARACTER_UPDATE',
        'character',
        character.id,
        `캐릭터 '${character.name}' 수정(${character.game.slug})`,
      );

      res.status(200).json({
        resultCode: 200,
        resultMsg: '캐릭터가 수정되었습니다.',
        data: character,
      });
    } catch (error) {
      // @@unique([gameId, originalId]) 위반 (B-H4b)
      if ((error as { code?: string }).code === 'P2002') {
        res.status(409).json({
          resultCode: 409,
          resultMsg: '동일 gameId + originalId 캐릭터가 이미 존재합니다.',
        });
        return;
      }
      logger.error('updateCharacter Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '서버 오류가 발생했습니다.' });
    }
  }

  /**
   * 캐릭터 삭제 (어드민) — deleteItem 미러링
   * DELETE /api/v0/admin/character/:id
   */
  async deleteCharacter(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!id) {
        res.status(400).json({ resultCode: 400, resultMsg: '잘못된 id 입니다.' });
        return;
      }

      const existing = await prisma.character.findUnique({
        where: { id },
        include: { game: { select: { slug: true } } },
      });
      if (!existing) {
        res.status(404).json({ resultCode: 404, resultMsg: '캐릭터를 찾을 수 없습니다.' });
        return;
      }

      await prisma.character.delete({ where: { id } });

      logAdminActivity(
        req,
        'CHARACTER_DELETE',
        'character',
        id,
        `캐릭터 '${existing.name}' 삭제(${existing.game.slug})`,
      );

      res.status(200).json({
        resultCode: 200,
        resultMsg: '캐릭터가 삭제되었습니다.',
      });
    } catch (error) {
      // FK 제약(영상 등 이 캐릭터를 참조)으로 삭제 불가 (P2003)
      if ((error as { code?: string }).code === 'P2003') {
        res.status(409).json({
          resultCode: 409,
          resultMsg: '이 캐릭터를 참조하는 데이터가 있어 삭제할 수 없습니다.',
        });
        return;
      }
      logger.error('deleteCharacter Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '서버 오류가 발생했습니다.' });
    }
  }

  /**
   * 캐릭터 이미지 업로드/교체 — uploadItemImage와 동형(sharp→webp→static→imageUrl).
   * POST /api/v0/admin/character/:id/image  (multipart/form-data, field: file)
   */
  async uploadCharacterImage(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(String(req.params.id), 10);
      const file = (req as Request & { file?: { buffer: Buffer; mimetype: string } }).file;
      if (!id) {
        res.status(400).json({ resultCode: 400, resultMsg: '잘못된 id 입니다.' });
        return;
      }
      if (!file) {
        res.status(400).json({ resultCode: 400, resultMsg: '이미지 파일이 없습니다.' });
        return;
      }
      if (!file.mimetype?.startsWith('image/')) {
        res.status(400).json({ resultCode: 400, resultMsg: '이미지 파일만 업로드할 수 있습니다.' });
        return;
      }

      const character = await prisma.character.findUnique({
        where: { id },
        include: { game: true },
      });
      if (!character) {
        res.status(404).json({ resultCode: 404, resultMsg: '캐릭터를 찾을 수 없습니다.' });
        return;
      }

      const slug = character.game.slug;
      // static/image/{slug}/character/{id}.webp (express '/assets' → 'static'). id로 파일명 → 이름 특수문자 회피.
      const dir = path.join(process.cwd(), 'static', 'image', slug, 'character');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      await sharp(file.buffer).webp({ quality: 90 }).toFile(path.join(dir, `${id}.webp`));

      const imageUrl = `assets/image/${slug}/character/${id}.webp?v=${Date.now()}`;
      await prisma.character.update({ where: { id }, data: { imageUrl } });
      logger.info(`Character image updated: ${slug}/${character.name} (#${id}) → ${imageUrl}`);
      sendOk(res, { id, imageUrl });
    } catch (error) {
      logger.error('uploadCharacterImage Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '아이콘 업로드에 실패했습니다.' });
    }
  }

  /**
   * 데이터 공백(누락) 목록 — 크롤이 채우지 못한 캐릭터를 게임별로 집계.
   * metadata.dataGaps(크롤 시점 감지)가 비어있지 않은 캐릭터 = "나중에 재크롤 필요".
   * GET /api/v0/admin/data-gaps
   */
  async getDataGaps(_req: Request, res: Response): Promise<void> {
    try {
      const rows = await prisma.$queryRaw<
        Array<{
          slug: string;
          gameName: string;
          id: number;
          name: string;
          originalId: string | null;
          gaps: string[];
        }>
      >`
        SELECT g.slug, g.name AS "gameName", c.id, c.name,
               c.original_id AS "originalId", c.metadata->'dataGaps' AS gaps
        FROM characters c JOIN games g ON c.game_id = g.id
        WHERE jsonb_array_length(COALESCE(c.metadata->'dataGaps', '[]'::jsonb)) > 0
        ORDER BY g.slug, c.id
      `;
      const totals = await prisma.$queryRaw<
        Array<{ slug: string; total: number }>
      >`
        SELECT g.slug, COUNT(*)::int AS total
        FROM characters c JOIN games g ON c.game_id = g.id
        GROUP BY g.slug
      `;
      const totalMap = new Map(totals.map((t) => [t.slug, Number(t.total)]));

      const byGame = new Map<
        string,
        {
          slug: string;
          gameName: string;
          total: number;
          items: { name: string; originalId: string | null; missing: string[] }[];
        }
      >();
      for (const r of rows) {
        if (!byGame.has(r.slug)) {
          byGame.set(r.slug, {
            slug: r.slug,
            gameName: r.gameName,
            total: totalMap.get(r.slug) || 0,
            items: [],
          });
        }
        byGame.get(r.slug)!.items.push({
          name: r.name,
          originalId: r.originalId,
          missing: Array.isArray(r.gaps) ? r.gaps : [],
        });
      }
      const games = [...byGame.values()].map((g) => ({
        ...g,
        gapCount: g.items.length,
        completeness: g.total
          ? Math.round(((g.total - g.items.length) / g.total) * 100)
          : 100,
      }));
      sendOk(res, { games });
    } catch (error) {
      logger.error('getDataGaps Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '서버 오류' });
    }
  }

  /**
   * 아이템 목록 조회 (페이지네이션, 검색)
   * GET /api/v0/admin/item/list
   */
  async getItemList(req: Request, res: Response): Promise<void> {
    try {
      const page = clampPage(parseInt(req.query.page as string) || 1);
      const limit = clampLimit(parseInt(req.query.limit as string) || 10);
      const gameId = req.query.gameId
        ? parseInt(req.query.gameId as string)
        : undefined;
      const type = req.query.type as string;
      const name = req.query.name as string;

      const skip = (page - 1) * limit;

      const where: any = {};
      if (gameId) where.gameId = gameId;
      if (type) where.type = type;
      if (name) where.name = { contains: name, mode: 'insensitive' };

      const [total, items] = await Promise.all([
        prisma.item.count({ where }),
        prisma.item.findMany({
          where,
          skip,
          take: limit,
          orderBy: { id: 'desc' },
          include: {
            game: { select: { id: true, name: true, slug: true } },
          },
        }),
      ]);

      res.status(200).json({
        resultCode: 200,
        resultMsg: '성공',
        data: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          items,
        },
      });
    } catch (error) {
      logger.error('getItemList Error:', error);
      res.status(500).json({
        resultCode: 500,
        resultMsg: '서버 오류가 발생했습니다.',
      });
    }
  }

  /**
   * 아이템 상세 조회
   * GET /api/v0/admin/item/:id
   */
  async getItemDetail(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!id) {
        res.status(400).json({ resultCode: 400, resultMsg: '잘못된 id 입니다.' });
        return;
      }

      const item = await prisma.item.findUnique({
        where: { id },
        include: {
          game: { select: { id: true, name: true, slug: true } },
        },
      });

      if (!item) {
        res.status(404).json({ resultCode: 404, resultMsg: '아이템을 찾을 수 없습니다.' });
        return;
      }

      sendOk(res, item);
    } catch (error) {
      logger.error('getItemDetail Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '서버 오류가 발생했습니다.' });
    }
  }

  /**
   * 아이템 생성 (어드민 직접 등록)
   * POST /api/v0/admin/item
   */
  async createItem(req: Request, res: Response): Promise<void> {
    try {
      const { gameId, name, type, rarity, originalId, description, imageUrl, metadata } = req.body;

      if (!gameId || !name || !type) {
        res.status(400).json({
          resultCode: 400,
          resultMsg: '필수 항목(gameId, name, type)을 모두 입력해주세요.',
        });
        return;
      }

      // 빈 문자열은 null로 정규화(updateElement 컨벤션) — originalId가 ''이면 unique 충돌 회피.
      const normStr = (v: unknown): string | null => {
        if (v === undefined || v === null) return null;
        const s = String(v).trim();
        return s.length > 0 ? s : null;
      };

      const item = await prisma.item.create({
        data: {
          gameId: parseInt(String(gameId)),
          name: String(name),
          type: String(type),
          rarity: rarity !== undefined && rarity !== null && rarity !== '' ? parseInt(String(rarity)) : null,
          originalId: normStr(originalId),
          description: normStr(description),
          imageUrl: normStr(imageUrl),
          metadata: metadata ?? undefined,
        },
        include: {
          game: { select: { id: true, name: true, slug: true } },
        },
      });

      logAdminActivity(
        req,
        'ITEM_CREATE',
        'item',
        item.id,
        `아이템 '${item.name}' 생성(${item.game.slug})`,
      );

      res.status(200).json({
        resultCode: 200,
        resultMsg: '아이템이 생성되었습니다.',
        data: item,
      });
    } catch (error) {
      // @@unique([gameId, type, originalId]) 위반 (B-H4b)
      if ((error as { code?: string }).code === 'P2002') {
        res.status(409).json({
          resultCode: 409,
          resultMsg: '동일 gameId + type + originalId 아이템이 이미 존재합니다.',
        });
        return;
      }
      logger.error('createItem Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '서버 오류가 발생했습니다.' });
    }
  }

  /**
   * 아이템 수정 (어드민)
   * PUT /api/v0/admin/item/:id
   */
  async updateItem(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!id) {
        res.status(400).json({ resultCode: 400, resultMsg: '잘못된 id 입니다.' });
        return;
      }

      const existing = await prisma.item.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({ resultCode: 404, resultMsg: '아이템을 찾을 수 없습니다.' });
        return;
      }

      const { gameId, name, type, rarity, originalId, description, imageUrl, metadata } = req.body;

      // 빈 문자열은 null로 정규화(updateElement 컨벤션).
      const normStr = (v: unknown): string | null => {
        const s = String(v).trim();
        return s.length > 0 ? s : null;
      };

      const updateData: any = {};
      if (gameId !== undefined) updateData.gameId = parseInt(String(gameId));
      if (name !== undefined) updateData.name = String(name);
      if (type !== undefined) updateData.type = String(type);
      if (rarity !== undefined) {
        updateData.rarity = rarity === null || rarity === '' ? null : parseInt(String(rarity));
      }
      if (originalId !== undefined) updateData.originalId = normStr(originalId);
      if (description !== undefined) updateData.description = normStr(description);
      if (imageUrl !== undefined) updateData.imageUrl = normStr(imageUrl);
      if (metadata !== undefined) updateData.metadata = metadata;

      const item = await prisma.item.update({
        where: { id },
        data: updateData,
        include: {
          game: { select: { id: true, name: true, slug: true } },
        },
      });

      logAdminActivity(
        req,
        'ITEM_UPDATE',
        'item',
        item.id,
        `아이템 '${item.name}' 수정(${item.game.slug})`,
      );

      res.status(200).json({
        resultCode: 200,
        resultMsg: '아이템이 수정되었습니다.',
        data: item,
      });
    } catch (error) {
      // @@unique([gameId, type, originalId]) 위반 (B-H4b)
      if ((error as { code?: string }).code === 'P2002') {
        res.status(409).json({
          resultCode: 409,
          resultMsg: '동일 gameId + type + originalId 아이템이 이미 존재합니다.',
        });
        return;
      }
      logger.error('updateItem Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '서버 오류가 발생했습니다.' });
    }
  }

  /**
   * 아이템 삭제 (어드민)
   * DELETE /api/v0/admin/item/:id
   */
  async deleteItem(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!id) {
        res.status(400).json({ resultCode: 400, resultMsg: '잘못된 id 입니다.' });
        return;
      }

      const existing = await prisma.item.findUnique({
        where: { id },
        include: { game: { select: { slug: true } } },
      });
      if (!existing) {
        res.status(404).json({ resultCode: 404, resultMsg: '아이템을 찾을 수 없습니다.' });
        return;
      }

      await prisma.item.delete({ where: { id } });

      logAdminActivity(
        req,
        'ITEM_DELETE',
        'item',
        id,
        `아이템 '${existing.name}' 삭제(${existing.game.slug})`,
      );

      res.status(200).json({
        resultCode: 200,
        resultMsg: '아이템이 삭제되었습니다.',
      });
    } catch (error) {
      logger.error('deleteItem Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '서버 오류가 발생했습니다.' });
    }
  }

  /**
   * 아이템 이미지 업로드/교체 — uploadElementIcon과 동형(sharp→webp→static→imageUrl).
   * POST /api/v0/admin/item/:id/image  (multipart/form-data, field: file)
   */
  async uploadItemImage(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(String(req.params.id), 10);
      const file = (req as Request & { file?: { buffer: Buffer; mimetype: string } }).file;
      if (!id) {
        res.status(400).json({ resultCode: 400, resultMsg: '잘못된 id 입니다.' });
        return;
      }
      if (!file) {
        res.status(400).json({ resultCode: 400, resultMsg: '이미지 파일이 없습니다.' });
        return;
      }
      if (!file.mimetype?.startsWith('image/')) {
        res.status(400).json({ resultCode: 400, resultMsg: '이미지 파일만 업로드할 수 있습니다.' });
        return;
      }

      const item = await prisma.item.findUnique({
        where: { id },
        include: { game: true },
      });
      if (!item) {
        res.status(404).json({ resultCode: 404, resultMsg: '아이템을 찾을 수 없습니다.' });
        return;
      }

      const slug = item.game.slug;
      // static/image/{slug}/item/{id}.webp (express '/assets' → 'static'). id로 파일명 → 이름 특수문자 회피.
      const dir = path.join(process.cwd(), 'static', 'image', slug, 'item');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      await sharp(file.buffer).webp({ quality: 90 }).toFile(path.join(dir, `${id}.webp`));

      const imageUrl = `assets/image/${slug}/item/${id}.webp?v=${Date.now()}`;
      await prisma.item.update({ where: { id }, data: { imageUrl } });
      logger.info(`Item image updated: ${slug}/${item.type}/${item.name} (#${id}) → ${imageUrl}`);
      sendOk(res, { id, imageUrl });
    } catch (error) {
      logger.error('uploadItemImage Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '아이콘 업로드에 실패했습니다.' });
    }
  }

  /**
   * 이벤트/가챠 목록 조회 (페이지네이션, 검색, 필터)
   * GET /api/v0/admin/event/list
   */
  async getEventList(req: Request, res: Response): Promise<void> {
    try {
      const page = clampPage(parseInt(req.query.page as string) || 1);
      const limit = clampLimit(parseInt(req.query.limit as string) || 20);
      const gameId = req.query.gameId
        ? parseInt(req.query.gameId as string)
        : undefined;
      const type = req.query.type as string;
      const title = (req.query.title || req.query.name) as string;

      const skip = (page - 1) * limit;

      const where: any = {};
      if (gameId) where.gameId = gameId;
      if (type) where.type = type;
      if (title) where.title = { contains: title, mode: 'insensitive' };

      const [total, items] = await Promise.all([
        prisma.calendarEvent.count({ where }),
        prisma.calendarEvent.findMany({
          where,
          skip,
          take: limit,
          orderBy: { startTime: 'desc' }, // 최신순
          include: {
            game: { select: { id: true, name: true, slug: true } },
          },
        }),
      ]);

      res.status(200).json({
        resultCode: 200,
        resultMsg: '성공',
        data: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          items,
        },
      });
    } catch (error) {
      logger.error('getEventList Error:', error);
      res.status(500).json({
        resultCode: 500,
        resultMsg: '서버 오류가 발생했습니다.',
      });
    }
  }

  /**
   * 승인 대기 중인 이벤트 조회
   * GET /api/v0/admin/event/pending
   */
  async getPendingEvents(req: Request, res: Response): Promise<void> {
    try {
      const page = clampPage(parseInt(req.query.page as string) || 1);
      const limit = clampLimit(parseInt(req.query.limit as string) || 20);
      const gameId = req.query.gameId
        ? parseInt(req.query.gameId as string)
        : undefined;

      const skip = (page - 1) * limit;

      const where: any = { status: 'PENDING' };
      if (gameId) where.gameId = gameId;

      const [total, items] = await Promise.all([
        prisma.calendarEvent.count({ where }),
        prisma.calendarEvent.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            game: { select: { id: true, name: true, slug: true } },
          },
        }),
      ]);

      res.status(200).json({
        resultCode: 200,
        resultMsg: '성공',
        data: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          items,
        },
      });
    } catch (error) {
      logger.error('getPendingEvents Error:', error);
      res.status(500).json({
        resultCode: 500,
        resultMsg: '서버 오류가 발생했습니다.',
      });
    }
  }

  /**
   * 이벤트 승인
   * POST /api/v0/admin/event/approve/:id
   */
  async approveEvent(req: Request, res: Response): Promise<void> {
    try {
      const eventId = parseInt(String(req.params.id));
      const { edits } = req.body;
      const userId = req.user?.userId; // auth middleware에서 설정된 user (DecodedToken.userId)

      if (!eventId) {
        res.status(400).json({
          resultCode: 400,
          resultMsg: 'eventId가 필요합니다.',
        });
        return;
      }

      // 수정사항 적용
      const updateData: any = {
        status: 'APPROVED',
        reviewedBy: userId,
        reviewedAt: new Date(),
      };

      if (edits) {
        if (edits.title) updateData.title = edits.title;
        if (edits.startTime) updateData.startTime = new Date(edits.startTime);
        if (edits.endTime) updateData.endTime = new Date(edits.endTime);
        if (edits.imageUrl) updateData.imageUrl = edits.imageUrl;
        if (edits.officialLink) updateData.officialLink = edits.officialLink;
        if (edits.metadata) updateData.metadata = edits.metadata;
      }

      // PENDING 상태인 경우에만 원자적으로 업데이트 (동시 승인 시 이중 처리 방지)
      const result = await prisma.calendarEvent.updateMany({
        where: { id: eventId, status: 'PENDING' },
        data: updateData,
      });

      if (result.count === 0) {
        const existing = await prisma.calendarEvent.findUnique({
          where: { id: eventId },
        });
        if (!existing) {
          res.status(404).json({
            resultCode: 404,
            resultMsg: '이벤트를 찾을 수 없습니다.',
          });
        } else {
          res.status(409).json({
            resultCode: 409,
            resultMsg: '이미 처리된 이벤트입니다.',
          });
        }
        return;
      }

      const updatedEvent = await prisma.calendarEvent.findUnique({
        where: { id: eventId },
      });

      logAdminActivity(
        req,
        'EVENT_APPROVE',
        'event',
        eventId,
        `이벤트 '${updatedEvent?.title ?? eventId}' 승인`,
      );

      res.status(200).json({
        resultCode: 200,
        resultMsg: '이벤트가 승인되었습니다.',
        data: updatedEvent,
      });
    } catch (error) {
      logger.error('approveEvent Error:', error);
      res.status(500).json({
        resultCode: 500,
        resultMsg: '서버 오류가 발생했습니다.',
      });
    }
  }

  /**
   * 이벤트 생성 (어드민 직접 등록)
   * POST /api/v0/admin/event
   */
  async createEvent(req: Request, res: Response): Promise<void> {
    try {
      const { gameId, title, type, startTime, endTime, image, officialLink, description, characterName } = req.body;

      if (!gameId || !title || !type || !startTime || !endTime) {
        res.status(400).json({
          resultCode: 400,
          resultMsg: '필수 항목(gameId, title, type, startTime, endTime)을 모두 입력해주세요.',
        });
        return;
      }

      const metadata: Record<string, string> = {};
      if (description) metadata.description = description;
      if (characterName) metadata.characterName = characterName;

      const event = await prisma.calendarEvent.create({
        data: {
          gameId: parseInt(String(gameId)),
          title,
          type,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          imageUrl: image || null,
          officialLink: officialLink || null,
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
          status: 'APPROVED',
        },
        include: {
          game: { select: { id: true, name: true, slug: true } },
        },
      });

      logAdminActivity(
        req,
        'EVENT_CREATE',
        'event',
        event.id,
        `이벤트 '${event.title}' 생성(${event.game.slug})`,
      );

      res.status(200).json({
        resultCode: 200,
        resultMsg: '이벤트가 생성되었습니다.',
        data: event,
      });
    } catch (error) {
      logger.error('createEvent Error:', error);
      res.status(500).json({
        resultCode: 500,
        resultMsg: '서버 오류가 발생했습니다.',
      });
    }
  }

  /**
   * 이벤트 수정 (어드민)
   * PUT /api/v0/admin/event/:id
   */
  async updateEvent(req: Request, res: Response): Promise<void> {
    try {
      const eventId = parseInt(String(req.params.id));

      if (!eventId) {
        res.status(400).json({
          resultCode: 400,
          resultMsg: 'eventId가 필요합니다.',
        });
        return;
      }

      const existing = await prisma.calendarEvent.findUnique({
        where: { id: eventId },
      });

      if (!existing) {
        res.status(404).json({
          resultCode: 404,
          resultMsg: '이벤트를 찾을 수 없습니다.',
        });
        return;
      }

      const { gameId, title, type, startTime, endTime, image, officialLink, description, characterName } = req.body;

      const updateData: any = {};
      if (gameId !== undefined) updateData.gameId = parseInt(String(gameId));
      if (title !== undefined) updateData.title = title;
      if (type !== undefined) updateData.type = type;
      if (startTime !== undefined) updateData.startTime = new Date(startTime);
      if (endTime !== undefined) updateData.endTime = new Date(endTime);
      if (image !== undefined) updateData.imageUrl = image || null;
      if (officialLink !== undefined) updateData.officialLink = officialLink || null;

      // description / characterName 은 스키마에 없으므로 metadata 에 병합
      if (description !== undefined || characterName !== undefined) {
        const existingMeta = (existing.metadata as Record<string, string>) || {};
        if (description !== undefined) existingMeta.description = description;
        if (characterName !== undefined) existingMeta.characterName = characterName;
        updateData.metadata = existingMeta;
      }

      const updatedEvent = await prisma.calendarEvent.update({
        where: { id: eventId },
        data: updateData,
        include: {
          game: { select: { id: true, name: true, slug: true } },
        },
      });

      logAdminActivity(
        req,
        'EVENT_UPDATE',
        'event',
        updatedEvent.id,
        `이벤트 '${updatedEvent.title}' 수정(${updatedEvent.game.slug})`,
      );

      res.status(200).json({
        resultCode: 200,
        resultMsg: '이벤트가 수정되었습니다.',
        data: updatedEvent,
      });
    } catch (error) {
      logger.error('updateEvent Error:', error);
      res.status(500).json({
        resultCode: 500,
        resultMsg: '서버 오류가 발생했습니다.',
      });
    }
  }

  /**
   * 이벤트 삭제 (어드민)
   * DELETE /api/v0/admin/event/:id
   */
  async deleteEvent(req: Request, res: Response): Promise<void> {
    try {
      const eventId = parseInt(String(req.params.id));

      if (!eventId) {
        res.status(400).json({
          resultCode: 400,
          resultMsg: 'eventId가 필요합니다.',
        });
        return;
      }

      const existing = await prisma.calendarEvent.findUnique({
        where: { id: eventId },
        include: { game: { select: { slug: true } } },
      });

      if (!existing) {
        res.status(404).json({
          resultCode: 404,
          resultMsg: '이벤트를 찾을 수 없습니다.',
        });
        return;
      }

      await prisma.calendarEvent.delete({
        where: { id: eventId },
      });

      logAdminActivity(
        req,
        'EVENT_DELETE',
        'event',
        eventId,
        `이벤트 '${existing.title}' 삭제(${existing.game.slug})`,
      );

      res.status(200).json({
        resultCode: 200,
        resultMsg: '이벤트가 삭제되었습니다.',
      });
    } catch (error) {
      logger.error('deleteEvent Error:', error);
      res.status(500).json({
        resultCode: 500,
        resultMsg: '서버 오류가 발생했습니다.',
      });
    }
  }

  /**
   * 이벤트 거부
   * POST /api/v0/admin/event/reject/:id
   */
  async rejectEvent(req: Request, res: Response): Promise<void> {
    try {
      const eventId = parseInt(String(req.params.id));
      const { reason } = req.body;
      const userId = req.user?.userId; // auth middleware에서 설정된 user (DecodedToken.userId)

      if (!eventId) {
        res.status(400).json({
          resultCode: 400,
          resultMsg: 'eventId가 필요합니다.',
        });
        return;
      }

      const event = await prisma.calendarEvent.findUnique({
        where: { id: eventId },
      });

      if (!event) {
        res.status(404).json({
          resultCode: 404,
          resultMsg: '이벤트를 찾을 수 없습니다.',
        });
        return;
      }

      // 거부 사유를 metadata에 저장
      const metadata = (event.metadata as any) || {};
      metadata.rejectionReason = reason;

      // PENDING 상태인 경우에만 원자적으로 업데이트 (동시 거부 시 이중 처리 방지)
      const result = await prisma.calendarEvent.updateMany({
        where: { id: eventId, status: 'PENDING' },
        data: {
          status: 'REJECTED',
          reviewedBy: userId,
          reviewedAt: new Date(),
          metadata: metadata,
        },
      });

      if (result.count === 0) {
        res.status(409).json({
          resultCode: 409,
          resultMsg: '이미 처리된 이벤트입니다.',
        });
        return;
      }

      const updatedEvent = await prisma.calendarEvent.findUnique({
        where: { id: eventId },
      });

      logAdminActivity(
        req,
        'EVENT_REJECT',
        'event',
        eventId,
        `이벤트 '${updatedEvent?.title ?? eventId}' 거부${reason ? `(사유: ${reason})` : ''}`,
      );

      res.status(200).json({
        resultCode: 200,
        resultMsg: '이벤트가 거부되었습니다.',
        data: updatedEvent,
      });
    } catch (error) {
      logger.error('rejectEvent Error:', error);
      res.status(500).json({
        resultCode: 500,
        resultMsg: '서버 오류가 발생했습니다.',
      });
    }
  }

  /**
   * 리딤(쿠폰) 그룹 목록 조회 (페이지네이션, 검색) — getItemList 미러링
   * GET /api/v0/admin/redeem/group/list
   */
  async getRedeemGroupList(req: Request, res: Response): Promise<void> {
    try {
      const page = clampPage(parseInt(req.query.page as string) || 1);
      const limit = clampLimit(parseInt(req.query.limit as string) || 10);
      const gameId = req.query.gameId
        ? parseInt(req.query.gameId as string)
        : undefined;
      const title = req.query.title as string;

      const skip = (page - 1) * limit;

      const where: any = {};
      if (gameId) where.gameId = gameId;
      if (title) where.title = { contains: title, mode: 'insensitive' };

      const [total, groups] = await Promise.all([
        prisma.redeemGroup.count({ where }),
        prisma.redeemGroup.findMany({
          where,
          skip,
          take: limit,
          orderBy: { id: 'desc' }, // 최신순
          include: {
            game: { select: { id: true, name: true, slug: true } },
            _count: { select: { codes: true } },
          },
        }),
      ]);

      res.status(200).json({
        resultCode: 200,
        resultMsg: '성공',
        data: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          groups,
        },
      });
    } catch (error) {
      logger.error('getRedeemGroupList Error:', error);
      res.status(500).json({
        resultCode: 500,
        resultMsg: '서버 오류가 발생했습니다.',
      });
    }
  }

  /**
   * 리딤 그룹 상세 조회 (코드 전체 포함) — getItemDetail 미러링
   * GET /api/v0/admin/redeem/group/:id
   */
  async getRedeemGroupDetail(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!id) {
        res.status(400).json({ resultCode: 400, resultMsg: '잘못된 id 입니다.' });
        return;
      }

      const group = await prisma.redeemGroup.findUnique({
        where: { id },
        include: {
          game: { select: { id: true, name: true, slug: true } },
          codes: { orderBy: { id: 'asc' } },
        },
      });

      if (!group) {
        res.status(404).json({ resultCode: 404, resultMsg: '리딤 그룹을 찾을 수 없습니다.' });
        return;
      }

      sendOk(res, group);
    } catch (error) {
      logger.error('getRedeemGroupDetail Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '서버 오류가 발생했습니다.' });
    }
  }

  /**
   * 리딤 그룹 생성 (코드 동봉 시 nested create) — createItem 미러링
   * POST /api/v0/admin/redeem/group
   */
  async createRedeemGroup(req: Request, res: Response): Promise<void> {
    try {
      const { gameId, title, periodText, startTime, endTime, codes } = req.body;

      if (!gameId || !title) {
        res.status(400).json({
          resultCode: 400,
          resultMsg: '필수 항목(gameId, title)을 모두 입력해주세요.',
        });
        return;
      }

      // 빈 문자열은 null로 정규화(updateElement 컨벤션).
      const normStr = (v: unknown): string | null => {
        if (v === undefined || v === null) return null;
        const s = String(v).trim();
        return s.length > 0 ? s : null;
      };

      const data: any = {
        gameId: parseInt(String(gameId)),
        title: String(title),
        periodText: normStr(periodText),
      };
      // startTime/endTime은 받으면 new Date() 변환, 빈/누락이면 스키마 기본(now / null).
      if (startTime !== undefined && startTime !== null && String(startTime).trim() !== '') {
        data.startTime = new Date(startTime);
      }
      if (endTime !== undefined && endTime !== null && String(endTime).trim() !== '') {
        data.endTime = new Date(endTime);
      }
      // codes 동봉 시 prisma nested create. code는 전역 @unique → 충돌 시 P2002.
      if (Array.isArray(codes) && codes.length > 0) {
        data.codes = {
          create: codes.map((c: { code: string; reward?: string }) => ({
            code: String(c.code),
            reward: normStr(c.reward),
          })),
        };
      }

      const group = await prisma.redeemGroup.create({
        data,
        include: {
          game: { select: { id: true, name: true, slug: true } },
          codes: { orderBy: { id: 'asc' } },
        },
      });

      logAdminActivity(
        req,
        'REDEEM_GROUP_CREATE',
        'redeem',
        group.id,
        `리딤 그룹 '${group.title}' 생성(${group.game.slug})`,
      );

      res.status(200).json({
        resultCode: 200,
        resultMsg: '리딤 그룹이 생성되었습니다.',
        data: group,
      });
    } catch (error) {
      // code @unique 전역 위반
      if ((error as { code?: string }).code === 'P2002') {
        res.status(409).json({
          resultCode: 409,
          resultMsg: '동일한 코드가 이미 존재합니다.',
        });
        return;
      }
      logger.error('createRedeemGroup Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '서버 오류가 발생했습니다.' });
    }
  }

  /**
   * 리딤 그룹 수정 (gameId·codes 불변, !==undefined 필드만 머지) — updateItem 미러링
   * PUT /api/v0/admin/redeem/group/:id
   */
  async updateRedeemGroup(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!id) {
        res.status(400).json({ resultCode: 400, resultMsg: '잘못된 id 입니다.' });
        return;
      }

      const existing = await prisma.redeemGroup.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({ resultCode: 404, resultMsg: '리딤 그룹을 찾을 수 없습니다.' });
        return;
      }

      const { title, periodText, startTime, endTime } = req.body;

      // 빈 문자열은 null로 정규화(updateElement 컨벤션).
      const normStr = (v: unknown): string | null => {
        const s = String(v).trim();
        return s.length > 0 ? s : null;
      };

      // gameId·codes는 불변 — 별도 엔드포인트로만 변경.
      const updateData: any = {};
      if (title !== undefined) updateData.title = String(title);
      if (periodText !== undefined) updateData.periodText = normStr(periodText);
      if (startTime !== undefined) updateData.startTime = new Date(startTime);
      if (endTime !== undefined) updateData.endTime = endTime ? new Date(endTime) : null;

      const group = await prisma.redeemGroup.update({
        where: { id },
        data: updateData,
        include: {
          game: { select: { id: true, name: true, slug: true } },
          codes: { orderBy: { id: 'asc' } },
        },
      });

      logAdminActivity(
        req,
        'REDEEM_GROUP_UPDATE',
        'redeem',
        group.id,
        `리딤 그룹 '${group.title}' 수정(${group.game.slug})`,
      );

      res.status(200).json({
        resultCode: 200,
        resultMsg: '리딤 그룹이 수정되었습니다.',
        data: group,
      });
    } catch (error) {
      logger.error('updateRedeemGroup Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '서버 오류가 발생했습니다.' });
    }
  }

  /**
   * 리딤 그룹 삭제 (코드는 onDelete:Cascade로 자동 삭제) — deleteItem 미러링
   * DELETE /api/v0/admin/redeem/group/:id
   */
  async deleteRedeemGroup(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!id) {
        res.status(400).json({ resultCode: 400, resultMsg: '잘못된 id 입니다.' });
        return;
      }

      const existing = await prisma.redeemGroup.findUnique({
        where: { id },
        include: { game: { select: { slug: true } } },
      });
      if (!existing) {
        res.status(404).json({ resultCode: 404, resultMsg: '리딤 그룹을 찾을 수 없습니다.' });
        return;
      }

      await prisma.redeemGroup.delete({ where: { id } });

      logAdminActivity(
        req,
        'REDEEM_GROUP_DELETE',
        'redeem',
        id,
        `리딤 그룹 '${existing.title}' 삭제(${existing.game.slug})`,
      );

      res.status(200).json({
        resultCode: 200,
        resultMsg: '리딤 그룹이 삭제되었습니다.',
      });
    } catch (error) {
      logger.error('deleteRedeemGroup Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '서버 오류가 발생했습니다.' });
    }
  }

  /**
   * 리딤 코드 추가 (기존 그룹에) — code 전역 @unique 충돌 시 409
   * POST /api/v0/admin/redeem/group/:id/code
   */
  async addRedeemCode(req: Request, res: Response): Promise<void> {
    try {
      const groupId = parseInt(String(req.params.id), 10);
      if (!groupId) {
        res.status(400).json({ resultCode: 400, resultMsg: '잘못된 id 입니다.' });
        return;
      }

      const { code, reward } = req.body;
      if (!code) {
        res.status(400).json({
          resultCode: 400,
          resultMsg: '필수 항목(code)을 입력해주세요.',
        });
        return;
      }

      const group = await prisma.redeemGroup.findUnique({
        where: { id: groupId },
        include: { game: { select: { slug: true } } },
      });
      if (!group) {
        res.status(404).json({ resultCode: 404, resultMsg: '리딤 그룹을 찾을 수 없습니다.' });
        return;
      }

      // 빈 문자열은 null로 정규화(updateElement 컨벤션).
      const normStr = (v: unknown): string | null => {
        if (v === undefined || v === null) return null;
        const s = String(v).trim();
        return s.length > 0 ? s : null;
      };

      const created = await prisma.redeemCode.create({
        data: {
          groupId,
          code: String(code),
          reward: normStr(reward),
        },
      });

      logAdminActivity(
        req,
        'REDEEM_CODE_ADD',
        'redeem',
        created.id,
        `리딤 코드 '${created.code}' 추가(${group.game.slug} / 그룹 '${group.title}')`,
      );

      res.status(200).json({
        resultCode: 200,
        resultMsg: '리딤 코드가 추가되었습니다.',
        data: created,
      });
    } catch (error) {
      // code @unique 전역 위반
      if ((error as { code?: string }).code === 'P2002') {
        res.status(409).json({
          resultCode: 409,
          resultMsg: '동일한 코드가 이미 존재합니다.',
        });
        return;
      }
      logger.error('addRedeemCode Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '서버 오류가 발생했습니다.' });
    }
  }

  /**
   * 리딤 코드 삭제 — deleteItem 미러링
   * DELETE /api/v0/admin/redeem/code/:codeId
   */
  async deleteRedeemCode(req: Request, res: Response): Promise<void> {
    try {
      const codeId = parseInt(String(req.params.codeId), 10);
      if (!codeId) {
        res.status(400).json({ resultCode: 400, resultMsg: '잘못된 id 입니다.' });
        return;
      }

      const existing = await prisma.redeemCode.findUnique({
        where: { id: codeId },
        include: { group: { include: { game: { select: { slug: true } } } } },
      });
      if (!existing) {
        res.status(404).json({ resultCode: 404, resultMsg: '리딤 코드를 찾을 수 없습니다.' });
        return;
      }

      await prisma.redeemCode.delete({ where: { id: codeId } });

      logAdminActivity(
        req,
        'REDEEM_CODE_DELETE',
        'redeem',
        codeId,
        `리딤 코드 '${existing.code}' 삭제(${existing.group.game.slug})`,
      );

      res.status(200).json({
        resultCode: 200,
        resultMsg: '리딤 코드가 삭제되었습니다.',
      });
    } catch (error) {
      logger.error('deleteRedeemCode Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '서버 오류가 발생했습니다.' });
    }
  }

  /**
   * 공지(Notice) 목록 조회 (페이지네이션, 검색) — getItemList 미러링
   * GET /api/v0/admin/notice/list
   */
  async getNoticeList(req: Request, res: Response): Promise<void> {
    try {
      const page = clampPage(parseInt(req.query.page as string) || 1);
      const limit = clampLimit(parseInt(req.query.limit as string) || 10);
      const category = req.query.category as string;
      const title = req.query.title as string;

      const skip = (page - 1) * limit;

      const where: any = {};
      if (category) where.category = category;
      if (title) where.title = { contains: title, mode: 'insensitive' };

      const [total, items] = await Promise.all([
        prisma.notice.count({ where }),
        prisma.notice.findMany({
          where,
          skip,
          take: limit,
          orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }], // 고정 먼저, 최신순
        }),
      ]);

      res.status(200).json({
        resultCode: 200,
        resultMsg: '성공',
        data: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          items,
        },
      });
    } catch (error) {
      logger.error('getNoticeList Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '서버 오류가 발생했습니다.' });
    }
  }

  /**
   * 공지 상세 조회 — getItemDetail 미러링
   * GET /api/v0/admin/notice/:id
   */
  async getNoticeDetail(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!id) {
        res.status(400).json({ resultCode: 400, resultMsg: '잘못된 id 입니다.' });
        return;
      }

      const notice = await prisma.notice.findUnique({ where: { id } });
      if (!notice) {
        res.status(404).json({ resultCode: 404, resultMsg: '공지를 찾을 수 없습니다.' });
        return;
      }

      sendOk(res, notice);
    } catch (error) {
      logger.error('getNoticeDetail Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '서버 오류가 발생했습니다.' });
    }
  }

  /**
   * 공지 생성 (어드민 직접 등록) — createItem 미러링
   * POST /api/v0/admin/notice
   */
  async createNotice(req: Request, res: Response): Promise<void> {
    try {
      const { title, content, category, pinned, published, startAt, endAt } = req.body;

      if (!title || !content) {
        res.status(400).json({
          resultCode: 400,
          resultMsg: '필수 항목(title, content)을 모두 입력해주세요.',
        });
        return;
      }

      // 빈 문자열은 null로 정규화(updateElement 컨벤션).
      const normStr = (v: unknown): string | null => {
        if (v === undefined || v === null) return null;
        const s = String(v).trim();
        return s.length > 0 ? s : null;
      };

      const data: any = {
        title: String(title),
        content: String(content),
        category: normStr(category),
      };
      // pinned/published는 보내면 반영, 누락이면 스키마 기본(false / true).
      if (pinned !== undefined) data.pinned = Boolean(pinned);
      if (published !== undefined) data.published = Boolean(published);
      // startAt/endAt은 받으면 new Date() 변환, 빈/누락이면 null(스키마 nullable).
      if (startAt !== undefined && startAt !== null && String(startAt).trim() !== '') {
        data.startAt = new Date(startAt);
      }
      if (endAt !== undefined && endAt !== null && String(endAt).trim() !== '') {
        data.endAt = new Date(endAt);
      }

      const notice = await prisma.notice.create({ data });

      logAdminActivity(req, 'NOTICE_CREATE', 'notice', notice.id, `공지 '${notice.title}' 생성`);

      res.status(200).json({
        resultCode: 200,
        resultMsg: '공지가 생성되었습니다.',
        data: notice,
      });
    } catch (error) {
      logger.error('createNotice Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '서버 오류가 발생했습니다.' });
    }
  }

  /**
   * 공지 수정 (어드민, !==undefined 필드만 머지) — updateItem 미러링
   * PUT /api/v0/admin/notice/:id
   */
  async updateNotice(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!id) {
        res.status(400).json({ resultCode: 400, resultMsg: '잘못된 id 입니다.' });
        return;
      }

      const existing = await prisma.notice.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({ resultCode: 404, resultMsg: '공지를 찾을 수 없습니다.' });
        return;
      }

      const { title, content, category, pinned, published, startAt, endAt } = req.body;

      // 빈 문자열은 null로 정규화(updateElement 컨벤션).
      const normStr = (v: unknown): string | null => {
        const s = String(v).trim();
        return s.length > 0 ? s : null;
      };

      const updateData: any = {};
      if (title !== undefined) updateData.title = String(title);
      if (content !== undefined) updateData.content = String(content);
      if (category !== undefined) updateData.category = normStr(category);
      if (pinned !== undefined) updateData.pinned = Boolean(pinned);
      if (published !== undefined) updateData.published = Boolean(published);
      if (startAt !== undefined) updateData.startAt = startAt ? new Date(startAt) : null;
      if (endAt !== undefined) updateData.endAt = endAt ? new Date(endAt) : null;

      const notice = await prisma.notice.update({ where: { id }, data: updateData });

      logAdminActivity(req, 'NOTICE_UPDATE', 'notice', notice.id, `공지 '${notice.title}' 수정`);

      res.status(200).json({
        resultCode: 200,
        resultMsg: '공지가 수정되었습니다.',
        data: notice,
      });
    } catch (error) {
      logger.error('updateNotice Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '서버 오류가 발생했습니다.' });
    }
  }

  /**
   * 공지 삭제 (어드민) — deleteItem 미러링
   * DELETE /api/v0/admin/notice/:id
   */
  async deleteNotice(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!id) {
        res.status(400).json({ resultCode: 400, resultMsg: '잘못된 id 입니다.' });
        return;
      }

      const existing = await prisma.notice.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({ resultCode: 404, resultMsg: '공지를 찾을 수 없습니다.' });
        return;
      }

      await prisma.notice.delete({ where: { id } });

      logAdminActivity(req, 'NOTICE_DELETE', 'notice', id, `공지 '${existing.title}' 삭제`);

      res.status(200).json({
        resultCode: 200,
        resultMsg: '공지가 삭제되었습니다.',
      });
    } catch (error) {
      logger.error('deleteNotice Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '서버 오류가 발생했습니다.' });
    }
  }

  /**
   * FAQ 목록 조회 (페이지네이션, 검색) — getNoticeList 미러링
   * GET /api/v0/admin/faq/list
   */
  async getFaqList(req: Request, res: Response): Promise<void> {
    try {
      const page = clampPage(parseInt(req.query.page as string) || 1);
      const limit = clampLimit(parseInt(req.query.limit as string) || 10);
      const category = req.query.category as string;

      const skip = (page - 1) * limit;

      const where: any = {};
      if (category) where.category = category;

      const [total, items] = await Promise.all([
        prisma.faq.count({ where }),
        prisma.faq.findMany({
          where,
          skip,
          take: limit,
          orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }], // 카테고리→표시순서
        }),
      ]);

      res.status(200).json({
        resultCode: 200,
        resultMsg: '성공',
        data: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          items,
        },
      });
    } catch (error) {
      logger.error('getFaqList Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '서버 오류가 발생했습니다.' });
    }
  }

  /**
   * FAQ 상세 조회 — getNoticeDetail 미러링
   * GET /api/v0/admin/faq/:id
   */
  async getFaqDetail(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!id) {
        res.status(400).json({ resultCode: 400, resultMsg: '잘못된 id 입니다.' });
        return;
      }

      const faq = await prisma.faq.findUnique({ where: { id } });
      if (!faq) {
        res.status(404).json({ resultCode: 404, resultMsg: 'FAQ를 찾을 수 없습니다.' });
        return;
      }

      sendOk(res, faq);
    } catch (error) {
      logger.error('getFaqDetail Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '서버 오류가 발생했습니다.' });
    }
  }

  /**
   * FAQ 생성 (어드민 직접 등록) — createNotice 미러링
   * POST /api/v0/admin/faq
   */
  async createFaq(req: Request, res: Response): Promise<void> {
    try {
      const { question, answer, category, sortOrder, published } = req.body;

      if (!question || !answer) {
        res.status(400).json({
          resultCode: 400,
          resultMsg: '필수 항목(question, answer)을 모두 입력해주세요.',
        });
        return;
      }

      // 빈 문자열은 null로 정규화(updateElement 컨벤션).
      const normStr = (v: unknown): string | null => {
        if (v === undefined || v === null) return null;
        const s = String(v).trim();
        return s.length > 0 ? s : null;
      };

      const data: any = {
        question: String(question),
        answer: String(answer),
        category: normStr(category),
      };
      if (sortOrder !== undefined && sortOrder !== null && sortOrder !== '') {
        data.sortOrder = parseInt(String(sortOrder)) || 0;
      }
      if (published !== undefined) data.published = Boolean(published);

      const faq = await prisma.faq.create({ data });

      logAdminActivity(req, 'FAQ_CREATE', 'faq', faq.id, `FAQ '${faq.question}' 생성`);

      res.status(200).json({
        resultCode: 200,
        resultMsg: 'FAQ가 생성되었습니다.',
        data: faq,
      });
    } catch (error) {
      logger.error('createFaq Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '서버 오류가 발생했습니다.' });
    }
  }

  /**
   * FAQ 수정 (어드민, !==undefined 필드만 머지) — updateNotice 미러링
   * PUT /api/v0/admin/faq/:id
   */
  async updateFaq(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!id) {
        res.status(400).json({ resultCode: 400, resultMsg: '잘못된 id 입니다.' });
        return;
      }

      const existing = await prisma.faq.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({ resultCode: 404, resultMsg: 'FAQ를 찾을 수 없습니다.' });
        return;
      }

      const { question, answer, category, sortOrder, published } = req.body;

      // 빈 문자열은 null로 정규화(updateElement 컨벤션).
      const normStr = (v: unknown): string | null => {
        const s = String(v).trim();
        return s.length > 0 ? s : null;
      };

      const updateData: any = {};
      if (question !== undefined) updateData.question = String(question);
      if (answer !== undefined) updateData.answer = String(answer);
      if (category !== undefined) updateData.category = normStr(category);
      if (sortOrder !== undefined) {
        updateData.sortOrder = sortOrder === null || sortOrder === '' ? 0 : parseInt(String(sortOrder)) || 0;
      }
      if (published !== undefined) updateData.published = Boolean(published);

      const faq = await prisma.faq.update({ where: { id }, data: updateData });

      logAdminActivity(req, 'FAQ_UPDATE', 'faq', faq.id, `FAQ '${faq.question}' 수정`);

      res.status(200).json({
        resultCode: 200,
        resultMsg: 'FAQ가 수정되었습니다.',
        data: faq,
      });
    } catch (error) {
      logger.error('updateFaq Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '서버 오류가 발생했습니다.' });
    }
  }

  /**
   * FAQ 삭제 (어드민) — deleteNotice 미러링
   * DELETE /api/v0/admin/faq/:id
   */
  async deleteFaq(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!id) {
        res.status(400).json({ resultCode: 400, resultMsg: '잘못된 id 입니다.' });
        return;
      }

      const existing = await prisma.faq.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({ resultCode: 404, resultMsg: 'FAQ를 찾을 수 없습니다.' });
        return;
      }

      await prisma.faq.delete({ where: { id } });

      logAdminActivity(req, 'FAQ_DELETE', 'faq', id, `FAQ '${existing.question}' 삭제`);

      res.status(200).json({
        resultCode: 200,
        resultMsg: 'FAQ가 삭제되었습니다.',
      });
    } catch (error) {
      logger.error('deleteFaq Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '서버 오류가 발생했습니다.' });
    }
  }
}

export default new AdminController();
