import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { ImageDownloader } from '../../utils/ImageDownloader';
import logger from '../../../utils/logger';

/**
 * 니케(승리의 여신: NIKKE) 캐릭터 스크래퍼 — NIKKE International Fandom 위키 소스.
 *
 * 소스:
 *   - 목록: api.php?action=query&list=embeddedin&eititle=Template:Playable Character  (플레이어블 페이지)
 *   - 상세: api.php?action=parse&page={title}&prop=wikitext  → {{Playable Character ...}} 인포박스
 *   - 이미지: File:{title}S.png(아이콘) / File:{title} FB.png(전신) → imageinfo로 URL 해석 후 로컬 저장.
 *
 * 인포박스 핵심 필드(KR 포함): name_kr, name_en, name_jp, va_kr/en/jp, class, code(원소),
 * burst, weapontype, weaponname, manufacturer, squad, rarity, releaseDate.
 * 스킬은 별도 {{Skill table}} 템플릿이라 1차 범위에서 제외(후속).
 */

const WIKI = 'https://nikke-goddess-of-victory-international.fandom.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 원소 code → 표시명(영문 키, 다른 게임과 동일 관행). 무기 code → 약어.
const ELEMENT_MAP: Record<string, string> = {
  fire: 'Fire', water: 'Water', wind: 'Wind', iron: 'Iron', electric: 'Electric',
};
const WEAPON_MAP: Record<string, string> = {
  sr: 'SR', ar: 'AR', smg: 'SMG', sg: 'SG', mg: 'MG', rl: 'RL',
};
const RARITY_MAP: Record<string, number> = { SSR: 5, SR: 4, R: 3 };

export class NikkeCharacterScraper extends ScraperBase {
  constructor() {
    super('nikke');
  }

  private async api(params: Record<string, string>): Promise<any> {
    const qs = new URLSearchParams({ format: 'json', ...params }).toString();
    const res = await fetch(`${WIKI}/api.php?${qs}`, {
      headers: { 'User-Agent': UA },
    });
    if (!res.ok) throw new Error(`Wiki API ${res.status}`);
    return res.json();
  }

  /** 플레이어블 캐릭터 페이지 제목 목록. */
  private async listCharacters(): Promise<string[]> {
    const titles: string[] = [];
    let cont: string | undefined;
    do {
      const data: any = await this.api({
        action: 'query',
        list: 'embeddedin',
        eititle: 'Template:Playable Character',
        einamespace: '0',
        eilimit: '500',
        ...(cont ? { eicontinue: cont } : {}),
      });
      for (const m of data.query?.embeddedin || []) titles.push(m.title);
      cont = data.continue?.eicontinue;
    } while (cont);
    return titles;
  }

