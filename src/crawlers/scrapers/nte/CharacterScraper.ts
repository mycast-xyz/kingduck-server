import axios from 'axios';
import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { ImageDownloader } from '../../utils/ImageDownloader';
import { prisma } from '../../../utils/prisma';
import logger from '../../../utils/logger';
import { crawlProgress } from '../../crawlProgress';

/**
 * 이환(異環 / Neverness to Everness, NTE) 캐릭터(이능력자/Esper) 스크래퍼.
 *
 * 소스: everness.info **GraphQL API** (Apollo, 인증 불필요, 렌더 불필요).
 *   - 엔드포인트: POST https://everness.info/api/graphql
 *   - 한국어: 헤더 `Accept-Language: ko` (없으면 영어) — 니케 이벤트 스크래퍼와 동일 발상(직접 axios.post).
 *   - 목록: query { espers { id name element rarity iconGacha arcs_tags{...} } } (현재 19명)
 *   - 상세: query { esper(id) { stats abilities awaken resonance faction birthday ... } }
 *
 * 이미지 해석:
 *   - iconGacha/arcs_tags.icon/skill icon = `/Game/UI/...` → `https://api.everness.info/data/assets/{접두 /Game/UI/ 제거}.webp`
 *   - element(속성) 아이콘 = `https://everness.info/data/icons/card/Type={Element}.webp` (GraphQL에 직접 필드 없음 — 사이트 규칙 실측)
 *
 * Element 매핑:
 *   - element(Incantation/Chaos/Cosmos/Lakshana/Anima/Psyche) → Element(type 'DamageType')
 *   - arcs_tags(무기/형질: 고체/액체/플라스마/기체/결합) → Element(type 'Path')
 *   아이콘은 metadata.elementIconUrl / pathIconUrl 로 공급 → DataSyncService가 Element.iconUrl 적재.
 */

const GRAPHQL = 'https://everness.info/api/graphql';
const ASSET_BASE = 'https://api.everness.info/data/assets';
const ELEMENT_ICON_BASE = 'https://everness.info/data/icons/card';
const GAME = 'nte';

const LIST_QUERY = `query {
  espers { id name element rarity iconGacha arcs_tags { id name icon type_id } }
}`;

const DETAIL_QUERY = `query($id: String!) {
  esper(id: $id) {
    id name element rarity element_id element_name weapon_type_id
    icon iconBig iconGacha faction birthday description introduction abilityName
    arcs_tags { name icon type_id }
    stats { id_stats name values icon }
    abilities { name type_name icon phases { title description shortDescription } additional_desc { name desc } }
    awaken { name desc icon type_name }
    resonance { name desc icon type_name }
    profile_detail { name desc }
    fashion { fashionId name desc quality icon displayIcon portraitImg headIconBig isDefault }
    voices { daily { name desc } battle { name desc } }
    breakthrough { level items_id amount }
    preferrable_gifts { item_id amount }
  }
}`;

// 재료/선물 이름·아이콘 해석용 전체 아이템 룩업.
const ITEMS_QUERY = `query { items(filter: {}) { id name icon } }`;
// item()으로 안 잡히는 특수 통화 id → 한글 라벨.
const SPECIAL_ITEMS: Record<string, string> = { gold: '골드', Gold: '골드' };

interface EsperListItem {
  id: string;
  name: string;
  element: string;
  rarity: number;
  iconGacha: string | null;
  arcs_tags: { id: string | null; name: string; icon: string | null; type_id: string } | null;
}

export class NteCharacterScraper extends ScraperBase {
  // 아이템 id → { name, icon }. scrape() 시작 시 1회 적재.
  private itemMap = new Map<string, { name: string; icon: string | null }>();
  // 아이템 아이콘 다운로드 캐시(같은 자산 중복 다운로드 방지).
  private itemIconCache = new Map<string, string>();

  constructor() {
    super(GAME);
  }

  /** 아이템 아이콘(/Game/UI/...) 다운로드(캐시). 실패/없으면 ''. */
  private async itemIcon(icon: string | null | undefined): Promise<string> {
    if (!icon) return '';
    const cached = this.itemIconCache.get(icon);
    if (cached !== undefined) return cached;
    let path = '';
    const base = this.baseName(icon);
    const url = this.assetUrl(icon);
    if (base && url) {
      path = (await ImageDownloader.downloadAndSave(url, GAME, 'item', base)) || '';
    }
    this.itemIconCache.set(icon, path);
    return path;
  }

