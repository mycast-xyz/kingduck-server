import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { ImageDownloader } from '../../utils/ImageDownloader';
import { axiosGetWithRetry } from '../../utils/httpRetry';
import logger from '../../../utils/logger';
import { prisma } from '../../../utils/prisma';

/**
 * 원신 캐릭터 스크래퍼 — Ambr(gi.yatta.moe) 소스.
 *
 * 기존 honeyhunterworld 목 스텁을 Ambr 공개 API 기반 실제 구현으로 교체.
 *   - 목록:  https://gi.yatta.moe/api/v2/kr/avatar         → data.items { id: {...} }
 *   - 상세:  https://gi.yatta.moe/api/v2/kr/avatar/{id}     → talent/constellation/upgrade/fetter 등
 *   - 이미지: https://gi.yatta.moe/assets/UI/{icon}.png      (icon: UI_AvatarIcon_*)
 *            카드(스플래시)는 icon의 UI_AvatarIcon_ → UI_Gacha_AvatarImg_ 치환.
 *
 * metadata 계약(프론트 GenshinInit / 공통 list 컴포넌트와 호환):
 *   - originalId : Ambr avatar id(예 10000002) — syncCharacters 매칭 키
 *   - element    : Ambr 원소 영문 키(Fire/Water/Wind/Elec/Grass/Ice/Rock) → DamageType 필터
 *   - path       : 무기 영문 키(Sword/Claymore/Polearm/Bow/Catalyst) → Path(무기) 필터
 *   - rarity     : rank(5/4)
 *   - region     : 소속 지역(MONDSTADT/LIYUE/…)
 *   - cardImageUrl: 가챠 스플래시(MainItemView 등이 우선 사용)
 *   - talent/constellation/stats: 상세의 raw 데이터(콘텐츠 상세용 — 추후 genshin 뷰모델에서 활용)
 *
 * 참고) element/path를 영문 키로 저장하는 이유는 starrail과 동일 — 프론트 필터가 영문 키로 매칭한다.
 */

// Ambr weaponType → 프론트/Path 필터용 깔끔한 영문 키
const WEAPON_TYPE_MAP: Record<string, string> = {
  WEAPON_SWORD_ONE_HAND: 'Sword',
  WEAPON_CLAYMORE: 'Claymore',
  WEAPON_POLE: 'Polearm',
  WEAPON_BOW: 'Bow',
  WEAPON_CATALYST: 'Catalyst',
};

// 무기타입(Path) → Ambr 무기타입 아이콘 자산 접미(UI_GachaTypeIcon_*). Polearm만 'Pole'.
const WEAPON_ICON_ASSET: Record<string, string> = {
  Sword: 'Sword',
  Claymore: 'Claymore',
  Polearm: 'Pole',
  Bow: 'Bow',
  Catalyst: 'Catalyst',
};

