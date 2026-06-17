import { Request, Response } from 'express';
import * as service from './service';
import logger from '../../utils/logger';
import { sendOk, sendError } from '../../utils/responseBuilder';

export const getList = async (req: Request, res: Response) => {
  try {
    const { characterId } = req.query;

    if (!characterId) {
      return sendError(res, 400, 'characterId is required');
    }

    const cId = Number(characterId);
    if (isNaN(cId)) {
      return sendError(res, 400, 'characterId must be a number');
    }

    const data = await service.getSkillList(cId);

    if (!data) {
      return sendError(res, 404, 'Character not found');
    }

    sendOk(res, data);
  } catch (error) {
    logger.error(error);
    sendError(res, 500, 'Internal Server Error');
  }
};
