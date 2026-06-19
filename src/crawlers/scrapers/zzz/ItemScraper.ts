import * as cheerio from 'cheerio';
import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { ImageDownloader } from '../../utils/ImageDownloader';
import logger from '../../../utils/logger';

/**
 * 젠레스 존 제로(ZZZ) 아이템 스크래퍼 — zzz.gg/ko 소스(캐릭터 스크래퍼와 동일 Nuxt SSR).
 *
 * 두 종류를 한 번에 수집한다(`ItemType.type`으로 구분):
 *   - W-Engine    : 음향엔진(무기). 목록 https://zzz.gg/ko/w-engines
 *   - DriveDisc   : 드라이브 디스크(유물 세트). 목록 https://zzz.gg/ko/disk-drives
 *
 * 목록→상세 2단계. 상세에서 효과 본문/세트효과(2피스/4피스)를 보강한다(상세 실패 시 목록값으로 진행).
 * 이미지는 Nuxt _ipx 변환 URL을 페이지에서 그대로 재사용해 다운로드한다
 * (원본 /images/*.png는 일부 404 — CharacterScraper와 동일 교훈).
 *
 * originalId는 **이미지 자산 베이스명**을 쓴다(언어 무관·전역 유일):
 *   - W-Engine  : "Weapon_S_1041"  (Enka ImagePath와 동일 파일명 → 추천 매핑과 호환)
 *   - DriveDisc : "SuitWoodpeckerElectro"
 * 한국어 이름(name)으로 추천(genshin.gg) 매핑이 붙으므로 BuildScraper는 name 기준으로 조회한다.
 */

const BASE = 'https://zzz.gg';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 이미지 자산 접두 → 등급(S=5, A=4, B=3). zzz 등급 체계는 S/A(캐릭터와 동일), 무기는 B도 존재.
const WEAPON_RARITY: Record<string, number> = { S: 5, A: 4, B: 3 };

export class ZzzItemScraper extends ScraperBase {
  constructor() {
    super('zzz');
  }

  private async getHtml(url: string): Promise<string> {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
    return res.text();
  }

  /**
   * img의 srcset/src에서 가장 선명한 _ipx URL을 고른다(2x 우선). zzz.gg _ipx는 페이지가 실제
   * 요청한 변환 문자열만 200을 주므로(커스텀 크기 404) 페이지에 박힌 URL을 그대로 재사용한다.
   */
  private pickIcon($img: cheerio.Cheerio<any>): string {
    const srcset = $img.attr('srcset');
    if (srcset) {
      const entries = srcset
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const two = entries.find((e) => /\s2x$/.test(e));
      const chosen = (two || entries[entries.length - 1] || '').split(/\s+/)[0];
      if (chosen) return chosen;
    }
    return $img.attr('src') || '';
  }

  /** _ipx URL/경로 → 절대 URL. */
  private absUrl(path: string): string {
    if (!path) return '';
    return path.startsWith('http') ? path : `${BASE}${path}`;
  }

  /** 이미지 경로에서 자산 베이스명 추출(예 `/_ipx/.../images/Weapon_S_1041.png` → `Weapon_S_1041`). */
  private assetBase(path: string): string {
    return (path.match(/images\/([A-Za-z0-9_-]+)\.png/) || [])[1] || '';
  }

  async scrape(limit?: number): Promise<ScrapedData[]> {
    logger.info('Starting ZZZ item scraping (zzz.gg/ko w-engines + disk-drives)...');
    const results: ScrapedData[] = [];

    const engines = await this.scrapeWEngines(limit);
    results.push(...engines);
    const disks = await this.scrapeDriveDiscs(limit);
    results.push(...disks);

    if (results.length === 0) {
      throw new Error('ZZZ item scrape produced 0 results (zzz.gg 구조 변경/장애 의심)');
    }
    logger.info(
      `ZZZ item scrape done: ${engines.length} W-Engines + ${disks.length} DriveDiscs = ${results.length}`,
    );
    return results;
  }