const AMBR_BASE = 'https://gi.yatta.moe';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export class GenshinCharacterScraper extends ScraperBase {
  private readonly LIST_URL = `${AMBR_BASE}/api/v2/kr/avatar`;
  private readonly DETAIL_BASE = `${AMBR_BASE}/api/v2/kr/avatar`;

  constructor() {
    super('genshin');
  }

  async scrape(limit?: number): Promise<ScrapedData[]> {
    logger.info('Starting Genshin Character scraping (Ambr/gi.yatta.moe)...');
    const results: ScrapedData[] = [];

    const game = await prisma.game.findUnique({ where: { slug: 'genshin' } });
    if (!game) {
      throw new Error('Genshin game record not found in database!');
    }

    // 1. 목록
    const listRes = await axiosGetWithRetry<any>(this.LIST_URL, {
      timeout: 20000,
      headers: { 'User-Agent': UA },
    });
    const items = listRes.data?.data?.items;
    if (!items || typeof items !== 'object') {
      throw new Error('Avatar list empty/malformed (Ambr 구조 변경 의심)');
    }
    let entries = Object.values<any>(items);
    if (entries.length === 0) {
      throw new Error('Avatar list has 0 entries (Ambr 구조 변경 의심)');
    }
    if (limit) entries = entries.slice(0, limit);
    logger.info(`Found ${entries.length} characters from Ambr.`);

    let processed = 0;
    let detailErrors = 0;
    for (const entry of entries) {
      processed++;
      const originalId = String(entry.id ?? '');
      if (!originalId) {
        logger.warn(`Avatar entry missing id: ${entry.name}`);
        continue;
      }
      logger.info(
        `[GI-Char] ${processed}/${entries.length} ${entry.name} (${originalId}) - ${((processed / entries.length) * 100).toFixed(1)}%`,
      );

      try {
        const detailUrl = `${this.DETAIL_BASE}/${originalId}`;
        const detailRes = await axiosGetWithRetry<any>(detailUrl, {
          timeout: 20000,
          headers: { 'User-Agent': UA },
        });
        const d = detailRes.data?.data ?? {};

        const name = d.name || entry.name || `Char_${originalId}`;
        const rarity = Number(d.rank ?? entry.rank ?? 4);
        const element = String(d.element || entry.element || '');
        const weaponKey =
          WEAPON_TYPE_MAP[d.weaponType || entry.weaponType] ||
          String(d.weaponType || entry.weaponType || '');
        const region = String(d.region || entry.region || '');
        const icon = String(d.icon || entry.icon || '');

        // 이미지: 아이콘 + 가챠 스플래시
        const localIconUrl = await this.dlIcon(icon, `icon_${originalId}`);
        const cardIcon = icon.replace(
          'UI_AvatarIcon_',
          'UI_Gacha_AvatarImg_',
        );
        const localCardUrl = await this.dlIcon(cardIcon, `card_${originalId}`);

        // 속성 아이콘(필터용) — Ambr 자산 UI_Buff_Element_{Fire|Water|Ice|Electric|Wind|Rock|Grass}.png.
        // DB Element(DamageType) 이름이 이 내부명과 동일 → 그대로 사용. 속성별 1개 파일.
        // DataSyncService가 Element.iconUrl에 적재(빈 경우만 — 수동값 보존).
        const localElementIconUrl = element
          ? await this.dlIcon(
              `UI_Buff_Element_${element}`,
              `element_${element}`,
              'element',
            )
          : null;
        // 무기타입 아이콘(Path 필터) — Ambr UI_GachaTypeIcon_{Sword|Claymore|Pole|Bow|Catalyst}.png.
        const weaponAsset = WEAPON_ICON_ASSET[weaponKey];
        const localPathIconUrl = weaponAsset
          ? await this.dlIcon(
              `UI_GachaTypeIcon_${weaponAsset}`,
              `path_${weaponKey}`,
              'element',
            )
          : null;

        // 상세 raw(콘텐츠 상세용 — 추후 genshin 뷰모델에서 가공)
        const description =
          (d.fetter && typeof d.fetter === 'object' && d.fetter.detail) || '';

        // 프론트 콘텐츠 컴포넌트(SkillTreeView/RankListView)가 starrail과 동일하게 읽도록
        // HSR 형태로 가공한다: skills(스킬) / ranks_raw(별자리=성혼 등가).
        const skills = await this.processTalents(d.talent, originalId);
        const ranks_raw = await this.processConstellations(
          d.constellation,
          originalId,
        );

        const metadata: Record<string, any> = {
          originalId,
          rarity,
          element,
          elementIconUrl: localElementIconUrl, // DataSyncService가 Element(DamageType).iconUrl로 적재
          path: weaponKey,
          pathIconUrl: localPathIconUrl, // Element(Path).iconUrl로 적재
          weaponType: weaponKey,
          region,
          birthday: d.birthday ?? entry.birthday ?? null,
          cardImageUrl: localCardUrl,
          description,
          fetter: d.fetter ?? null,
          // 프론트 렌더용(HSR 호환 형태)
          skills,
          ranks_raw,
          // 원본 raw(추후 스탯 등 가공용 보존)
          talent: d.talent ?? null,
          constellation: d.constellation ?? null,
          stats: d.upgrade ?? null,
          ascension: d.ascension ?? null,
        };

        results.push({
          name,
          sourceUrl: detailUrl,
          imageUrl: localIconUrl,
          rarity,
          weaponType: weaponKey,
          description,
          metadata,
        });
      } catch (innerErr) {
        detailErrors++;
        logger.error(`Failed to process character ${originalId}:`, innerErr);
      }
    }

    if (results.length === 0 && detailErrors > 0) {
      throw new Error(
        `All ${detailErrors} character detail fetches failed (Ambr 장애/구조 변경 의심)`,
      );
    }
    if (detailErrors > 0) {
      logger.warn(
        `Genshin character scrape partial: ${results.length} ok / ${detailErrors} failed`,
      );
    }
    return results;
  }

  /**
   * talent(스킬) → SkillTreeView가 읽는 HSR 호환 형태.
   * Ambr talent: { "0": { name, icon, type, promote: { "1": { level, params, description } } } }
   * 출력: { id, name, type, iconUrl, descLines, levelData:[{level,params}], maxLevel }
   *   - descLines: "라벨|{param1:F1P}" 형식의 줄 배열(레벨 무관 템플릿). VM이 레벨별 params로 치환.
   */
  private async processTalents(
    talent: any,
    charId: string,
  ): Promise<any[]> {
    if (!talent || typeof talent !== 'object') return [];
    const out: any[] = [];
    for (const key of Object.keys(talent)) {
      const t = talent[key];
      if (!t || typeof t !== 'object') continue;
      const promote =
        t.promote && typeof t.promote === 'object' ? t.promote : {};
      const lvKeys = Object.keys(promote)
        .map((n) => Number(n))
        .filter((n) => !Number.isNaN(n))
        .sort((a, b) => a - b);
      const levelData = lvKeys.map((lv) => ({
        level: promote[lv].level ?? lv,
        params: Array.isArray(promote[lv].params) ? promote[lv].params : [],
      }));
      const firstLv = lvKeys[0];
      const descLines: string[] = Array.isArray(promote[firstLv]?.description)
        ? promote[firstLv].description
        : [];
      const iconUrl = await this.dlIcon(
        t.icon,
        `talent_${charId}_${key}`,
        'skill',
      );
      out.push({
        id: key,
        name: t.name || '',
        type: null,
        iconUrl,
        descLines,
        levelData,
        maxLevel: levelData.length || 1,
      });
    }
    return out;
  }

  /**
   * constellation(별자리) → RankListView가 읽는 HSR(성혼) 호환 형태.
   * Ambr constellation: { "0": { id, name, icon, description, descriptionBuff } }
   * 출력: { Id, name, Desc, ParamList:[], Image, iconUrl }
   */
  private async processConstellations(
    constellation: any,
    charId: string,
  ): Promise<any[]> {
    if (!constellation || typeof constellation !== 'object') return [];
    const out: any[] = [];
    for (const key of Object.keys(constellation)) {
      const c = constellation[key];
      if (!c || typeof c !== 'object') continue;
      const iconUrl = await this.dlIcon(
        c.icon,
        `constellation_${charId}_${key}`,
        'character',
      );
      out.push({
        Id: c.id ?? Number(key),
        name: c.name || '',
        Desc: c.description || '',
        ParamList: [],
        Image: iconUrl,
        iconUrl,
      });
    }
    return out;
  }

  private async dlIcon(
    icon: string | undefined | null,
    fileName: string,
    category = 'character',
  ): Promise<string | null> {
    if (!icon) return null;
    const url = `${AMBR_BASE}/assets/UI/${icon}.png`;
    return ImageDownloader.downloadAndSave(url, 'genshin', category, fileName);
  }
}
