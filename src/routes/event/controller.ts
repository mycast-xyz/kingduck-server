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

export const getEvent = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Invalid ID' });
    }

    const event = await service.getEventById(id);

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    res.status(200).json(event);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
