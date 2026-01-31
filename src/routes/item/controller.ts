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
