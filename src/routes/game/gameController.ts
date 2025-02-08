import express from 'express';
import fs from 'fs';
import { Game } from '../../models/game/GameDef.Vo';
import sequelize from '../../models';
import { QueryTypes } from 'sequelize';
import { GameImage } from '../../models/game/GameImage.Vo';

/**
 * 게임 관련 컨트롤러
 */
export class GameController {
  /**
   * 게임 목록 조회 API
   * 전체 게임 목록을 반환
   * @param req Express Request 객체
   * @param res Express Response 객체
   */
  async getGameList(req: any, res: any): Promise<void> {
    const gameList: any = await Game.findAll({
      include: [
        {
          model: GameImage,
          as: 'images',
          attributes: ['url'],
        },
      ],
    });
    if (gameList) {
      res.status(200).json({
        resultCode: 200,
        resultMsg: 'NORMAL SERVICE',
        items: gameList,
      });
    } else {
      res.status(200).json({
        resultCode: 400,
        resultMsg: 'DATA BASE ERROR',
      });
    }
  }

  /**
   * 특정 게임 조회 API
   * 게임 영문 제목으로 특정 게임 정보를 반환
   * @param req Express Request 객체
   * @param res Express Response 객체
   */
  async getGame(req: any, res: any): Promise<void> {
    console.log('----------------------------------');
    console.log('특정 게임 조회');
    console.log('----------------------------------');

    const { slug } = req.params;

    try {
      const gameData: any = await Game.findOne({
        where: {
          'title.slug': slug,
        },
        include: [
          {
            model: GameImage,
            as: 'images',
            attributes: ['url'],
          },
        ],
      });

      if (gameData) {
        res.status(200).json({
          resultCode: 200,
          resultMsg: 'NORMAL SERVICE',
          items: gameData,
        });
      } else {
        res.status(200).json({
          resultCode: 400,
          resultMsg: 'DATA BASE ERROR',
        });
      }
    } catch (error) {
      console.error('게임 데이터 조회 중 오류 발생:', error);
      res.status(500).json({
        resultCode: 500,
        resultMsg: 'INTERNAL SERVER ERROR',
      });
    }
  }
}

export default new GameController();