  // ---------------------------------------------------------------- W-Engines

  private async scrapeWEngines(limit?: number): Promise<ScrapedData[]> {
    const $ = cheerio.load(await this.getHtml(`${BASE}/ko/w-engines`));
    let entries: Array<{ name: string; slug: string; icon: string }> = [];
    $('a.engine').each((_, el) => {
      const a = $(el);
      const href = a.attr('href') || '';
      const slug = decodeURIComponent(href.split('/').pop() || '');
      const img = a.find('.image img').first();
      const name = (a.find('.info h2').first().text() || img.attr('alt') || '').trim();
      const icon = this.pickIcon(img);
      if (name && slug) entries.push({ name, slug, icon });
    });
    logger.info(`Found ${entries.length} ZZZ W-Engines.`);
    if (limit && limit > 0) entries = entries.slice(0, limit);

    const out: ScrapedData[] = [];
    let errors = 0;
    for (const e of entries) {
      try {
        const base = this.assetBase(e.icon);
        const originalId = base || e.name;
        const rarity = WEAPON_RARITY[(base.match(/Weapon_([SAB])/) || [])[1]] ?? null;

        // 이미지(아이콘) 다운로드 — _ipx URL 그대로.
        const imageUrl = e.icon
          ? await ImageDownloader.downloadAndSave(
              this.absUrl(e.icon),
              'zzz',
              'w-engine',
              base || e.slug,
            )
          : null;

        // 상세(효과 본문/스탯) — 실패해도 목록값으로 진행.
        const detail = await this.fetchWEngineDetail(e.slug).catch(() => null);

        out.push({
          name: e.name,
          sourceUrl: `${BASE}/ko/w-engines/${encodeURIComponent(e.slug)}`,
          imageUrl: imageUrl || undefined,
          rarity,
          description: detail?.effect?.desc || '',
          metadata: {
            originalId,
            type: 'W-Engine',
            rarity,
            cardImageUrl: imageUrl || '',
            mainStat: detail?.mainStat || null,
            subStat: detail?.subStat || null,
            effect: detail?.effect || null,
            lore: detail?.lore || '',
          },
        });
      } catch (err) {
        errors++;
        logger.warn(`ZZZ W-Engine 처리 실패: ${e.name}`);
      }
    }
    if (errors) logger.warn(`ZZZ W-Engine: ${out.length} ok / ${errors} failed`);
    return out;
  }

  private async fetchWEngineDetail(slug: string): Promise<{
    effect: { name: string; desc: string } | null;
    lore: string;
    mainStat: { name: string; value: string } | null;
    subStat: { name: string; value: string } | null;
  }> {
    await this.delay(120);
    const $ = cheerio.load(
      await this.getHtml(`${BASE}/ko/w-engines/${encodeURIComponent(slug)}`),
    );
    // 효과/정보: h2 + 다음 .container > p (h2가 '.ability' 안에 있고 .container가 형제)
    let effect: { name: string; desc: string } | null = null;
    let lore = '';
    $('h2').each((_, h) => {
      const title = $(h).text().replace(/\s+/g, ' ').trim();
      if (!title) return;
      let cont = $(h).parent().nextAll('.container').first();
      if (!cont.length) cont = $(h).nextAll('.container').first();
      const desc = cont
        .find('p')
        .map((_i, p) => $(p).text().replace(/\s+/g, ' ').trim())
        .get()
        .filter(Boolean)
        .join('\n');
      if (title === '정보') lore = desc;
      else if (!effect) effect = { name: title, desc };
    });
    // 스탯: .engine-stats .stat 또는 .ch-stats .stat (기본공격력 / 부옵션)
    const stats: Array<{ name: string; value: string }> = [];
    $('.engine-stats .stat, .ch-stats .stat').each((_, s) => {
      const name = $(s).find('.text').first().text().replace(/\s+/g, ' ').trim();
      const value = $(s).find('.val').first().text().replace(/\s+/g, ' ').trim();
      if (name) stats.push({ name, value });
    });
    return {
      effect,
      lore,
      mainStat: stats[0] || null,
      subStat: stats[1] || null,
    };
  }

