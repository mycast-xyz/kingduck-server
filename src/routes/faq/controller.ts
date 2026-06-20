import { Request, Response } from 'express';
import * as service from './service';
import logger from '../../utils/logger';
import { sendOk, sendError } from '../../utils/responseBuilder';

export const getFaqList = async (_req: Request, res: Response) => {
  try {
    const faqs = await service.getFaqList();
    sendOk(res, faqs);
  } catch (error) {
    logger.error(error);
    sendError(res, 500, 'Internal Server Error');
  }
};
