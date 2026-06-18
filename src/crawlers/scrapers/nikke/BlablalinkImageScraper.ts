import { Browser } from '../../core/Browser';
import { ImageDownloader } from '../../utils/ImageDownloader';
import { prisma } from '../../../utils/prisma';
import logger from '../../../utils/logger';

/**
 * 니케 이미지 보강 스크래퍼 — blablalink(공식 한국어) 포트레이트로 교체.
 *
 * fandom 아이콘(S.png)이 127x128로 너무 작아 리스트 카드에서 저해상도로 깨져 보이는 문제를
 * 해결하기 위해, blablalink shiftyspad nikke-list(SPA)를 헤드리스로 렌더해 캐릭터별
 * 포트레이트 이미지(sg-tools-cdn)를 추출 → 다운로드 → 이름 매칭으로 image_url만 갱신한다.
 * (캐릭터 본 데이터는 건드리지 않음 — 이미지 전용 enrichment.)
 */
const LIST_URL =
  'https://www.blablalink.com/shiftyspad/nikke-list?from=H5_30monthanni&lang=ko';

export class NikkeBlablalinkImageScraper {
  // 이름 정규화(매칭용): 끝 카운트 숫자 제거 + 공백·「」·: 제거 + 소문자.
  private norm(s: string): string {
    return (s || '')
      .replace(/\s+\d+$/, '')
      .replace(/[「」:\s]/g, '')
      .toLowerCase();
  }

  // blablalink 리스트를 렌더해 { 캐릭터명: 이미지URL } 추출.
  private async scrapeMap(): Promise<Record<string, string>> {
    const browser = Browser.getInstance();
    await browser.init();
    const page = await browser.getPage();
    try {
      await page.goto(LIST_URL, { waitUntil: 'networkidle2', timeout: 60000 });
      await new Promise((r) => setTimeout(r, 4000));
      // 카드는 전부 DOM에 있고(가상화 X) 이미지 URL은 lazy 속성에 들어있어
      // 각 카드 outerHTML에서 sg-tools-cdn URL을 정규식으로 뽑는다(스크롤 불필요).
      const pairs: Array<{ name: string; url: string }> = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('.nikkes-all-item'));
        return items.map((it) => {
          const m = it.outerHTML.match(
            /https?:\/\/sg-tools-cdn\.blablalink\.com\/[A-Za-z0-9/_.-]+\.webp/,
          );
          const name = ((it as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim();
          return { name, url: m ? m[0] : '' };
        });
      });
      const map: Record<string, string> = {};
      for (const { name, url } of pairs) {
        if (name && url && !map[name]) map[name] = url;
      }
      return map;
    } finally {
      await page.close();
    }
  }

  // 렌더 → 다운로드 → DB image_url 갱신(이름 매칭). 갱신 건수 반환.
  async run(): Promise<number> {
    logger.info('Starting Nikke blablalink image scraping...');
    const map = await this.scrapeMap();
    const names = Object.keys(map);
    logger.info(`blablalink: ${names.length} character portraits found.`);
    if (names.length === 0) {
      throw new Error('blablalink 이미지 0개 — 렌더/셀렉터 실패 의심');
    }

    const game = await prisma.game.findUnique({ where: { slug: 'nikke' } });
    if (!game) throw new Error('nikke 게임을 찾을 수 없습니다.');
    const chars = await prisma.character.findMany({
      where: { gameId: game.id },
      select: { id: true, name: true },
    });
    const byNorm: Record<string, { id: number; name: string }> = {};
    for (const c of chars) byNorm[this.norm(c.name)] = c;

    let updated = 0;
    const unmatched: string[] = [];
    for (const [name, url] of Object.entries(map)) {
      const c = byNorm[this.norm(name)];
      if (!c) {
        unmatched.push(name);
        continue;
      }
      const local = await ImageDownloader.downloadAndSave(url, 'nikke', 'character', `bl_${c.id}`);
      if (local) {
        await prisma.character.update({ where: { id: c.id }, data: { imageUrl: local } });
        updated++;
      }
    }
    logger.info(
      `Nikke blablalink images: updated ${updated}, unmatched ${unmatched.length} (${unmatched.slice(0, 10).join(', ')})`,
    );
    return updated;
  }
}