  /** 아이템 id + 수량 → { name, icon, amount }. 룩업 실패 시 특수 통화 라벨 → id 폴백. */
  private async resolveMaterial(id: string, amount: number): Promise<any> {
    const it = this.itemMap.get(id);
    const name = it?.name || SPECIAL_ITEMS[id] || id;
    const icon = it ? await this.itemIcon(it.icon) : '';
    return { name, icon, amount };
  }

  /** 돌파(breakthrough) → [{ level, materials: [{name,icon,amount}] }] (레벨별). */
  private async buildBreakthrough(entries: any[]): Promise<any[]> {
    const out: any[] = [];
    for (const e of entries || []) {
      const ids = e.items_id || [];
      const amts = e.amount || [];
      const materials: any[] = [];
      for (let i = 0; i < ids.length; i++) {
        materials.push(await this.resolveMaterial(String(ids[i]), amts[i]));
      }
      out.push({ level: e.level, materials });
    }
    return out;
  }

  /** 선호 선물(preferrable_gifts) → [{name,icon,amount}] (평면). */
  private async buildGifts(gifts: any[]): Promise<any[]> {
    const out: any[] = [];
    for (const g of gifts || []) {
      out.push(await this.resolveMaterial(String(g.item_id), g.amount));
    }
    return out;
  }

