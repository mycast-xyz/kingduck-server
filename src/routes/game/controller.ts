import { Request, Response } from 'express';
import * as service from './service';
import logger from '../../utils/logger';

export const getList = async (req: Request, res: Response) => {
  try {
    const games = await service.getGameList();
    res.status(200).json(games);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const getDetail = async (req: Request, res: Response) => {
  try {
    const slug = req.params.slug as string;
    const game = await service.getGameBySlug(slug);

    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    res.status(200).json(game);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
