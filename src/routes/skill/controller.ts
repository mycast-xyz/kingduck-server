import { Request, Response } from 'express';
import * as service from './service';
import logger from '../../utils/logger';

export const getList = async (req: Request, res: Response) => {
  try {
    const { characterId } = req.query;

    if (!characterId) {
      return res.status(400).json({ message: 'characterId is required' });
    }

    const cId = Number(characterId);
    if (isNaN(cId)) {
      return res.status(400).json({ message: 'characterId must be a number' });
    }

    const data = await service.getSkillList(cId);

    if (!data) {
      return res.status(404).json({ message: 'Character not found' });
    }

    res.status(200).json(data);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
