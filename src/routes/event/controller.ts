import { Request, Response } from 'express';
import * as service from './service';
import logger from '../../utils/logger';
import { sendOk, sendError } from '../../utils/responseBuilder';

export const getEvents = async (req: Request, res: Response) => {
  try {
    const slug = req.params.slug as string;
    const events = await service.getEvents(slug);

    if (events === null) {
      return sendError(res, 404, 'Game not found');
    }

    sendOk(res, events);
  } catch (error) {
    logger.error(error);
    sendError(res, 500, 'Internal Server Error');
  }
};

export const getEvent = async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      return sendError(res, 400, 'Invalid ID');
    }

    const event = await service.getEventById(id);

    if (!event) {
      return sendError(res, 404, 'Event not found');
    }

    sendOk(res, event);
  } catch (error) {
    logger.error(error);
    sendError(res, 500, 'Internal Server Error');
  }
};
