import { Request, Response } from 'express';
import * as service from './service';
import logger from '../../utils/logger';

export const getRedeemCodes = async (req: Request, res: Response) => {
  try {
    const slug = req.params.slug as string;
    const codes = await service.getRedeemCodes(slug);

    if (codes === null) {
      return res.status(404).json({ message: 'Game not found' });
    }

    res.status(200).json(codes);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
