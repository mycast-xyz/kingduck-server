import { Request, Response } from 'express';
import * as service from './service';
import logger from '../../utils/logger';
import { sendOk, sendError } from '../../utils/responseBuilder';

export const getList = async (req: Request, res: Response) => {
  try {
    const games = await service.getGameList();
    sendOk(res, games);
  } catch (error) {
    logger.error(error);
    sendError(res, 500, 'Internal Server Error');
  }
};

export const getDetail = async (req: Request, res: Response) => {
  try {
    const slug = req.params.slug as string;
    const game = await service.getGameBySlug(slug);

    if (!game) {
      return sendError(res, 404, 'Game not found');
    }

    sendOk(res, game);
  } catch (error) {
    logger.error(error);
    sendError(res, 500, 'Internal Server Error');
  }
};
