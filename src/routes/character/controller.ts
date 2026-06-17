import { Request, Response } from 'express';
import * as service from './service';
import logger from '../../utils/logger';
import { sendOk, sendError } from '../../utils/responseBuilder';

export const getList = async (req: Request, res: Response) => {
  try {
    const { gameSlug } = req.params as { gameSlug: string };
    const { type, name, elementId, rarity, pathId } = req.query;

    if (type === 'elements') {
      const data = await service.getElementList(gameSlug);
      return sendOk(res, data);
    }

    const filter = {
      ...(typeof name === 'string' && { name: name as string }),
      ...(elementId && { elementId: Number(elementId) }),
      ...(rarity && { rarity: Number(rarity) }),
      ...(pathId && { pathId: Number(pathId) }),
    };

    const data = await service.getCharacterList(gameSlug, filter);
    sendOk(res, data);
  } catch (error) {
    logger.error(error);
    sendError(res, 500, 'Internal Server Error');
  }
};

export const getDetail = async (req: Request, res: Response) => {
  try {
    const { gameSlug, id } = req.params as { gameSlug: string; id: string };

    const characterId = Number(id);
    if (isNaN(characterId)) {
      return sendError(res, 400, 'Invalid character ID');
    }

    const data = await service.getCharacter(gameSlug, characterId);

    if (!data) {
      return sendError(res, 404, 'Character not found');
    }

    sendOk(res, data);
  } catch (error) {
    logger.error(error);
    sendError(res, 500, 'Internal Server Error');
  }
};

export const getDetailByOriginalId = async (req: Request, res: Response) => {
  try {
    const { gameId, originalId } = req.params as {
      gameId: string;
      originalId: string;
    };

    const gId = Number(gameId);
    if (isNaN(gId)) {
      return sendError(res, 400, 'Invalid game ID');
    }

    const data = await service.getCharacterByOriginalId(gId, originalId);

    if (!data) {
      return sendError(res, 404, 'Character not found');
    }

    sendOk(res, data);
  } catch (error) {
    logger.error(error);
    sendError(res, 500, 'Internal Server Error');
  }
};

export const getAdminDetail = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };

    const characterId = Number(id);
    if (isNaN(characterId)) {
      return sendError(res, 400, 'Invalid character ID');
    }

    const data = await service.getCharacterAdmin(characterId);

    if (!data) {
      return sendError(res, 404, 'Character not found');
    }

    sendOk(res, data);
  } catch (error) {
    logger.error(error);
    sendError(res, 500, 'Internal Server Error');
  }
};

export const getCharacterDetailByName = async (req: Request, res: Response) => {
  try {
    const { gameSlug, name } = req.params as { gameSlug: string; name: string };

    const data = await service.getCharacterByName(gameSlug, name);

    if (!data) {
      return sendError(res, 404, 'Character not found');
    }

    sendOk(res, data);
  } catch (error) {
    logger.error(error);
    sendError(res, 500, 'Internal Server Error');
  }
};
