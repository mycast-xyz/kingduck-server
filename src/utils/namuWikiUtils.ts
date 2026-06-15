import puppeteer from 'puppeteer';

class NamuWiki {
  // 나무위키 참조 처리
  async fetchNamuWikiPage(url: string) {
    let browser;
    try {
      // 브라우저 실행
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();

      // 요청 차단 설정
      await page.setRequestInterception(true);
      page.on('request', (request: any) => {
        switch (request.resourceType()) {
          case 'stylesheet':
          case 'font':
          case 'image':
            request.abort();
            break;
          default:
            request.continue();
            break;
        }
      });

      // 사용자 에이전트 설정
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.82 Safari/537.36',
      );

      // URL로 이동
      await page.goto(url, { timeout: 100000 });

      // 페이지 대기
      await new Promise((resolve) => setTimeout(resolve, 10000));

      return page;
    } catch (error) {
      console.error('페이지 로딩 중 오류:', error);
      if (browser) await browser.close();
      throw error;
    }
  }
}

export default new NamuWiki();
