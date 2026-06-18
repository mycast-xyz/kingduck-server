import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { ImageDownloader } from '../../utils/ImageDownloader';
import logger from '../../../utils/logger';
import { prisma } from '../../../utils/prisma';
import {
  fetchPageConfig,
  srsAssetUrl,
  SRS_BASE,
  mapDamageTypeToEn,
  mapPathToEn,
} from '../../utils/srsPageConfig';

/**
 * 캐릭터 스크래퍼 — starrailstation.com 소스.
 *
 * 기존 hakush(api.hakush.in) 소스가 소실되어 SRS PAGE_CONFIG로 교체.
 * 출력 metadata는 hakush 시절 키를 그대로 유지해 프론트(HonkaiStarRailInit 레이아웃)와 호환:
 *   element/path(영문 키), skills, ranks_raw, eidolons, stats(인덱스 객체), skill_tree/skillTrees,
 *   voiceLines, stories, camp, cardImageUrl, originalId 등.
 *
 * 중요 1) element/path는 프론트 필터가 **영문 키**(Fire/Warlock…)로 매칭하므로, SRS의 한국어
 *   이름(화염/공허…)을 영문으로 역매핑한다(아래 맵). 안 그러면 elements 중복 생성 + 필터 깨짐.
 * 중요 2) SRS가 제공하지 않는 추천 필드(teams/lightcones/relics)는 기존 DB metadata를 **merge로 보존**.
 *
 * - 목록: https://starrailstation.com/kr/characters  (entries: rankKey=인게임ID=originalId, pageId=상세슬러그)
 * - 상세: https://starrailstation.com/kr/character/{pageId}
 */
export class CharacterScraper extends ScraperBase {
  private readonly LIST_URL = `${SRS_BASE}/kr/characters`;
  private readonly DETAIL_BASE = `${SRS_BASE}/kr/character`;

  constructor() {
    super('starrail');
  }

