import { Browser } from '../../core/Browser';
import { ImageDownloader } from '../../utils/ImageDownloader';
import { prisma } from '../../../utils/prisma';
import logger from '../../../utils/logger';

/**
 * 니케 blablalink(공식 한국어) enrichment 스크래퍼 — 포트레이트 이미지 + 속성 보강.
 *
 * blablalink shiftyspad nikke-list(SPA)를 헤드리스로 렌더하면, SPA가 192캐릭터 전체 속성을 담은
 * 단일 JSON(sg-tools-cdn .json)을 fetch한다 → response 가로채기로 그 JSON을 캡처한다.
 * 이미지(webp) URL은 카드 DOM에만 있고, **카드 DOM 순서 == JSON 레코드 순서**(192/192 검증)라
 * 인덱스로 조인한다. 추출 결과를 이름 매칭해 기존 니케 캐릭터에 image_url + metadata(class/corp/burst 등) 보강.
 * (element_id/path_id/rarity 본 컬럼은 건드리지 않음 — fandom 스크래퍼 소관. 여긴 이미지+필터용 메타.)
 */
const LIST_URL =
  'https://www.blablalink.com/shiftyspad/nikke-list?from=H5_30monthanni&lang=ko';

interface BlChar {
  name: string;
  element: string; // Fire/Water/Wind/Iron/Electronic
  weapon: string; // AR/SMG/SG/MG/RL/SR
  cls: string; // Attacker/Defender/Supporter
  corp: string; // ELYSION/MISSILIS/TETRA/PILGRIM/ABNORMAL
  burst: string; // Step1/Step2/Step3/AllStep
  rarity: string; // SSR/SR/R
  imageUrl: string;
}

export class NikkeBlablalinkImageScraper {
  private norm(s: string): string {
    return (s || '')
      .replace(/\s+\d+$/, '')
      .replace(/[「」:\s]/g, '')
      .toLowerCase();
  }

  // blablalink 리스트 렌더 → JSON 가로채기 + 카드 이미지 인덱스 조인.
  private async scrapeData(): Promise<BlChar[]> {
    const browser = Browser.getInstance();
    await browser.init();
    const page = await browser.getPage();
    let charJson: string | null = null;
    page.on('response', async (resp) => {
      const u = resp.url();
      if (/sg-tools-cdn.*\.json/.test(u)) {
        try {
          const t = await resp.text();
          if (/original_rare/.test(t) && /use_burst_skill/.test(t)) charJson = t;
        } catch {
          /* ignore */
        }
      }
    });
    try {
      await page.goto(LIST_URL, { waitUntil: 'networkidle2', timeout: 60000 });
      await new Promise((r) => setTimeout(r, 4000));
      const cards: Array<{ name: string; imageUrl: string }> = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.nikkes-all-item')).map((it) => {
          const m = it.outerHTML.match(
            /https?:\/\/sg-tools-cdn\.blablalink\.com\/[A-Za-z0-9/_.-]+\.webp/,
          );
          const name = ((it as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim();
          return { name, imageUrl: m ? m[0] : '' };
        });
      });
      if (!charJson) throw new Error('blablalink 캐릭터 JSON을 캡처하지 못함');
      const records: any[] = JSON.parse(charJson);
      // 인덱스 조인(DOM 순서 == JSON 순서). 이름이 어긋나면 이미지 비움(잘못된 매칭 방지).
      return records.map((r, i) => {
        const card = cards[i];
        const name = r?.name_localkey?.name || '';
        return {
          name,
          element: r?.element_id?.element?.element || '',
          weapon: r?.shot_id?.element?.weapon_type || '',
          cls: r?.class || '',
          corp: r?.corporation || '',
          burst: r?.use_burst_skill || '',
          rarity: r?.original_rare || '',
          imageUrl: card && card.name === name ? card.imageUrl : '',
        };
      });
    } finally {
      await page.close();
    }
  }

  // 렌더 → 다운로드 → DB 보강(이름 매칭). 갱신 건수 반환.
  async run(): Promise<number> {
    logger.info('Starting Nikke blablalink enrichment (image + attributes)...');
    const data = await this.scrapeData();
    logger.info(`blablalink: ${data.length} records.`);
    if (data.length === 0) throw new Error('blablalink 데이터 0개 — 렌더/JSON 캡처 실패 의심');

    const game = await prisma.game.findUnique({ where: { slug: 'nikke' } });
    if (!game) throw new Error('nikke 게임을 찾을 수 없습니다.');
    const chars = await prisma.character.findMany({
      where: { gameId: game.id },
      select: { id: true, name: true, metadata: true },
    });
    const byNorm: Record<string, { id: number; name: string; metadata: any }> = {};
    for (const c of chars) byNorm[this.norm(c.name)] = c;

    let updated = 0;
    const unmatched: string[] = [];
    for (const d of data) {
      const c = byNorm[this.norm(d.name)];
      if (!c) {
        unmatched.push(d.name);
        continue;
      }
      const patch: { imageUrl?: string; metadata: any } = {
        metadata: {
          ...(c.metadata || {}),
          // 필터/표시용 — blablalink 공식 enum(프론트 Init에서 한글 매핑).
          blClass: d.cls,
          blCorp: d.corp,
          blBurst: d.burst,
          blElement: d.element,
          blWeapon: d.weapon,
        },
      };
      if (d.imageUrl) {
        const local = await ImageDownloader.downloadAndSave(d.imageUrl, 'nikke', 'character', `bl_${c.id}`);
        if (local) patch.imageUrl = local;
      }
      await prisma.character.update({ where: { id: c.id }, data: patch });
      updated++;
    }
    logger.info(
      `Nikke blablalink enrichment: updated ${updated}, unmatched ${unmatched.length} (${unmatched.slice(0, 10).join(', ')})`,
    );
    return updated;
  }
}
