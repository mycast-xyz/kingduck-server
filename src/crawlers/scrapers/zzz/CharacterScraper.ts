import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { ImageDownloader } from '../../utils/ImageDownloader';
import logger from '../../../utils/logger';
import * as cheerio from 'cheerio';

/**
 * 젠레스 존 제로(ZZZ) 캐릭터(에이전트) 스크래퍼 — zzz.gg/ko 소스(Nuxt SSR, 순수 HTML).
 *
 *  - 목록: https://zzz.gg/ko/characters  → li.item { .name, a[href], IconRole 번호, 등급(ItemRarity[SA]) }
 *  - 상세: https://zzz.gg/ko/characters/{name} → .tag 4개 = 속성/공격타입/특성/소속
 *  - 이미지: 카드 _ipx 래퍼를 벗긴 원본 https://zzz.gg/images/IconRole{NN}.png → 로컬 저장
 *
 * 한국어 데이터 그대로 사용(속성 물리/화염/…, 특성 강공/격파/…). 스킬은 후속.
 */

const BASE = 'https://zzz.gg';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const RARITY_MAP: Record<string, number> = { S: 5, A: 4 };

export class ZzzCharacterScraper extends ScraperBase {
  private readonly LIST_URL = `${BASE}/ko/characters`;

  constructor() {
    super('zzz');
  }

  private async getHtml(url: string): Promise<string> {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
    return res.text();
  }

  /** 목록에서 에이전트 슬러그/이름 열거(상세 페이지 진입용). */
  private parseList($: cheerio.CheerioAPI) {
    const items: Array<{ name: string; slug: string }> = [];
    $('li.item').each((_, el) => {
      const li = $(el);
      const name = li.find('.name').first().text().trim();
      const href = li.find('a').first().attr('href') || '';
      const slug = decodeURIComponent(href.split('/').pop() || '');
      if (name && slug) items.push({ name, slug });
    });
    return items;
  }

  /**
   * 상세 페이지에서 속성/공격타입/특성/소속 + 아이콘번호 + 등급을 추출.
   * `.tag`는 **순서 고정** [속성, 공격타입, 특성, 소속]이라 위치로 매핑(텍스트 변형에 견고).
   * 속성은 "불 속성"처럼 접미사가 붙기도 해 ` 속성`을 떼어 정규화.
   */
  private parseDetail($: cheerio.CheerioAPI) {
    const tags: string[] = [];
    $('.tag').each((_, el) => {
      const t = $(el).text().replace(/\s+/g, ' ').trim();
      if (t) tags.push(t);
    });
    const element = (tags[0] || '').replace(/\s*속성$/, '').trim();
    const iconNo =
      (
        $('img[srcset*="IconRole"]').first().attr('srcset') ||
        $('img[src*="IconRole"]').first().attr('src') ||
        ''
      ).match(/IconRole(\d+)\.png/)?.[1] || '';
    const rarity =
      ($('img[src*="IconRole"][src*="Big"], img[srcset*="IconRole"][srcset*="Big"]')
        .map((_, e) => $(e).attr('src') || $(e).attr('srcset') || '')
        .get()
        .join(' ')
        .match(/IconRole([SA])Big/) || [])[1] || '';
    return {
      element,
      attackType: tags[1] || '',
      specialty: tags[2] || '',
      faction: tags[3] || '',
      iconNo,
      rarity,
    };
  }

  async scrape(limit?: number): Promise<ScrapedData[]> {
    logger.info('Starting ZZZ character scraping (zzz.gg/ko)...');
    const $list = cheerio.load(await this.getHtml(this.LIST_URL));
    let items = this.parseList($list);
    logger.info(`Found ${items.length} ZZZ agents.`);
    if (limit && limit > 0) items = items.slice(0, limit);

    const results: ScrapedData[] = [];
    let errors = 0;

    for (const it of items) {
      try {
        const $ = cheerio.load(await this.getHtml(`${BASE}/ko/characters/${encodeURIComponent(it.slug)}`));
        const name = $('h1').first().text().trim() || it.name;
        const d = this.parseDetail($);

        // 이미지: Nuxt _ipx 엔드포인트(원본 /images/IconRole{NN}.png는 일부 404 → _ipx는 전부 200).
        let localIcon = '';
        if (d.iconNo) {
          const url = `${BASE}/_ipx/w_1100&q_70/images/IconRole${d.iconNo}.png`;
          localIcon =
            (await ImageDownloader.downloadAndSave(url, 'zzz', 'character', `icon_${d.iconNo}`)) || '';
        }

        results.push({
          name,
          sourceUrl: `${BASE}/ko/characters/${encodeURIComponent(it.slug)}`,
          imageUrl: localIcon,
          rarity: RARITY_MAP[d.rarity] ?? null,
          weaponType: d.specialty || null, // 특성(직업)
          role: d.specialty || null,
          metadata: {
            originalId: d.iconNo ? `IconRole${d.iconNo}` : it.name,
            element: d.element, // 속성 → DamageType
            path: d.specialty, // 특성 → Path
            attackType: d.attackType,
            faction: d.faction,
            rarity: d.rarity,
            cardImageUrl: localIcon,
          },
        });
        logger.info(`ZZZ: ${name} (${d.element}/${d.specialty}/${d.rarity}-rank, icon ${d.iconNo})`);
      } catch (err) {
        errors++;
        logger.error(`Failed to scrape ZZZ agent ${it.name}:`, err);
      }
    }

    if (results.length === 0 && errors > 0) {
      throw new Error(`All ${errors} ZZZ agent fetches failed (zzz.gg 장애 의심)`);
    }
    logger.info(`ZZZ character scrape done: ${results.length} ok / ${errors} failed`);
    return results;
  }
}