  /**
   * 위키 마크업 정리: {{W|...}}/[[...]]/[url text] 링크를 표시 텍스트로 풀고 강조 제거.
   * 링크 잔재로 `|`가 남으면 마지막 세그먼트(표시 텍스트)를, `ko:` 등 언어 접두사는 제거한다.
   */
  private cleanWiki(v: string): string {
    let s = (v || '')
      .replace(/\{\{[Ww]\|([^}]*)\}\}/g, '$1') // {{W|...}} / {{w|...}}
      .replace(/\[\[([^\]]*)\]\]/g, '$1') // [[...]] 내부 유지
      .replace(/\[[^\s\]]+\s+([^\]]+)\]/g, '$1') // [url text] → text
      .replace(/'''?/g, '')
      .trim();
    if (s.includes('|')) s = (s.split('|').pop() || '').trim();
    return s.replace(/^[a-z]{2}:/i, '').trim();
  }

  private field(wt: string, key: string): string {
    const m = wt.match(new RegExp(`\\|\\s*${key}\\s*=\\s*([^\\n]*)`, 'i'));
    return m ? this.cleanWiki(m[1]) : '';
  }

  /** File: 제목들의 실제 이미지 URL을 한 번에 해석. */
  private async resolveImages(fileTitles: string[]): Promise<Record<string, string>> {
    if (fileTitles.length === 0) return {};
    const data: any = await this.api({
      action: 'query',
      titles: fileTitles.join('|'),
      prop: 'imageinfo',
      iiprop: 'url',
    });
    const out: Record<string, string> = {};
    for (const p of Object.values<any>(data.query?.pages || {})) {
      const url = p.imageinfo?.[0]?.url;
      if (p.title && url) out[p.title] = url.split('/revision')[0];
    }
    return out;
  }

  async scrape(limit?: number): Promise<ScrapedData[]> {
    logger.info('Starting Nikke Character scraping (NIKKE International Fandom)...');
    let titles = await this.listCharacters();
    logger.info(`Found ${titles.length} playable Nikke pages.`);
    if (limit && limit > 0) titles = titles.slice(0, limit);

    const results: ScrapedData[] = [];
    let errors = 0;

    for (const title of titles) {
      try {
        const parsed: any = await this.api({
          action: 'parse',
          page: title,
          prop: 'wikitext',
        });
        const wt: string = parsed?.parse?.wikitext?.['*'] || '';
        if (!wt || !/\{\{\s*Playable Character/i.test(wt)) {
          logger.warn(`No Playable Character infobox: ${title}`);
          continue;
        }

        const nameKr = this.field(wt, 'name_kr');
        const nameEn = this.field(wt, 'name_en') || title;
        const rarityStr = (this.field(wt, 'rarity') || '').toUpperCase();
        const code = this.field(wt, 'code').toLowerCase();
        const weapon = this.field(wt, 'weapontype').toLowerCase();

        // 이미지: 아이콘(S) / 전신(FB), MI 폴백.
        const iconFile = `File:${title}S.png`;
        const fbFile = `File:${title} FB.png`;
        const miFile = `File:${title} MI.png`;
        const urls = await this.resolveImages([iconFile, fbFile, miFile]);

        let localIcon = '';
        let localCard = '';
        if (urls[iconFile]) {
          localIcon =
            (await ImageDownloader.downloadAndSave(urls[iconFile], 'nikke', 'character', `icon_${title}`)) || '';
        }
        const splashUrl = urls[fbFile] || urls[miFile];
        if (splashUrl) {
          localCard =
            (await ImageDownloader.downloadAndSave(splashUrl, 'nikke', 'character', `card_${title}`)) || '';
        }

        results.push({
          name: nameKr || nameEn,
          sourceUrl: `${WIKI}/wiki/${encodeURIComponent(title)}`,
          imageUrl: localIcon,
          rarity: RARITY_MAP[rarityStr] ?? null,
          weaponType: WEAPON_MAP[weapon] || weapon || null,
          role: this.field(wt, 'class') || null,
          metadata: {
            originalId: title,
            nameEn,
            nameJp: this.field(wt, 'name_jp'),
            element: ELEMENT_MAP[code] || code, // DamageType 해석용
            path: WEAPON_MAP[weapon] || weapon, // Path 해석용(무기 종류)
            rarity: rarityStr,
            class: this.field(wt, 'class'),
            burst: this.field(wt, 'burst'),
            manufacturer: this.field(wt, 'manufacturer'),
            squad: this.field(wt, 'squad'),
            weaponName: this.field(wt, 'weaponname'),
            cv: {
              kor: this.field(wt, 'va_kr'),
              eng: this.field(wt, 'va_en'),
              jpn: this.field(wt, 'va_jp'),
            },
            releaseDate: this.field(wt, 'releaseDate'),
            cardImageUrl: localCard,
          },
        });
      } catch (err) {
        errors++;
        logger.error(`Failed to scrape Nikke character ${title}:`, err);
      }
    }

    if (results.length === 0 && errors > 0) {
      throw new Error(`All ${errors} Nikke character fetches failed (wiki 장애 의심)`);
    }
    logger.info(`Nikke character scrape done: ${results.length} ok / ${errors} failed`);
    return results;
  }
}