  async scrape(limit?: number): Promise<ScrapedData[]> {
    logger.info('Starting Star Rail Character scraping (StarRailStation)...');
    const results: ScrapedData[] = [];

    const game = await prisma.game.findUnique({ where: { slug: 'starrail' } });
    if (!game) {
      throw new Error('Star Rail game record not found in database!');
    }

    // 1. 목록
    const listConfig = await fetchPageConfig(this.LIST_URL);
    let entries: any[] = Array.isArray(listConfig.entries)
      ? listConfig.entries
      : [];
    if (entries.length === 0) {
      throw new Error('Character list has 0 entries (SRS 구조 변경 의심)');
    }
    if (limit) entries = entries.slice(0, limit);
    logger.info(`Found ${entries.length} characters from StarRailStation.`);

    let processed = 0;
    let detailErrors = 0;
    for (const entry of entries) {
      processed++;
      const pageId = entry.pageId;
      const originalId = String(entry.rankKey ?? '');
      if (!pageId || !originalId) {
        logger.warn(`Character entry missing pageId/rankKey: ${entry.name}`);
        continue;
      }
      logger.info(
        `[SR-Char] ${processed}/${entries.length} ${entry.name} (${originalId}) - ${((processed / entries.length) * 100).toFixed(1)}%`,
      );

      try {
        const detailUrl = `${this.DETAIL_BASE}/${pageId}`;
        const detail = await fetchPageConfig(detailUrl);

        // SRS 이름에 <nobr> 등 HTML 태그가 섞여 옴(예: "은랑 LV.<nobr>999</nobr>") → 태그 제거.
        const name = this.stripHtml(detail.name || entry.name || `Char_${originalId}`);
        const rarity = detail.rarity ?? entry.rarity ?? 4;
        const elementEn = mapDamageTypeToEn(
          detail.damageType?.name || entry.damageType?.name,
        );
        const pathEn = mapPathToEn(
          detail.baseType?.name || entry.baseType?.name,
        );

        // 이미지 종류:
        //  - splashIconPath(376x512 세로 포트레이트) = 리스트 카드용 메인 이미지(원하는 형태)
        //  - iconPath(376x512 아바타) = 포트레이트 없을 때 폴백
        //  - artPath/figPath(2048 정사각 스플래시) = 상세 큰 이미지(cardImageUrl), 리스트엔 쓰지 않음
        const localSplashUrl = await this.dl(
          detail.splashIconPath || entry.splashIconPath,
          `splash_${originalId}`,
        );
        const localIconUrl = await this.dl(
          detail.iconPath || entry.iconPath,
          `icon_${originalId}`,
        );
        const localCardUrl = await this.dl(
          detail.artPath || detail.figPath || detail.splashIconPath,
          `card_${originalId}`,
        );
        // 속성/운명의 길 아이콘(필터용) — 소스가 damageType/baseType.iconPath로 제공.
        // 속성별 1개 파일로 저장(elementEn/pathEn 키) → DataSyncService가 Element.iconUrl에 적재(빈 경우만).
        const elementIconUrl = await this.dl(
          detail.damageType?.iconPath || entry.damageType?.iconPath,
          `element_${elementEn}`,
          'element',
        );
        const pathIconUrl = await this.dl(
          detail.baseType?.iconPath || entry.baseType?.iconPath,
          `path_${pathEn}`,
          'element',
        );

        // 가공
        const skills = await this.processSkills(detail.skills, originalId);
        const ranks = await this.processRanks(detail.ranks, originalId);
        const traces = await this.processTraces(
          detail.skillTreePoints,
          originalId,
        );
        const stats = this.processStats(detail.levelData);

        // SRS가 채우는 필드만 모음(나머지는 기존 metadata 보존)
        const srsMeta: Record<string, any> = {
          originalId,
          rarity,
          element: elementEn,
          path: pathEn,
          elementIconUrl, // DataSyncService가 Element(DamageType).iconUrl로 적재
          pathIconUrl, // Element(Path).iconUrl로 적재
          camp: detail.archive?.camp,
          cardImageUrl: localCardUrl, // 2048 정사각 스플래시 — 상세 큰 이미지
          splashImageUrl: localSplashUrl, // 376x512 세로 포트레이트(리스트 메인)
          iconImageUrl: localIconUrl, // 376x512 아바타 — 폴백
          description: detail.descHash,
          skills,
          skills_raw: detail.skills,
          ranks_raw: ranks, // 성혼(RankListView) — Id/name/Desc/ParamList/Image 키
          eidolons: ranks.map((r) => ({
            rank: r.Id,
            name: r.name,
            desc: r.Desc,
            iconUrl: r.iconUrl,
          })),
          skill_tree: traces, // 행적(TraceListView) 레이아웃 키
          skillTrees: traces, // 기존 키(파리티)
          stats,
          voiceLines: detail.voiceItems,
          stories: detail.storyItems,
        };

        // 기존 metadata 병합(SRS 미제공 추천 필드 teams/lightcones/relics 보존)
        const existing = await prisma.character.findFirst({
          where: {
            gameId: game.id,
            metadata: { path: ['originalId'], equals: originalId },
          },
          select: { metadata: true },
        });
        const existingMeta =
          existing && existing.metadata && typeof existing.metadata === 'object'
            ? (existing.metadata as Record<string, any>)
            : {};

        const metadata = { ...existingMeta, ...srsMeta };

        results.push({
          name,
          sourceUrl: detailUrl,
          // 리스트 카드용: 세로 포트레이트(splashIconPath) 우선, 없으면 아이콘. artPath(2048)는 리스트에 안 씀.
          imageUrl: localSplashUrl || localIconUrl,
          rarity,
          weaponType: pathEn, // hakush 시절 weaponType=BaseType 관행 유지
          description: detail.descHash,
          metadata,
        });
      } catch (innerErr) {
        detailErrors++;
        logger.error(`Failed to process character ${pageId}:`, innerErr);
      }
    }

    if (results.length === 0 && detailErrors > 0) {
      throw new Error(
        `All ${detailErrors} character detail fetches failed (SRS 장애/구조 변경 의심)`,
      );
    }
    if (detailErrors > 0) {
      logger.warn(
        `Character scrape partial: ${results.length} ok / ${detailErrors} failed`,
      );
    }
    return results;
  }

