import { Request, Response } from 'express';
import * as service from './service';
import logger from '../../utils/logger';
import { sendOk, sendError } from '../../utils/responseBuilder';

export const getList = async (req: Request, res: Response) => {
  try {
    const data = await service.getElementList();
    sendOk(res, data);
  } catch (error) {
    logger.error(error);
    sendError(res, 500, 'Internal Server Error');
  }
};
