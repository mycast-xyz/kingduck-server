import axios from 'axios';
import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { ImageDownloader } from '../../utils/ImageDownloader';
import { prisma } from '../../../utils/prisma';
import logger from '../../../utils/logger';

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
    icon iconBig iconGacha faction birthday description abilityName
    arcs_tags { name icon type_id }
    stats { id_stats name values icon }
    abilities { name type_name icon phases { title description shortDescription } additional_desc { name desc } }
    awaken { name desc icon type_name }
    resonance { name desc icon type_name }
  }
}`;

interface EsperListItem {
  id: string;
  name: string;
  element: string;
  rarity: number;
  iconGacha: string | null;
  arcs_tags: { id: string | null; name: string; icon: string | null; type_id: string } | null;
}

export class NteCharacterScraper extends ScraperBase {
  constructor() {
    super(GAME);
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

    const list = await this.gql<{ espers: EsperListItem[] }>(LIST_QUERY);
    let espers = list?.espers || [];
    logger.info(`Found ${espers.length} NTE espers.`);
    if (limit && limit > 0) espers = espers.slice(0, limit);

    const results: ScrapedData[] = [];
    let errors = 0;

    for (const e of espers) {
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
            skills, // SkillTreeView(NteSkillTreeViewModel)
            awaken: mapAwaken(d.awaken),
            resonance: mapAwaken(d.resonance),
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
