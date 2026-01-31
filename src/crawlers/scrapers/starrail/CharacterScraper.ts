import axios from 'axios';
import fs from 'fs';
import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { ImageDownloader } from '../../utils/ImageDownloader';
import logger from '../../../utils/logger';
import { prisma } from '../../../utils/prisma';

export class CharacterScraper extends ScraperBase {
  private readonly LIST_API_URL =
    'https://api.hakush.in/hsr/data/character.json';
  private readonly DETAIL_API_BASE =
    'https://api.hakush.in/hsr/data/kr/character';

  constructor() {
    super('starrail');
  }

  async scrape(limit?: number): Promise<ScrapedData[]> {
    logger.info('Starting Star Rail Character scraping (API mode)...');
    const results: ScrapedData[] = [];

    try {
      // 1. Fetch List
      const { data: charMap } = await axios.get(this.LIST_API_URL);
      // charMap is object { id: { ...basic info } }
      let charIds = Object.keys(charMap);

      if (limit) {
        charIds = charIds.slice(0, limit);
      }

      logger.info(`Found ${charIds.length} characters.`);

      let processedCount = 0;
      const totalCount = charIds.length;

      for (const id of charIds) {
        processedCount++;
        logger.info(
          `[SR-Char] Processing character ${processedCount}/${totalCount} (ID: ${id}) - ${((processedCount / totalCount) * 100).toFixed(1)}%`,
        );
        try {
          // 2. Fetch Detail
          const detailUrl = `${this.DETAIL_API_BASE}/${id}.json`;
          const { data: detail } = await axios.get(detailUrl);

          // DEBUG: Save first character JSON
          if (results.length === 0) {
            fs.writeFileSync(
              'starrail_character_sample.json',
              JSON.stringify(detail, null, 2),
            );
            logger.info(
              'Saved sample character JSON to starrail_character_sample.json',
            );
          }

          // Basic info from detail or map
          // detail.Name is the localized character name from Korean API
          let name = detail.Name || charMap[id].kr || `Char_${id}`;

          // Parse rarity from "CombatPowerAvatarRarityType4" -> 4
          let rarity = 4; // default
          if (detail.Rarity && typeof detail.Rarity === 'string') {
            const match = detail.Rarity.match(/Type(\d+)/);
            if (match) {
              rarity = parseInt(match[1]);
            }
          }

          // 3. Images as per updated requirement:
          // List Icon: https://api.hakush.in/hsr/UI/avatarshopicon/{id}.webp
          const iconRemoteUrl = `https://api.hakush.in/hsr/UI/avatarshopicon/${id}.webp`;
          const localIconUrl = await ImageDownloader.downloadAndSave(
            iconRemoteUrl,
            'starrail',
            'character',
            `icon_${id}`,
          );

          // Card Image: https://api.hakush.in/hsr/UI/avatardrawcard/{id}.webp
          const cardRemoteUrl = `https://api.hakush.in/hsr/UI/avatardrawcard/${id}.webp`;
          const localCardUrl = await ImageDownloader.downloadAndSave(
            cardRemoteUrl,
            'starrail',
            'character',
            `card_${id}`,
          );

          results.push({
            name: name,
            sourceUrl: detailUrl,
            imageUrl: localIconUrl, // Main icon
            rarity: rarity, // Use parsed rarity
            weaponType: detail.BaseType,
            role: detail.Role,
            description: detail.Desc,
            metadata: {
              originalId: id,
              cardImageUrl: localCardUrl,
              rarity: rarity,
              element: detail.DamageType,
              path: detail.BaseType,
              camp: detail.CharaInfo?.Camp,
              stats: detail.Stats, // Base stats (HP, ATK, DEF, Speed, etc.)
              promotions: detail.Promotions, // Ascension stats map
              stories: detail.CharaInfo?.Stories, // Background stories
              voiceLines: detail.CharaInfo?.Voicelines, // Voice lines
              skills: await this.processSkills(
                detail.Skills,
                detail.SkillTrees,
              ),
              eidolons: await this.processEidolons(id, detail.Ranks),
              skillTrees: this.processSkillTrees(detail.SkillTrees),

              // Raw backups for completeness
              skills_raw: detail.Skills,
              ranks_raw: detail.Ranks,
              promotions_raw: detail.Promotions,

              // Recommendations
              teams: detail.Teams,
              gradings: detail.Gradings, // Relics, Lightcones recommendations
              lightcones: detail.Lightcones,
              relics: detail.Relics,
            },
          });
        } catch (innerErr) {
          logger.error(`Failed to process character ${id}:`, innerErr);
        }
      }
    } catch (e) {
      logger.error('Error scraping Star Rail characters:', e);
    }

    return results;
  }