  // -------------------------------------------------------------- DriveDiscs

  private async scrapeDriveDiscs(limit?: number): Promise<ScrapedData[]> {
    const $ = cheerio.load(await this.getHtml(`${BASE}/ko/disk-drives`));
    let entries: Array<{ name: string; slug: string; icon: string }> = [];
    $('a.item').each((_, el) => {
      const a = $(el);
      const href = a.attr('href') || '';
      if (!href.includes('/disk-drives/')) return;
      const slug = decodeURIComponent(href.split('/').pop() || '');
      const img = a.find('.image img').first();
      const name = (a.find('h2').first().text() || img.attr('alt') || '').trim();
      const icon = this.pickIcon(img);
      if (name && slug) entries.push({ name, slug, icon });
    });
    logger.info(`Found ${entries.length} ZZZ Drive Discs.`);
    if (limit && limit > 0) entries = entries.slice(0, limit);

    const out: ScrapedData[] = [];
    let errors = 0;
    for (const e of entries) {
      try {
        const detail = await this.fetchDiskDetail(e.slug).catch(() => null);
        const set2 = detail?.['2pc']?.desc ? detail['2pc'] : { desc: '' };
        const set4 = detail?.['4pc']?.desc ? detail['4pc'] : { desc: '' };
        // 상세 이미지(더 큰 해상도)가 있으면 우선, 없으면 목록 아이콘.
        const iconSrc = detail?.icon || e.icon;
        const base = this.assetBase(iconSrc);
        const originalId = base || e.name;

        const imageUrl = iconSrc
          ? await ImageDownloader.downloadAndSave(
              this.absUrl(iconSrc),
              'zzz',
              'drive-disc',
              base || e.slug,
            )
          : null;

        const desc = [
          set2.desc ? `2피스: ${set2.desc}` : '',
          set4.desc ? `4피스: ${set4.desc}` : '',
        ]
          .filter(Boolean)
          .join('\n');

        out.push({
          name: e.name,
          sourceUrl: `${BASE}/ko/disk-drives/${encodeURIComponent(e.slug)}`,
          imageUrl: imageUrl || undefined,
          rarity: 5,
          description: desc,
          metadata: {
            originalId,
            type: 'DriveDisc',
            rarity: 5,
            setName: e.name,
            cardImageUrl: imageUrl || '',
            '2pc': set2,
            '4pc': set4,
          },
        });
      } catch (err) {
        errors++;
        logger.warn(`ZZZ Drive Disc 처리 실패: ${e.name}`);
      }
    }
    if (errors) logger.warn(`ZZZ Drive Disc: ${out.length} ok / ${errors} failed`);
    return out;
  }

  private async fetchDiskDetail(slug: string): Promise<{
    icon: string;
    '2pc': { desc: string };
    '4pc': { desc: string };
  }> {
    await this.delay(120);
    const $ = cheerio.load(
      await this.getHtml(`${BASE}/ko/disk-drives/${encodeURIComponent(slug)}`),
    );
    const icon = this.pickIcon($('.disk-drive .top .image img').first());
    const sets: Record<string, { desc: string }> = {};
    $('.disk-description .set').each((_, s) => {
      const label = $(s).find('.set-name').first().text();
      const desc = $(s).find('p').first().text().replace(/\s+/g, ' ').trim();
      if (/2/.test(label)) sets['2pc'] = { desc };
      else if (/4/.test(label)) sets['4pc'] = { desc };
    });
    return {
      icon,
      '2pc': sets['2pc'] || { desc: '' },
      '4pc': sets['4pc'] || { desc: '' },
    };
  }
}
