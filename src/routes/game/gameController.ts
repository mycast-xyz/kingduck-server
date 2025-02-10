import express from 'express';
import fs from 'fs';
import { Game } from '../../models/game/GameDef.Vo';
import sequelize from '../../models';
import { QueryTypes } from 'sequelize';
import { GameImage } from '../../models/game/GameImage.Vo';
import Character from '../../models/character/CharacterDef.Vo';
import { Item } from '../../models/Item/ItemDef.Vo';
import { TypeDef } from '../../models/type/TypeDef.Vo';

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
   * 게임 목록 조회 API
   * 전체 게임 목록을 반환
   * @param req Express Request 객체
   * @param res Express Response 객체
   */
  // 해당영역 해더 값의 jwt 토큰에서 찾아서 어드민 정보 확인 필요
  async getAdminGameList(req: any, res: any): Promise<void> {
    const gameData: any = await Game.findAll({
      include: [
        {
          model: GameImage,
          as: 'images',
          attributes: ['url'],
        },
      ],
    });
    // 각 게임별 캐릭터/아이템/타입 카운트 정보 추가
    const gameListWithCounts = await Promise.all(
      gameData.map(async (game: any) => {
        const characterCount = await Character.count({
          where: { gameId: game.id },
        });

        const itemCount = await Item.count({
          where: { gameId: game.id },
        });

        const typeCount = await TypeDef.count({
          where: { gameId: game.id },
        });

        return {
          ...game.toJSON(),
          characterCount,
          itemCount,
          typeCount,
        };
      }),
    );

    // 원본 gameList 대체
    let gameList = gameListWithCounts;

    // 내보내기
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
