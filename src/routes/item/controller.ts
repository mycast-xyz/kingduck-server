import { Request, Response } from 'express';
import * as service from './service';
import logger from '../../utils/logger';
import { sendOk, sendError } from '../../utils/responseBuilder';

export const getList = async (req: Request, res: Response) => {
  try {
    const { originalId, gameId, type } = req.query;
    const data = await service.getItemList(
      originalId as string,
      gameId ? Number(gameId) : undefined,
      (type as string) || undefined,
    );
    sendOk(res, data);
  } catch (error) {
    logger.error(error);
    sendError(res, 500, 'Internal Server Error');
  }
};

export const getItemByName = async (req: Request, res: Response) => {
  try {
    const { gameSlug, name } = req.params as { gameSlug: string; name: string };

    const data = await service.getItemByName(gameSlug, name);

    if (!data) {
      return sendError(res, 404, 'Item not found');
    }

    sendOk(res, data);
  } catch (error) {
    logger.error(error);
    sendError(res, 500, 'Internal Server Error');
  }
};