  /** everness GraphQL에 한국어 헤더로 POST. */
  private async gql<T>(query: string, variables?: Record<string, any>): Promise<T> {
    const res = await axios.post(
      GRAPHQL,
      { query, variables },
      {
        timeout: 20000,
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'content-type': 'application/json',
          'Accept-Language': 'ko',
        },
      },
    );
    if (res.data?.errors?.length) {
      throw new Error(`GraphQL error: ${JSON.stringify(res.data.errors).slice(0, 300)}`);
    }
    return res.data?.data as T;
  }

  /** `/Game/UI/...` 자산 경로 → api.everness.info CDN webp 절대 URL. */
  private assetUrl(gamePath: string | null | undefined): string | null {
    if (!gamePath) return null;
    const rest = gamePath.replace(/^\/Game\/UI\//, '');
    return `${ASSET_BASE}/${rest}.webp`;
  }

  /** 자산 경로에서 ASCII 안전한 베이스명 추출(파일명용). */
  private baseName(gamePath: string | null | undefined): string | null {
    if (!gamePath) return null;
    return gamePath.split('/').pop() || null;
  }

  /** NTE 커스텀 인라인 태그(<Title>·<NumGreen>·<Zhou> 등) 제거 + 공백 정리. */
  private stripTags(text: string | null | undefined): string {
    if (!text) return '';
    return text
      .replace(/<[^>]*>/g, '')
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .trim();
  }

  /** 스킬(abilities) → SkillTreeView가 읽는 { name, type, description, icon } 형태. */
  private async buildSkills(abilities: any[]): Promise<any[]> {
    const skills: any[] = [];
    for (const ab of abilities || []) {
      if (!ab?.name) continue;
      const parts: string[] = [];
      for (const ph of ab.phases || []) {
        const t = this.stripTags(ph.title);
        const d = this.stripTags(ph.description) || this.stripTags(ph.shortDescription);
        const block = [t, d].filter(Boolean).join('\n');
        if (block) parts.push(block);
      }
      for (const ad of ab.additional_desc || []) {
        const n = this.stripTags(ad.name);
        const d = this.stripTags(ad.desc);
        const block = [n, d].filter(Boolean).join('\n');
        if (block) parts.push(block);
      }
      const description = parts.join('\n\n');

      // 스킬 아이콘 다운로드(있으면). 실패해도 스킬 자체는 유지.
      let icon = '';
      const base = this.baseName(ab.icon);
      const url = this.assetUrl(ab.icon);
      if (base && url) {
        icon = (await ImageDownloader.downloadAndSave(url, GAME, 'skill', base)) || '';
      }

      skills.push({
        name: ab.name,
        type: ab.type_name || '',
        description,
        icon,
      });
    }
    return skills;
  }

  /** 기초 스탯 → StatsView(배열 fallback)가 읽는 { name, value, icon }. values는 레벨 배열이라 최대치 사용. */
  private mapStats(stats: any[]): any[] {
    return (stats || [])
      .filter((s) => s?.name)
      .map((s) => {
        const v = Array.isArray(s.values) && s.values.length ? s.values[s.values.length - 1] : s.values;
        return { key: s.id_stats || s.name, name: s.name, value: v ?? null, icon: '' };
      });
  }

  /** 패션(코스튬) → CostumeView가 읽는 { name, desc, image }. 대표 일러스트(portraitImg) 다운로드. */
  private async buildCostumes(fashion: any[]): Promise<any[]> {
    const out: any[] = [];
    for (const f of fashion || []) {
      if (!f?.name) continue;
      let image = '';
      const src = f.portraitImg || f.displayIcon || f.headIconBig || f.icon;
      const base = this.baseName(src);
      const url = this.assetUrl(src);
      if (base && url) {
        image = (await ImageDownloader.downloadAndSave(url, GAME, 'costume', base)) || '';
      }
      out.push({
        name: f.name,
        desc: this.stripTags(f.desc),
        image,
        quality: f.quality || null,
        isDefault: !!f.isDefault,
      });
    }
    return out;
  }

  /** 음성(voices.daily + battle) → VoiceView가 읽는 { id, title, text }. 텍스트 전용.
   *  (everness 오디오 자산은 공개 mp3 URL로 노출되지 않아 재생은 미지원 — 대사 텍스트만 표시.) */
  private buildVoices(voices: any): any[] {
    if (!voices) return [];
    const groups = [...(voices.daily || []), ...(voices.battle || [])];
    return groups
      .filter((v) => v?.desc || v?.name)
      .map((v, i) => ({ id: i, title: v.name || '', text: this.stripTags(v.desc) }));
  }

  /** Game 행이 없으면 생성(서버에서 nte 크롤만 돌려도 Game 행이 생기도록 — wuwa 패턴). */
  private async ensureGame(): Promise<void> {
    const existing = await prisma.game.findUnique({ where: { slug: GAME } });
    if (!existing) {
      logger.info('Creating Game: nte (이환)');
      await prisma.game.create({
        data: { slug: GAME, name: '이환', iconUrl: '' },
      });
    }
  }

  async scrape(limit?: number): Promise<ScrapedData[]> {
    logger.info('Starting NTE(이환) character scraping (everness.info GraphQL)...');

    await this.ensureGame();

    // 재료/선물 이름·아이콘 해석용 아이템 룩업 1회 적재(실패해도 캐릭터 크롤은 진행).
    try {
      const itemsRes = await this.gql<{ items: any[] }>(ITEMS_QUERY);
      for (const it of itemsRes?.items || []) {
        this.itemMap.set(it.id, { name: it.name, icon: it.icon });
      }
      logger.info(`NTE item lookup loaded: ${this.itemMap.size} items.`);
    } catch (err) {
      logger.warn('NTE item lookup failed (돌파/선물 이름 미해석로 진행):', err);
    }

    const list = await this.gql<{ espers: EsperListItem[] }>(LIST_QUERY);
    let espers = list?.espers || [];
    logger.info(`Found ${espers.length} NTE espers.`);
    if (limit && limit > 0) espers = espers.slice(0, limit);

    const results: ScrapedData[] = [];
    let errors = 0;
    let processed = 0;

    for (const e of espers) {
      if (crawlProgress.shouldStop()) break; // 사용자 중단 요청
      crawlProgress.report(processed, espers.length, e.name);
      processed++;
      try {
        const detail = (
          await this.gql<{ esper: any }>(DETAIL_QUERY, { id: e.id })
        )?.esper;
        const d = detail || {};
        const name = d.name || e.name;
        const elementEn = d.element || e.element; // Incantation/Chaos/...
        const arcs = d.arcs_tags || e.arcs_tags || null;
        const arcName = arcs?.name || null; // 무기/형질(한국어): 고체/액체/플라스마/기체/결합

        // 대표 이미지(가챠 일러스트) 다운로드.
        let imageUrl = '';
        const gachaUrl = this.assetUrl(d.iconGacha || e.iconGacha);
        if (gachaUrl) {
          imageUrl =
            (await ImageDownloader.downloadAndSave(
              gachaUrl,
              GAME,
              'character',
              `char_${e.id}`,
            )) || '';
        }
        // 아바타 아이콘(작은 원형) — 카드/폴백용.
        let avatarUrl = '';
        const iconUrl = this.assetUrl(d.icon);
        if (iconUrl) {
          avatarUrl =
            (await ImageDownloader.downloadAndSave(
              iconUrl,
              GAME,
              'avatar',
              `avatar_${e.id}`,
            )) || '';
        }

        // 속성(DamageType) 아이콘 — everness card 규칙(Type={Element}.webp).
        let elementIconUrl: string | null = null;
        if (elementEn) {
          elementIconUrl =
            (await ImageDownloader.downloadAndSave(
              `${ELEMENT_ICON_BASE}/Type=${encodeURIComponent(elementEn)}.webp`,
              GAME,
              'element',
              `element_${elementEn}`,
            )) || null;
        }

        // 무기/형질(Path) 아이콘 — arcs_tags.icon.
        let pathIconUrl: string | null = null;
        const arcIconAsset = this.baseName(arcs?.icon);
        const arcIconRemote = this.assetUrl(arcs?.icon);
        if (arcName && arcIconAsset && arcIconRemote) {
          pathIconUrl =
            (await ImageDownloader.downloadAndSave(
              arcIconRemote,
              GAME,
              'path',
              `path_${arcIconAsset}`,
            )) || null;
        }

        const skills = await this.buildSkills(d.abilities || []);

        // 각성/공명(부가 정보) — 표시는 후속, metadata에 보존.
        const mapAwaken = (arr: any[]) =>
          (arr || [])
            .filter((a) => a?.name)
            .map((a) => ({
              name: a.name,
              type: a.type_name || '',
              description: this.stripTags(a.desc),
            }));

        results.push({
          name,
          sourceUrl: `https://everness.info/ko/espers/${e.id}`,
          imageUrl,
          rarity: typeof e.rarity === 'number' ? e.rarity : d.rarity ?? null,
          weaponType: arcName, // 무기/형질
          role: null,
          metadata: {
            originalId: e.id,
            element: elementEn, // → Element(DamageType).name
            elementIconUrl, // → Element(DamageType).iconUrl
            elementKo: d.element_name || null, // 게임 내 단일 글자 표기(주/암/령…) 보존
            path: arcName, // → Element(Path).name
            pathIconUrl, // → Element(Path).iconUrl
            arcsTypeId: arcs?.type_id || null,
            faction: d.faction || null,
            birthday: d.birthday || null,
            abilityName: d.abilityName || null,
            description: d.description || null,
            cardImageUrl: imageUrl,
            avatarImageUrl: avatarUrl,
            introduction: d.introduction || null,
            profileDetail: (d.profile_detail || [])
              .filter((p: any) => p?.name || p?.desc)
              .map((p: any) => ({ name: p.name || '', desc: this.stripTags(p.desc) })),
            skills, // SkillTreeView(NteSkillTreeViewModel)
            awaken: mapAwaken(d.awaken),
            resonance: mapAwaken(d.resonance),
            stats: this.mapStats(d.stats), // StatsView
            costumes: await this.buildCostumes(d.fashion || []), // CostumeView
            voiceLines: this.buildVoices(d.voices), // VoiceView
            breakthrough: await this.buildBreakthrough(d.breakthrough || []), // NteMaterialView
            gifts: await this.buildGifts(d.preferrable_gifts || []), // NteMaterialView
          },
        });
        logger.info(
          `NTE: ${name} (${elementEn}/${arcName}/${e.rarity}성, ${skills.length} skills)`,
        );
        await this.delay(150); // 소스 보호(살짝 텀)
      } catch (err) {
        errors++;
        logger.error(`Failed to scrape NTE esper ${e.id} (${e.name}):`, err);
      }
    }

    if (results.length === 0 && errors > 0) {
      throw new Error(`All ${errors} NTE esper fetches failed (everness.info 장애 의심)`);
    }
    logger.info(`NTE character scrape done: ${results.length} ok / ${errors} failed`);
    return results;
  }
}
