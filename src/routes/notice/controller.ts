import { Request, Response } from 'express';
import * as service from './service';
import logger from '../../utils/logger';
import { sendOk, sendError } from '../../utils/responseBuilder';

export const getNoticeList = async (_req: Request, res: Response) => {
  try {
    const notices = await service.getNoticeList();
    sendOk(res, notices);
  } catch (error) {
    logger.error(error);
    sendError(res, 500, 'Internal Server Error');
  }
};

export const getNotice = async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!id) {
      return sendError(res, 400, 'Invalid id');
    }

    const notice = await service.getNoticeById(id);
    if (!notice) {
      return sendError(res, 404, 'Notice not found');
    }

    sendOk(res, notice);
  } catch (error) {
    logger.error(error);
    sendError(res, 500, 'Internal Server Error');
  }
};
