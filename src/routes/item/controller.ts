import { Request, Response } from 'express';
import * as service from './service';
import logger from '../../utils/logger';

export const getList = async (req: Request, res: Response) => {
  try {
    const { originalId, gameId } = req.query;
    const data = await service.getItemList(
      originalId as string,
      gameId ? Number(gameId) : undefined,
    );
    res.status(200).json(data);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const getItemByName = async (req: Request, res: Response) => {
  try {
    const { gameSlug, name } = req.params as { gameSlug: string; name: string };

    const data = await service.getItemByName(gameSlug, name);

    if (!data) {
      return res.status(404).json({ message: 'Item not found' });
    }

    res.status(200).json(data);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
