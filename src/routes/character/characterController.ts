import express from 'express';
import GameQuery from '../../manager/AllGame/GameQuery';
import HonkaiStarRailCharacterSearch from '../../manager/HonkaiStarRail/CharacterSearch';
import GirlsFrontline2CharacterSearch from '../../manager/GirlsFrontline2/CharacterSearch';
import NikkeCharacterSearch from '../../manager/Nikke/CharacterSearch';

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
}

export default new CharacterController();
