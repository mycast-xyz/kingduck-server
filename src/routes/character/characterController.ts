import express from 'express';
import GameQuery from '../../manager/AllGame/GameQuery';
import HonkaiStarRailCharacterSearch from '../../manager/HonkaiStarRail/CharacterSearch';
import GirlsFrontline2CharacterSearch from '../../manager/GirlsFrontline2/CharacterSearch';
import NikkeCharacterSearch from '../../manager/Nikke/CharacterSearch';

// 어드민용
import Character from '../../models/character/CharacterDef.Vo';
import CharacterImage from '../../models/character/CharacterImage.Vo';
import { CharacterInfo } from '../../models/character/CharacterInfo.Vo';
import Skill from '../../models/skill/SkillDef.Vo';
import Game from '../../models/game/GameDef.Vo';

export class CharacterController {
  /**

   * 캐릭터 목록 조회 API
   * 1. 게임 정보 조회
   * 2. 타입(속성, 경로) 정보 조회
   * 3. 캐릭터 기본 정보 및 이미지 조회
   * 4. 캐릭터별 속성/경로 정보 매핑
   */
  async getCharacterList(req: any, res: any): Promise<void> {
    const { slug } = req.params;
    const { type, rarity } = req.query;

    // 타입 파라미터 파싱
    let typeConditions: any[] = [];
    if (type) {
      const typeGroups = type.split('*');
      typeGroups.forEach((group: string) => {
        const [key, value] = group.split('+');
        if (key && value) {
          typeConditions.push({
            key: decodeURIComponent(key),
            value: decodeURIComponent(value),
          });
        }
      });
    }

    // 1. 게임 정보 조회
    const gameData = await GameQuery.getGameInfo(slug);

    // 1-1. 게임 정보 없으면 오류 반환
    if (!gameData) {
      return res.status(200).json({
        resultCode: 400,
        resultMsg: 'GAME NOT FOUND',
      });
    }

    let result;
    // 2. 캐릭터 목록 조회
    if (gameData.id == 1) {
      // 2. 캐릭터 목록 조회
      result = await HonkaiStarRailCharacterSearch.searchCharacterList(
        gameData,
        typeConditions,
        rarity,
      );
    } else if (gameData.id == 2) {
      result = await GirlsFrontline2CharacterSearch.searchCharacterList(
        gameData,
        typeConditions,
        rarity,
      );
    } else if (gameData.id == 3) {
      result = await NikkeCharacterSearch.searchCharacterList(
        gameData,
        typeConditions,
        rarity,
      );
    }

    return res.status(200).json(result);
  }

  /**
   * 캐릭터 상세 정보 조회 API
   * 1. 게임 정보 조회
   * 2. 캐릭터 기본 정보 조회
   * 3. 추가 정보 병렬 조회 (속성, 경로, 스킬, 이미지)
   * 4. 장착 아이템 정보 조회
   * 5. 응답 데이터 구성
   */
  async getCharacter(req: any, res: any): Promise<void> {
    const { slug, id } = req.params;

    // 1. 게임 정보 조회
    const gameData = await GameQuery.getGameInfo(slug);

    // 1-1. 게임 정보 없으면 오류 반환
    if (!gameData) {
      return res.status(200).json({
        resultCode: 400,
        resultMsg: 'GAME NOT FOUND',
      });
    }

    let result;
    // 2. 캐릭터 목록 조회
    if (gameData.id == 1) {
      result = await HonkaiStarRailCharacterSearch.searchCharacterDetail(
        gameData,
        id,
      );
    } else if (gameData.id == 2) {
      result = await GirlsFrontline2CharacterSearch.searchCharacterDetail(
        gameData,
        id,
      );
    } else if (gameData.id == 3) {
      result = await NikkeCharacterSearch.searchCharacterDetail(gameData, id);
    }
    console.log(result);
    return res.status(200).json(result);
  }

