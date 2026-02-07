import { Request, Response } from 'express';
import * as service from './service';
import logger from '../../utils/logger';

export const getEvents = async (req: Request, res: Response) => {
  try {
    const slug = req.params.slug as string;
    const events = await service.getEvents(slug);

    if (events === null) {
      return res.status(404).json({ message: 'Game not found' });
    }

    res.status(200).json(events);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
