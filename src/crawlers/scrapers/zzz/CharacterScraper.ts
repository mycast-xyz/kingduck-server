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
   * `.tag` 내부 img에서 가장 선명한 아이콘 URL을 고른다.
   * zzz.gg는 Nuxt _ipx 변환(`/_ipx/q_70&s_34x34/images/IconFrost.png 1x, …68x68 2x`)을
   * srcset으로 내려준다. _ipx는 **페이지가 실제 요청한 변환 문자열만** 200을 주므로(커스텀 크기 404),
   * 페이지에 박힌 src/srcset URL을 그대로 재사용한다. 2x(68x68)를 우선.
   */
  private pickTagIcon(srcset?: string, src?: string): string {
    if (srcset) {
      const entries = srcset
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const two = entries.find((e) => /\s2x$/.test(e));
      const chosen = (two || entries[entries.length - 1] || '').split(/\s+/)[0];
      if (chosen) return chosen;
    }
    return src || '';
  }

  /**
   * 상세 페이지에서 속성/공격타입/특성/소속 + 아이콘번호 + 등급을 추출.
   * `.tag`는 **순서 고정** [속성, 공격타입, 특성, 소속]이라 위치로 매핑(텍스트 변형에 견고).
   * 속성은 "불 속성"처럼 접미사가 붙기도 해 ` 속성`을 떼어 정규화.
   * 각 태그 img의 아이콘 URL도 같이 뽑아 속성/특성 필터 아이콘으로 쓴다(위치 0=속성, 2=특성).
   */
  private parseDetail($: cheerio.CheerioAPI) {
    const tagEls: Array<{ name: string; icon: string }> = [];
    $('.tag').each((_, el) => {
      const tag = $(el);
      const name = tag.text().replace(/\s+/g, ' ').trim();
      if (!name) return;
      const img = tag.find('img').first();
      const icon = this.pickTagIcon(img.attr('srcset'), img.attr('src'));
      tagEls.push({ name, icon });
    });
    const tags = tagEls.map((t) => t.name);
    const element = (tags[0] || '').replace(/\s*속성$/, '').trim();
    const elementIcon = tagEls[0]?.icon || '';
    const specialtyIcon = tagEls[2]?.icon || '';
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
      elementIcon,
      attackType: tags[1] || '',
      specialty: tags[2] || '',
      specialtyIcon,
      faction: tags[3] || '',
      iconNo,
      rarity,
    };
  }

  /**
   * `.tag` img의 _ipx URL을 받아 webp로 저장하고 상대경로를 반환.
   * 파일명은 자산 베이스명(예 IconFrost)로 — ASCII 안전 + 속성당 1파일(중복 스킵).
   * DataSyncService가 이 값을 Element.iconUrl에 적재한다(빈 경우만 — 수동값 보존).
   */
  private async dlFilterIcon(
    iconPath: string,
    label: string,
    namePrefix: string,
  ): Promise<string | null> {
    if (!iconPath || !label) return null;
    const url = iconPath.startsWith('http') ? iconPath : `${BASE}${iconPath}`;
    const asset = (iconPath.match(/images\/(.+?)\.png/) || [])[1];
    if (!asset) {
      logger.warn(`ZZZ: filter icon asset 미파싱 (${label}, src=${iconPath})`);
      return null;
    }
    const saved = await ImageDownloader.downloadAndSave(
      url,
      'zzz',
      'element',
      `${namePrefix}_${asset}`,
    );
    if (!saved) logger.warn(`ZZZ: filter icon 다운로드 실패 (${label}, ${url})`);
    return saved;
  }

  /** 스킬: `.ability` 카드 = .header(아이콘+h3.name) + p.description. */
  private parseSkills($: cheerio.CheerioAPI) {
    const skills: Array<{ name: string; type: string; description: string }> = [];
    $('.ability').each((_, el) => {
      const card = $(el);
      const full = card.find('.header h3.name').first().text().replace(/\s+/g, ' ').trim();
      const desc = card.find('p.description').first().text().replace(/\s+/g, ' ').trim();
      if (!full) return;
      // "일반 공격: 냥냥 할퀴기" → type="일반 공격", name="냥냥 할퀴기"
      const m = full.match(/^([^:]+):\s*(.+)$/);
      const type = m ? m[1].trim() : '';
      const name = m ? m[2].trim() : full;
      skills.push({ name, type, description: desc });
    });
    return skills;
  }

  /** 재능(심상 영식): h3(클래스 없음) + 다음 .description div. */
  private parseTalents($: cheerio.CheerioAPI) {
    const talents: Array<{ name: string; description: string }> = [];
    $('h3').each((_, el) => {
      const h = $(el);
      if (h.attr('class')) return; // 스킬은 h3.name → 제외
      const next = h.next();
      if (!next.hasClass('description')) return;
      const name = h.text().replace(/\s+/g, ' ').trim();
      const description = next.text().replace(/\s+/g, ' ').trim();
      if (name && description) talents.push({ name, description });
    });
    return talents;
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
        const skills = this.parseSkills($);
        const talents = this.parseTalents($);

        // 이미지: Nuxt _ipx 엔드포인트(원본 /images/IconRole{NN}.png는 일부 404 → _ipx는 전부 200).
        let localIcon = '';
        if (d.iconNo) {
          const url = `${BASE}/_ipx/w_1100&q_70/images/IconRole${d.iconNo}.png`;
          localIcon =
            (await ImageDownloader.downloadAndSave(url, 'zzz', 'character', `icon_${d.iconNo}`)) || '';
        }

        // 속성(DamageType)/특성(Path) 필터 아이콘 — `.tag` img에서 추출해 저장.
        // 속성별 1파일. DataSyncService가 Element.iconUrl에 적재(빈 경우만).
        const elementIconUrl = await this.dlFilterIcon(d.elementIcon, d.element, 'element');
        const pathIconUrl = await this.dlFilterIcon(d.specialtyIcon, d.specialty, 'path');

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
            elementIconUrl, // DataSyncService가 Element(DamageType).iconUrl로 적재
            path: d.specialty, // 특성 → Path
            pathIconUrl, // Element(Path).iconUrl로 적재
            attackType: d.attackType,
            faction: d.faction,
            rarity: d.rarity,
            cardImageUrl: localIcon,
            skills, // 스킬(SkillTreeView)
            talents, // 심상 영식(RankListView)
          },
        });
        logger.info(
          `ZZZ: ${name} (${d.element}/${d.specialty}/${d.rarity}-rank, ${skills.length} skills, ${talents.length} talents)`
        );
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