  /**
   * 캐릭터 어드민 리스트 정보 조회 API
   * 1. 게임 정보 조회
   * 2. 캐릭터 기본 정보 조회
   * 3. 추가 정보 병렬 조회 (속성, 경로, 스킬, 이미지)
   * 4. 장착 아이템 정보 조회
   * 5. 응답 데이터 구성
   */
  async getCharacterListAdmin(req: any, res: any): Promise<void> {
    const { slug, id } = req.params;

    // 1. 게임 정보 조회
    //const gameData = await GameQuery.getGameInfo();

    // 1-1. 게임 정보 없으면 오류 반환
    const CharacterData = await Character.findAll({
      include: [
        {
          model: CharacterImage,

          as: 'images',
          where: { layout: 'card' },
          attributes: ['url', 'layout'],
        },
      ],
      attributes: [
        'isNew',
        'isReleased',
        'name',
        'rarity',
        'id',
        'type',
        'gameId',
        'releaseDate',
      ],
      order: [['id', 'ASC']],
      raw: true,
      nest: true,
    });

    // 각 캐릭터별 이미지 타입 카운트 및 스킬/상세 정보 추가
    const characterListWithCounts = await Promise.all(
      CharacterData.map(async (character: any) => {
        // 게임 정보 조회
        const gameInfo = await Game.findOne({
          where: { id: character.gameId },
          attributes: ['title', 'id'],
          raw: true,
        });

        // 이미지 타입별 카운트
        const cardCount = await CharacterImage.count({
          where: {
            characterId: character.id,
            layout: 'card',
          },
        });

        const artCount = await CharacterImage.count({
          where: {
            characterId: character.id,
            layout: 'art',
          },
        });

        const videoCount = await CharacterImage.count({
          where: {
            characterId: character.id,
            layout: 'video',
          },
        });

        // 스킬 카운트
        const skillCount = await Skill.count({
          where: { characterId: character.id },
        });

        // 상세 정보
        const details = await CharacterInfo.findOne({
          where: { characterId: character.id },
          attributes: ['stats', 'itemData', 'ranks'],
        });

        return {
          ...character,
          game: gameInfo,
          imageCount: {
            card: cardCount,
            art: artCount,
            video: videoCount,
          },
          skillCount,
          details: details || null,
        };
      }),
    );

    let result = characterListWithCounts;

    return res.status(200).json({
      resultCode: 200,
      items: result,
      resultMsg: 'SUCCESS',
    });
  }

  /**
   * 캐릭터 어드민 리스트 정보 조회 API
   * 1. 게임 정보 조회
   * 2. 캐릭터 기본 정보 조회
   * 3. 추가 정보 병렬 조회 (속성, 경로, 스킬, 이미지)
   * 4. 장착 아이템 정보 조회
   * 5. 응답 데이터 구성
   */
  async getCharacterAdmin(req: any, res: any): Promise<void> {
    const { slug, id } = req.params;

    // 1. 게임 정보 조회
    //const gameData = await GameQuery.getGameInfo();

    // 1-1. 게임 정보 없으면 오류 반환
    const CharacterData = await Character.findOne({
      include: [
        {
          model: CharacterImage,

          as: 'images',
          where: { layout: 'card' },
          attributes: ['url', 'layout'],
        },
      ],
      where: { id: id },
      raw: true,
      nest: true,
    });

    // 각 캐릭터별 이미지 타입 카운트 및 스킬/상세 정보 추가
    const character: any = CharacterData;
    // 게임 정보 조회
    const gameInfo = await Game.findOne({
      where: { id: character.gameId },
      attributes: ['title', 'id'],
      raw: true,
    });

    // 이미지 타입별 카운트
    const cardCount = await CharacterImage.count({
      where: {
        characterId: character.id,
        layout: 'card',
      },
    });

    const artCount = await CharacterImage.count({
      where: {
        characterId: character.id,
        layout: 'art',
      },
    });

    const videoCount = await CharacterImage.count({
      where: {
        characterId: character.id,
        layout: 'video',
      },
    });

    // 이미지 전체
    const image = await CharacterImage.findAll({
      where: {
        characterId: character.id,
        layout: 'card',
      },
    });

    // 스킬 카운트
    const skillCount = await Skill.count({
      where: { characterId: character.id },
    });

    // 스킬 카운트
    const skill = await Skill.findAll({
      where: { characterId: character.id },
    });

    // 상세 정보
    const details = await CharacterInfo.findOne({
      where: { characterId: character.id },
      attributes: ['stats', 'itemData', 'ranks'],
    });

    // 상세 정보
    const detailsInfo = await CharacterInfo.findAll({
      where: { characterId: character.id },
      attributes: ['stats', 'itemData', 'ranks'],
    });

    let result = {
      ...character,
      game: gameInfo,
      imageCount: {
        card: cardCount,
        art: artCount,
        video: videoCount,
      },
      skillCount,
      details: details || null,
      detailsInfo: detailsInfo || null,
      image: image || null,
      skill: skill || null,
    };

    return res.status(200).json({
      resultCode: 200,
      items: result,
      resultMsg: 'SUCCESS',
    });
  }
}

export default new CharacterController();
