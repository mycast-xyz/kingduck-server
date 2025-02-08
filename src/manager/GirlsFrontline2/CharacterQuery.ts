import { Op } from 'sequelize';
import { Character } from '../../models/character/CharacterDef.Vo';
import { CharacterInfo } from '../../models/character/CharacterInfo.Vo';
import { CharacterImage } from '../../models/character/CharacterImage.Vo';
import { TypeDef } from '../../models/type/TypeDef.Vo';
import { TypeImage } from '../../models/type/TypeImage.Vo';
import Skill, { Skill } from '../../models/skill/SkillDef.Vo';
import SkillImage, { SkillImage } from '../../models/skill/SkillImage.Vo';
import { GameQuery } from '../AllGame/GameQuery';
/**
 * 붕괴: 스타레일 캐릭터 조회 관리 클래스
 * GameQuery 클래스를 상속받아 공통 기능을 재사용
 */
export class GirlsFrontline2CharacterQuery extends GameQuery {
  /**
   * 캐릭터 목록 조회
   * @param gameId - 게임 ID
   * @returns 캐릭터 목록과 카드 이미지 정보
   */
  async getCharacterList(gameId: number) {
    return await Character.findAll({
      include: [
        {
          model: CharacterImage,
          as: 'images',
          where: { layout: 'card' },
          attributes: ['url', 'layout'],
        },
      ],
      attributes: ['isNew', 'isReleased', 'name', 'rarity', 'id', 'type'],
      order: [
        ['rarity', 'DESC'],
        ['releaseDate', 'DESC'],
      ],
      where: { gameId },
      raw: true,
      nest: true,
    });
  }
  /**
   * 캐릭터 목록 조회
   * @param gameId - 게임 ID
   * @param typeConditions - 캐릭터 타입 조건 배열
   * @param rarityConditions - 캐릭터 레어도 조건
   * @returns 캐릭터 목록과 카드 이미지 정보
   */
  async getCharacterListWithConditions(
    gameId: number,
    typeConditions: any,
    rarityConditions: any,
  ) {
    console.log('getCharacterListWithConditions', typeConditions);

    return await Character.findAll({
      include: [
        {
          model: CharacterImage,
          as: 'images',
          where: { layout: 'card' },
          attributes: ['url', 'layout'],
        },
      ],
      attributes: ['isNew', 'isReleased', 'name', 'rarity', 'id', 'type'],
      order: [
        ['rarity', 'DESC'],
        ['releaseDate', 'DESC'],
      ],
      where: { gameId, ...typeConditions, ...rarityConditions },
      raw: true,
      nest: true,
    });
  }

  /**
   * 캐릭터 상세 정보 조회
   * @param id - 캐릭터 ID
   * @returns 캐릭터의 상세 정보 (스탯, 아이템, 랭크)
   */
  async getCharacterDetail(id: string) {
    return await Character.findOne({
      include: [
        {
          model: CharacterInfo,
          as: 'info',
          attributes: ['stats', 'itemData', 'ranks'],
        },
      ],
      where: { id },
      raw: true,
      nest: true,
    });
  }

  /**
   * 캐릭터 추가 정보 조회 (속성, 경로, 스킬, 이미지)
   * @param elementId - 속성 ID
   * @param pathId - 경로 ID
   * @param characterId - 캐릭터 ID
   * @returns [속성정보, 경로정보, 스킬정보, 이미지정보] 배열
   */
  async getCharacterAdditionalInfo(
    elementId: string,
    weaponType: string,
    corpType: string,
    characterId: string,
  ) {
    return await Promise.all([
      // 속성 정보
      TypeDef.findOne({
        include: [
          {
            model: TypeImage,
            as: 'image',
            attributes: ['url', 'backgroundColor'],
          },
        ],
        attributes: ['name', 'id'],
        where: { id: elementId },
        raw: true,
        nest: true,
      }),

      // 경로 정보
      TypeDef.findOne({
        include: [
          {
            model: TypeImage,
            as: 'image',
            attributes: ['url', 'backgroundColor'],
          },
        ],
        attributes: ['name', 'id'],
        where: { id: weaponType },
        raw: true,
        nest: true,
      }),

      // 경로 정보
      TypeDef.findOne({
        include: [
          {
            model: TypeImage,
            as: 'image',
            attributes: ['url', 'backgroundColor'],
          },
        ],
        attributes: ['name', 'id'],
        where: { id: corpType },
        raw: true,
        nest: true,
      }),

      // 스킬 정보
      Skill.findAll({
        include: [
          {
            model: SkillImage,
            as: 'image',
            attributes: ['url', 'backgroundColor'],
          },
        ],
        where: { characterId: characterId },
        attributes: [
          'name',
          'tag',
          'info',
          'type',
          'levelData',
          'levelReq',
          'promotionReq',
        ],
        raw: true,
        nest: true,
      }),

      // 캐릭터 이미지 (카드 제외)
      CharacterImage.findAll({
        where: {
          characterId,
          layout: { [Op.notLike]: '%card' },
        },
        order: [['layout', 'DESC']],
        raw: true,
      }),
    ]);
  }

  /**
   * 캐릭터 장착 아이템 정보 조회
   * @param itemData - 아이템 데이터 객체 {card: [], relics: [], accessories: []}
   * @returns [카드아이템, 유물아이템, 장신구아이템] 배열
   */
  async getCharacterItems(itemData: any) {
    return await Promise.all([this.itemForSearch(itemData.weapon)]);
  }
}
export default new GirlsFrontline2CharacterQuery();
