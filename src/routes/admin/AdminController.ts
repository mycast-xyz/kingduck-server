import { Request, Response } from 'express';
import { prisma } from '../../utils/prisma';
import logger from '../../utils/logger';
import { sendOk } from '../../utils/responseBuilder';
import { clampPage, clampLimit } from '../../utils/pagination';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

export class AdminController {
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
        select: { id: true, name: true, type: true, iconUrl: true },
        orderBy: [{ type: 'asc' }, { id: 'asc' }],
      });
      sendOk(res, { slug, elements });
    } catch (error) {
      logger.error('getElementList Error:', error);
      res.status(500).json({ resultCode: 500, resultMsg: '속성 목록 조회에 실패했습니다.' });
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
      const name = req.query.name as string;

      const skip = (page - 1) * limit;

      const where: any = {};
      if (gameId) where.gameId = gameId;
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
}

export default new AdminController();
