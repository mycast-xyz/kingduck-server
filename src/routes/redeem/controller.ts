import { Request, Response } from 'express';
import * as service from './service';
import logger from '../../utils/logger';
import { sendOk, sendError } from '../../utils/responseBuilder';

export const getRedeemCodes = async (req: Request, res: Response) => {
  try {
    const slug = req.params.slug as string;
    const codes = await service.getRedeemCodes(slug);

    if (codes === null) {
      return sendError(res, 404, 'Game not found');
    }

    sendOk(res, codes);
  } catch (error) {
    logger.error(error);
    sendError(res, 500, 'Internal Server Error');
  }
};