  // SRS 이름의 HTML 태그(<nobr> 등) 제거 + 공백 정리.
  private stripHtml(s: string): string {
    return (s || '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async dl(
    iconPath: string | undefined | null,
    fileName: string,
    category = 'character',
  ): Promise<string | null> {
    const url = srsAssetUrl(iconPath);
    if (!url) return null;
    return ImageDownloader.downloadAndSave(url, 'starrail', category, fileName);
  }

  /**
   * 스킬 → 프론트(HsrSkillTreeViewModel) 형태: { id, type, name, desc, iconUrl, params, maxLevel }
   * params는 최고 레벨치(서술 #N[i]% 치환용 단일 배열).
   */
  private async processSkills(skills: any[], charId: string): Promise<any[]> {
    if (!Array.isArray(skills)) return [];
    const out: any[] = [];
    for (const s of skills) {
      const levelData: any[] = Array.isArray(s.levelData) ? s.levelData : [];
      const topParams = levelData.length
        ? levelData[levelData.length - 1].params || []
        : [];
      const iconUrl = await this.dl(s.iconPath, `skill_${charId}_${s.id}`, 'skill');
      out.push({
        id: s.id,
        type: s.typeDescHash || null,
        tag: s.tagHash || null,
        name: s.name,
        desc: s.descHash,
        iconUrl,
        params: topParams,
        maxLevel: levelData.length || undefined,
      });
    }
    return out;
  }

  /**
   * 성혼(Eidolon) → RankListView 형태: { Id, name, Desc, ParamList, Image, iconUrl }
   */
  private async processRanks(ranks: any[], charId: string): Promise<any[]> {
    if (!Array.isArray(ranks)) return [];
    const out: any[] = [];
    for (const r of ranks) {
      const iconUrl = await this.dl(
        r.iconPath,
        `rank_${charId}_${r.id}`,
        'character',
      );
      out.push({
        Id: r.id,
        name: r.name,
        Desc: r.descHash,
        ParamList: Array.isArray(r.params) ? r.params : [],
        Image: iconUrl,
        iconUrl,
      });
    }
    return out;
  }

  /**
   * 행적(Trace) 트리 → TraceListView가 읽는 평탄 배열.
   * - embedBonusSkill 노드(능력): { name, description/Desc, Icon, ParamList }
   * - embedBuff 노드(스탯강화): { name, Name, Icon, ParamList }
   */
  private async processTraces(points: any[], charId: string): Promise<any[]> {
    if (!Array.isArray(points)) return [];
    const out: any[] = [];

    const walk = async (node: any) => {
      if (!node) return;
      if (node.embedBonusSkill) {
        const b = node.embedBonusSkill;
        const icon = await this.dl(
          b.iconPath,
          `trace_${charId}_${node.id}`,
          'skill',
        );
        out.push({
          name: b.name || '',
          Desc: b.descHash,
          description: b.descHash,
          Icon: icon,
          ParamList: Array.isArray(b.params) ? b.params : [],
        });
      } else if (node.embedBuff) {
        const b = node.embedBuff;
        const icon = await this.dl(
          b.iconPath,
          `trace_${charId}_${node.id}`,
          'skill',
        );
        out.push({
          name: b.name || '',
          Name: b.name || '',
          Icon: icon,
          ParamList: [],
        });
      }
      if (Array.isArray(node.children)) {
        for (const c of node.children) await walk(c);
      }
    };

    for (const p of points) await walk(p);
    return out;
  }

  /**
   * 승급별 스탯 → 프론트(HsrStatsViewModel) 인덱스 객체.
   * { "0": { HPBase, HPAdd, AttackBase, AttackAdd, DefenceBase, DefenceAdd,
   *          SpeedBase, CriticalChance, CriticalDamage, BaseAggro,
   *          Cost: [{ ItemID, ItemNum }] }, "1": {...}, ... }
   */
  private processStats(levelData: any[]): Record<string, any> | null {
    if (!Array.isArray(levelData) || levelData.length === 0) return null;
    const stats: Record<string, any> = {};
    levelData.forEach((d, i) => {
      stats[String(i)] = {
        HPBase: d.hpBase,
        HPAdd: d.hpAdd,
        AttackBase: d.attackBase,
        AttackAdd: d.attackAdd,
        DefenceBase: d.defenseBase,
        DefenceAdd: d.defenseAdd,
        SpeedBase: d.speedBase,
        CriticalChance: d.crate,
        CriticalDamage: d.cdmg,
        BaseAggro: d.aggro,
        Cost: Array.isArray(d.cost)
          ? d.cost.map((c: any) => ({ ItemID: c.id, ItemNum: c.count }))
          : [],
      };
    });
    return stats;
  }
}
