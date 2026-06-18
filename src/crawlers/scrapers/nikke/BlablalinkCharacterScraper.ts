import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { Browser } from '../../core/Browser';
import { ImageDownloader } from '../../utils/ImageDownloader';
import logger from '../../../utils/logger';

/**
 * 니케 캐릭터 스크래퍼 — blablalink(SHIFT UP 공식 한국어) 단일 소스.
 *
 * fandom(영문)+Inven(스킬)을 대체한다. blablalink shiftyspad nikke-list(SPA)를 헤드리스로 렌더하면
 * SPA가 192캐릭 전체 속성을 담은 단일 JSON(sg-tools-cdn .json)을 fetch한다 → response 가로채기로 캡처.
 * 포트레이트 이미지(webp)는 카드 DOM에만 있고 **카드 순서 == JSON 순서**라 인덱스로 조인한다.
 *
 * originalId = blablalink record.id(예: 209001) — 안정적 공식 키로 일원화(머신별 id 불일치 해소).
 * 스킬/스토리/코스튬/스탯 등 상세는 별도 enrichment(상세 페이지 per-resource_id 렌더)에서 후속.
 */
const LIST_URL =
  'https://www.blablalink.com/shiftyspad/nikke-list?from=H5_30monthanni&lang=ko';

// blablalink enum → 기존 Element 이름(다른 게임 관행과 동일 키 유지, 재사용으로 admin 아이콘/색 보존).
const ELEMENT_MAP: Record<string, string> = {
  Fire: 'Fire',
  Water: 'Water',
  Wind: 'Wind',
  Iron: 'Iron',
  Electronic: 'Electric', // blablalink는 Electronic, 기존 표기는 Electric
};
const RARITY_MAP: Record<string, number> = { SSR: 5, SR: 4, R: 3 };

export class BlablalinkCharacterScraper extends ScraperBase {
  constructor() {
    super('nikke');
  }

  async scrape(limit?: number): Promise<ScrapedData[]> {
    logger.info('Starting Nikke character scraping (blablalink, official KR)...');
    const browser = Browser.getInstance();
    await browser.init();
    const page = await browser.getPage();
    let charJson: string | null = null;
    page.on('response', async (resp) => {
      if (/sg-tools-cdn.*\.json/.test(resp.url())) {
        try {
          const t = await resp.text();
          if (/original_rare/.test(t) && /use_burst_skill/.test(t)) charJson = t;
        } catch {
          /* ignore */
        }
      }
    });

    let cards: Array<{ name: string; imageUrl: string }> = [];
    try {
      await page.goto(LIST_URL, { waitUntil: 'networkidle2', timeout: 60000 });
      await new Promise((r) => setTimeout(r, 4000));
      cards = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.nikkes-all-item')).map((it) => {
          const m = it.outerHTML.match(
            /https?:\/\/sg-tools-cdn\.blablalink\.com\/[A-Za-z0-9/_.-]+\.webp/,
          );
          const name = ((it as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim();
          return { name, imageUrl: m ? m[0] : '' };
        }),
      );
    } finally {
      await page.close();
    }

    if (!charJson) throw new Error('blablalink 캐릭터 JSON을 캡처하지 못함(렌더 실패 의심)');
    let records: any[] = JSON.parse(charJson);
    if (limit && limit > 0) records = records.slice(0, limit);

    const results: ScrapedData[] = [];
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const name = r?.name_localkey?.name;
      const blId = r?.id;
      if (!name || blId == null) continue;

      const elementRaw = r?.element_id?.element?.element || ''; // Fire/Water/Wind/Iron/Electronic
      const weapon = r?.shot_id?.element?.weapon_type || ''; // AR/SMG/SG/MG/RL/SR
      const cls = r?.class || '';
      const corp = r?.corporation || '';
      const burst = r?.use_burst_skill || '';
      const rarityStr = (r?.original_rare || '').toUpperCase();

      // 이미지(인덱스 조인; 이름 일치 가드). 다운로드 후 로컬 경로.
      const card = cards[i];
      const portraitUrl = card && card.name === name ? card.imageUrl : '';
      let localImage = '';
      if (portraitUrl) {
        localImage =
          (await ImageDownloader.downloadAndSave(portraitUrl, 'nikke', 'character', `bl_${blId}`)) ||
          '';
      }

      results.push({
        name,
        sourceUrl: `https://www.blablalink.com/shiftyspad/nikke?nikke=${r?.resource_id}&lang=ko`,
        imageUrl: localImage,
        rarity: RARITY_MAP[rarityStr] ?? null,
        weaponType: weapon || null,
        role: cls || null,
        metadata: {
          originalId: String(blId),
          element: ELEMENT_MAP[elementRaw] || elementRaw, // DamageType 해석용
          path: weapon, // Path 해석용(무기)
          rarity: rarityStr,
          class: cls, // 필터/표시용 enum(Attacker/Defender/Supporter)
          corp, // ELYSION/MISSILIS/TETRA/PILGRIM/ABNORMAL
          burst, // Step1/Step2/Step3/AllStep
          resourceId: r?.resource_id, // 상세 페이지 키
          nameCode: r?.name_code,
        },
      });
    }

    logger.info(`blablalink: ${results.length} characters (${cards.length} cards).`);
    if (results.length < 150) {
      throw new Error(`blablalink 캐릭터 ${results.length}개 — 비정상(150 미만), 교체 중단`);
    }
    return results;
  }
}
