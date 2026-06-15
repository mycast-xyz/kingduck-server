import axios from 'axios';
import puppeteer from 'puppeteer';

export const fetchData = async (url: string) => {
  const response = await axios.get(url);
  return response.data;
};

export const fetchPageConfig = async (url: string, waitTime: number = 3000) => {
  // 브라우저 실행
  const browser = await puppeteer.launch();
  // goto/evaluate 등이 throw해도 브라우저를 반드시 종료하도록 try/finally로 감싼다(좀비 Chromium 방지).
  try {
    const page = await browser.newPage();
    // 요청 차단 설정
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (['image', 'stylesheet', 'font'].includes(request.resourceType())) {
        request.abort();
      } else {
        request.continue();
      }
    });
    // 사용자 에이전트 설정
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.82 Safari/537.36',
    );
    // URL로 이동
    await page.goto(url, { timeout: 100000 });
    // 페이지 대기 (사람처럼 보이기 위해 대기 시간을 추가할 수 있습니다)
    await new Promise((resolve) => setTimeout(resolve, waitTime));
    // window.PAGE_CONFIG 값 추출
    const pageConfig = await page.evaluate(() => {
      return (window as any).PAGE_CONFIG;
    });
    return pageConfig;
  } finally {
    // 브라우저 종료
    await browser.close();
  }
};