  private async processEidolons(charId: string, ranks: any): Promise<any[]> {
    const eidolons: any[] = [];
    if (!ranks) return eidolons;

    for (const rankKey of Object.keys(ranks)) {
      const rankData = ranks[rankKey];
      // Rank is usually 1-6
      const rankNum = parseInt(rankKey);

      // Icon URL Pattern: https://api.hakush.in/hsr/UI/rank/_dependencies/textures/{id}/{id}_Rank_{rank}.webp
      // Note: User example was 1321/1321_Rank_2.webp. Assuming charId is 1321.
      const iconRemoteUrl = `https://api.hakush.in/hsr/UI/rank/_dependencies/textures/${charId}/${charId}_Rank_${rankNum}.webp`;
      const localIconUrl = await ImageDownloader.downloadAndSave(
        iconRemoteUrl,
        'starrail',
        'character',
        `rank_${charId}_${rankNum}`,
      );

      eidolons.push({
        rank: rankNum,
        name: rankData.Name,
        desc: rankData.Desc,
        iconUrl: localIconUrl,
      });
    }
    return eidolons;
  }

  private async processSkills(skillsMap: any, skillTrees: any): Promise<any[]> {
    const results: any[] = [];
    if (!skillsMap) return results;

    const skillIds = Object.keys(skillsMap);
    for (const skillId of skillIds) {
      const skill = skillsMap[skillId];

      // Find Icon from SkillTrees
      let iconFilename = '';
      if (skillTrees) {
        for (const treeKey of Object.keys(skillTrees)) {
          const levelOne = skillTrees[treeKey]['1']; // Level 1 info has the icon
          if (
            levelOne &&
            levelOne.LevelUpSkillID &&
            levelOne.LevelUpSkillID.includes(parseInt(skillId))
          ) {
            iconFilename = levelOne.Icon;
            break;
          }
        }
      }

      let localIconUrl = '';
      if (iconFilename) {
        // Replace .png with .webp
        const webpFilename = iconFilename.replace('.png', '.webp');
        // https://api.hakush.in/hsr/UI/skillicons/SkillIcon_1321_Passive.webp
        const remoteUrl = `https://api.hakush.in/hsr/UI/skillicons/${webpFilename}`;
        // Save as skill_SkillIcon_...
        const savedUrl = await ImageDownloader.downloadAndSave(
          remoteUrl,
          'starrail',
          'skill',
          `skill_${webpFilename.replace('.webp', '')}`,
        );
        if (savedUrl) localIconUrl = savedUrl;
      }

      // Extract params (using Level 1 as base)
      const levelOneParams =
        skill.Level && skill.Level['1'] ? skill.Level['1'].ParamList : [];

      results.push({
        id: skillId,
        type: skill.Type,
        name: skill.Name,
        desc: skill.Desc,
        simpleDesc: skill.SimpleDesc,
        tag: skill.Tag,
        iconUrl: localIconUrl,
        params: levelOneParams,
      });
    }
    return results;
  }

  private processSkillTrees(skillTrees: any): any[] {
    const results: any[] = [];
    if (!skillTrees) return results;

    // SkillTrees structure: { Point01: { 1: {...}, 2: {...} }, Point02: {...}, ... }
    for (const anchor of Object.keys(skillTrees)) {
      const levels = skillTrees[anchor];

      for (const levelKey of Object.keys(levels)) {
        const node = levels[levelKey];

        // Extract skill ID if this node upgrades a skill
        const skillId =
          node.LevelUpSkillID && node.LevelUpSkillID.length > 0
            ? node.LevelUpSkillID[0].toString()
            : null;

        // Extract materials
        const materials = (node.MaterialList || []).map((mat: any) => ({
          itemId: mat.ItemID,
          count: mat.ItemNum,
          rarity: mat.Rarity,
        }));

        // Extract stat bonuses
        const statBonus = (node.StatusAddList || []).map((stat: any) => ({
          type: stat.PropertyType,
          value: stat.Value,
        }));

        results.push({
          pointId: node.PointID,
          anchor: anchor,
          level: parseInt(levelKey),
          skillId: skillId,
          maxLevel: node.MaxLevel,
          icon: node.Icon,
          unlockPromotion: node.AvatarPromotionLimit,
          unlockLevel: node.AvatarLevelLimit,
          defaultUnlock: node.DefaultUnlock,
          materials: materials,
          statBonus: statBonus,
          prePoints: node.PrePoint || [],
        });
      }
    }

    return results;
  }
}
