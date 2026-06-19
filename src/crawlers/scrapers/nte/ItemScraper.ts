import axios from 'axios';
import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { ImageDownloader } from '../../utils/ImageDownloader';
import { prisma } from '../../../utils/prisma';
import logger from '../../../utils/logger';

/**
 * 이환(NTE) 아이템 스크래퍼 — everness.info GraphQL.
 *
 *  - arcs(무기/Arc): query { arcs { id name icon quality type_id weapon_type_id description context
 *      stats{id_stats name values bIsPercent icon} effect{name description values} } }  (현재 45개)
 *  - shards(드라이브/모듈): everness Query 루트에 `modules` 쿼리는 없고 `shards`가 장비 모듈(드라이브)이다.
 *      query { shards { id name icon quality type_id type_geometry ownGridNum
 *        main_stats{id name values icon} sub_stats{id name amount_stats icon}
 *        set_effect{setIcon conditions geometry} } }  (현재 72개)
 *
 * ItemType.type 으로 'Arc'(무기) / 'Module'(드라이브) 구분. 일반 재료 items(1800+)는 노이즈라 제외.
 * 이미지: 캐릭터와 동일 규칙(`/Game/UI/` 제거 → api.everness.info/data/assets/...webp) 다운로드.
 * originalId = everness id.
 */

const GRAPHQL = 'https://everness.info/api/graphql';
const ASSET_BASE = 'https://api.everness.info/data/assets';
const GAME = 'nte';

// everness quality 문자열 → rarity 숫자.
const QUALITY_RARITY: Record<string, number> = {
  orange: 5,
  gold: 5,
  purple: 4,
  blue: 3,
  green: 2,
  gray: 1,
  grey: 1,
  white: 1,
};

const ARCS_QUERY = `query {
  arcs {
    id name icon quality type_id weapon_type_id description context
    stats { id_stats name values bIsPercent icon }
    effect { name description }
  }
}`;

const SHARDS_QUERY = `query {
  shards {
    id name icon quality type_id type_geometry ownGridNum
    main_stats { id name values icon }
    sub_stats { id name amount_stats icon }
    set_effect { setIcon conditions { condition desc } }
  }
}`;

export class NteItemScraper extends ScraperBase {
  constructor() {
    super(GAME);
  }

  private async gql<T>(query: string): Promise<T> {
    const res = await axios.post(
      GRAPHQL,
      { query },
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

  private assetUrl(gamePath: string | null | undefined): string | null {
    if (!gamePath) return null;
    return `${ASSET_BASE}/${gamePath.replace(/^\/Game\/UI\//, '')}.webp`;
  }

  private baseName(gamePath: string | null | undefined): string | null {
    if (!gamePath) return null;
    return gamePath.split('/').pop() || null;
  }

  private rarityOf(quality: string | null | undefined): number | null {
    if (!quality) return null;
    return QUALITY_RARITY[quality.toLowerCase()] ?? null;
  }

  /** Game 행 보장(서버에서 nte 아이템만 돌려도 동작하도록). */
  private async ensureGame(): Promise<void> {
    const existing = await prisma.game.findUnique({ where: { slug: GAME } });
    if (!existing) {
      await prisma.game.create({ data: { slug: GAME, name: '이환', iconUrl: '' } });
    }
  }

  private async downloadIcon(
    icon: string | null | undefined,
    category: string,
    id: string,
  ): Promise<string> {
    const url = this.assetUrl(icon);
    const base = this.baseName(icon);
    if (!url || !base) return '';
    return (
      (await ImageDownloader.downloadAndSave(url, GAME, category, `${id}_${base}`)) || ''
    );
  }

  async scrape(): Promise<ScrapedData[]> {
    logger.info('Starting NTE(이환) item scraping (arcs + shards)...');
    await this.ensureGame();

    const results: ScrapedData[] = [];
    let errors = 0;

    // --- 무기(Arc) ---
    try {
      const { arcs } = await this.gql<{ arcs: any[] }>(ARCS_QUERY);
      logger.info(`Found ${arcs?.length || 0} NTE arcs.`);
      for (const a of arcs || []) {
        try {
          const imageUrl = await this.downloadIcon(a.icon, 'arc', a.id);
          results.push({
            name: a.name,
            sourceUrl: `https://everness.info/ko/arcs/${a.id}`,
            imageUrl,
            rarity: this.rarityOf(a.quality),
            description: a.description || a.context || null,
            metadata: {
              originalId: a.id,
              type: 'Arc',
              quality: a.quality,
              rarity: this.rarityOf(a.quality),
              typeId: a.type_id, // 형질(고체/액체/…)
              weaponTypeId: a.weapon_type_id,
              description: a.description || null,
              context: a.context || null,
              effect: a.effect || null,
              stats: a.stats || [],
              cardImageUrl: imageUrl,
            },
          });
        } catch (e) {
          errors++;
          logger.error(`Failed NTE arc ${a?.id}:`, e);
        }
      }
    } catch (e) {
      logger.error('NTE arcs query failed:', e);
    }

    // --- 드라이브(Shard → Module) ---
    try {
      const { shards } = await this.gql<{ shards: any[] }>(SHARDS_QUERY);
      logger.info(`Found ${shards?.length || 0} NTE shards (modules).`);
      for (const sd of shards || []) {
        try {
          const imageUrl = await this.downloadIcon(sd.icon, 'module', sd.id);
          results.push({
            name: sd.name,
            sourceUrl: `https://everness.info/ko/modules/${sd.id}`,
            imageUrl,
            rarity: this.rarityOf(sd.quality),
            description: null,
            metadata: {
              originalId: sd.id,
              type: 'Module',
              quality: sd.quality,
              rarity: this.rarityOf(sd.quality),
              typeId: sd.type_id,
              typeGeometry: sd.type_geometry,
              ownGridNum: sd.ownGridNum,
              mainStats: sd.main_stats || [],
              subStats: sd.sub_stats || [],
              setEffect: sd.set_effect || null,
              cardImageUrl: imageUrl,
            },
          });
        } catch (e) {
          errors++;
          logger.error(`Failed NTE shard ${sd?.id}:`, e);
        }
      }
    } catch (e) {
      logger.error('NTE shards query failed:', e);
    }

    if (results.length === 0 && errors > 0) {
      throw new Error(`All NTE item fetches failed (everness.info 장애 의심)`);
    }
    logger.info(`NTE item scrape done: ${results.length} items (${errors} errors).`);
    return results;
  }
}
