import { Request, Response } from 'express';
import { prisma } from '../../utils/prisma';

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

      const gameList = await Promise.all(
        games.map(async (game) => {
          const [characterCount, itemCount, typeCount] = await Promise.all([
            prisma.character.count({ where: { gameId: game.id } }),
            prisma.item.count({ where: { gameId: game.id } }),
            prisma.element.count({ where: { gameId: game.id } }),
          ]);

          return {
            id: game.id,
            slug: game.slug,
            name: game.name,
            iconUrl: game.iconUrl,
            counts: {
              characters: characterCount,
              items: itemCount,
              types: typeCount,
            },
          };
        }),
      );

      res.status(200).json({
        resultCode: 200,
        resultMsg: '성공',
        items: gameList,
      });
    } catch (error) {
      console.error('getGameList Error:', error);
      res.status(500).json({
        resultCode: 500,
        resultMsg: '서버 오류가 발생했습니다.',
      });
    }
  }
  /**
   * 캐릭터 목록 조회 (페이지네이션, 검색)
   * GET /api/v0/admin/character/list
   */
  async getCharacterList(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
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
      console.error('getCharacterList Error:', error);
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
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
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
      console.error('getItemList Error:', error);
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
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
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
      console.error('getEventList Error:', error);
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
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
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
      console.error('getPendingEvents Error:', error);
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
      const userId = (req as any).user?.id; // auth middleware에서 설정된 user

      if (!eventId) {
        res.status(400).json({
          resultCode: 400,
          resultMsg: 'eventId가 필요합니다.',
        });
        return;
      }

      // 이벤트 존재 확인
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

      if (event.status !== 'PENDING') {
        res.status(400).json({
          resultCode: 400,
          resultMsg: '이미 처리된 이벤트입니다.',
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

      const updatedEvent = await prisma.calendarEvent.update({
        where: { id: eventId },
        data: updateData,
      });

      res.status(200).json({
        resultCode: 200,
        resultMsg: '이벤트가 승인되었습니다.',
        data: updatedEvent,
      });
    } catch (error) {
      console.error('approveEvent Error:', error);
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
      console.error('createEvent Error:', error);
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
      console.error('updateEvent Error:', error);
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
      console.error('deleteEvent Error:', error);
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
      const userId = (req as any).user?.id;

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

      if (event.status !== 'PENDING') {
        res.status(400).json({
          resultCode: 400,
          resultMsg: '이미 처리된 이벤트입니다.',
        });
        return;
      }

      // 거부 사유를 metadata에 저장
      const metadata = (event.metadata as any) || {};
      metadata.rejectionReason = reason;

      const updatedEvent = await prisma.calendarEvent.update({
        where: { id: eventId },
        data: {
          status: 'REJECTED',
          reviewedBy: userId,
          reviewedAt: new Date(),
          metadata: metadata,
        },
      });

      res.status(200).json({
        resultCode: 200,
        resultMsg: '이벤트가 거부되었습니다.',
        data: updatedEvent,
      });
    } catch (error) {
      console.error('rejectEvent Error:', error);
      res.status(500).json({
        resultCode: 500,
        resultMsg: '서버 오류가 발생했습니다.',
      });
    }
  }
}

export default new AdminController();
