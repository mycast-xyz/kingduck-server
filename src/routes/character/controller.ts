import { Request, Response } from 'express';
import * as service from './service';
import logger from '../../utils/logger';

export const getList = async (req: Request, res: Response) => {
  try {
    const { gameSlug } = req.params as { gameSlug: string };
    const { type, name, elementId, rarity, pathId } = req.query;

    if (type === 'elements') {
      const data = await service.getElementList(gameSlug);
      return res.status(200).json(data);
    }

    const filter = {
      ...(typeof name === 'string' && { name: name as string }),
      ...(elementId && { elementId: Number(elementId) }),
      ...(rarity && { rarity: Number(rarity) }),
      ...(pathId && { pathId: Number(pathId) }),
    };

    const data = await service.getCharacterList(gameSlug, filter);
    res.status(200).json(data);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const getDetail = async (req: Request, res: Response) => {
  try {
    const { gameSlug, id } = req.params as { gameSlug: string; id: string };

    const characterId = Number(id);
    if (isNaN(characterId)) {
      return res.status(400).json({ message: 'Invalid character ID' });
    }

    const data = await service.getCharacter(gameSlug, characterId);

    if (!data) {
      return res.status(404).json({ message: 'Character not found' });
    }

    res.status(200).json(data);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
