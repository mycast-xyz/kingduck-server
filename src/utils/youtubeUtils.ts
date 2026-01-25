import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

/**
 * YouTube 동영상 검색, 다운로드 및 처리를 위한 유틸리티 클래스
 */
class YoutubeUtils {
  /**
   * YouTube 페이지의 설정 데이터를 추출하는 함수
   * @param url 대상 YouTube URL
   * @returns 페이지의 초기 데이터 객체
   * @throws YouTube 데이터를 찾을 수 없는 경우 에러
   */
  static async getPageConfig(url: string): Promise<any> {
    const browser = await puppeteer.launch({
      headless: true, // 헤드리스 모드 사용
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();

      // 성능 최적화를 위한 리소스 요청 필터링
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const blockResources = ['image', 'stylesheet', 'font'];
        blockResources.includes(request.resourceType())
          ? request.abort()
          : request.continue();
      });

      // 크롤링 방지 우회를 위한 사용자 에이전트 설정
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.82 Safari/537.36',
      );

      await page.goto(url, { timeout: 100000 });
      await new Promise((resolve) => setTimeout(resolve, 3000)); // Initial load

      // Scroll down multiple times to load all content (infinite scroll)
      console.log('Scrolling to load all Shorts...');
      for (let i = 0; i < 10; i++) {
        await page.evaluate(() => {
          window.scrollTo(0, document.documentElement.scrollHeight);
        });
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      console.log('Finished scrolling');

      // YouTube의 초기 데이터 추출
      const pageConfig = await page.evaluate(() => {
        return (window as any).ytInitialData || null;
      });

      if (!pageConfig) {
        throw new Error('YouTube 데이터를 찾을 수 없습니다.');
      }

      return pageConfig;
    } catch (error) {
      console.error('페이지 설정 추출 중 오류 발생:', error);
      throw error;
    } finally {
      await browser.close();
    }
  }

  static async downloadYoutubeVideo(
    url: string,
    fileName: string,
  ): Promise<string | null> {
    try {
      const youtubedl = (await import('youtube-dl-exec')).default;
      const saveDirectory = path.join(__dirname, '../../static/video/');

      if (!fs.existsSync(saveDirectory)) {
        fs.mkdirSync(saveDirectory, { recursive: true });
      }

      console.log('Downloading to:', saveDirectory);

      // Preferred format: Best WebM up to 1080p, then Best MP4 up to 1080p
      // We use a simpler format selection that prioritizes 1080p/720p
      // bestvideo[height<=1080][ext=webm]/bestvideo[height<=1080][ext=mp4]/best

      const outputPathTemplate = path.join(
        saveDirectory,
        `${fileName}.%(ext)s`,
      );

      await youtubedl(url, {
        output: outputPathTemplate,
        format:
          'bestvideo[height<=1080][ext=webm]/bestvideo[height<=1080][ext=mp4]/best',
        noWarnings: true,
      });

      // Find which file was actually created (extension might be webm or mp4)
      const files = fs.readdirSync(saveDirectory);
      const downloadedFile = files.find(
        (f) =>
          f.startsWith(fileName) && (f.endsWith('.webm') || f.endsWith('.mp4')),
      );

      if (downloadedFile) {
        const extension = downloadedFile.split('.').pop() || 'webm';
        console.log(`Successfully downloaded: ${downloadedFile}`);
        return extension;
      }

      return null;
    } catch (error: any) {
      console.error('동영상 다운로드 실패:', error.message);
      return null;
    }
  }

  /**
   * 동영상 ID로 YouTube 동영상을 다운로드하는 함수
   * @param videoId YouTube 동영상 ID
   * @returns 다운로드 성공 여부
   */
  static async downloadVideoById(videoId: string): Promise<string | null> {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`다운로드 시작: ${url}`);
    return await this.downloadYoutubeVideo(url, videoId);
  }

  /**
   * 검색어와 채널 URL을 기반으로 동영상을 검색하고 다운로드하는 함수
   * @param searchQuery 검색할 동영상 제목
   * @param searchChannelUrl 검색할 채널 URL (기본값: YouTube 메인)
   * @returns 성공 시 동영상 ID, 실패 시 false
   */
  static async fetchAndDownloadVideo(
    searchQuery: string,
    searchChannelUrl: string = 'https://www.youtube.com',
  ): Promise<string | boolean> {
    try {
      const title = searchQuery;
      console.log(`검색 시작: "${title}"`);

      // YouTube 검색 결과 페이지에서 데이터 추출
      const youtubeDataList = await YoutubeUtils.getPageConfig(
        `${searchChannelUrl}/search?query=${encodeURIComponent(searchQuery)}`,
      );

      // YouTube 데이터 구조 안전하게 접근
      const tabs =
        youtubeDataList.contents?.twoColumnBrowseResultsRenderer?.tabs;
      const tabRenderer = tabs?.find((tab: any) => tab.expandableTabRenderer);

      // YouTube 데이터 구조 안전하게 접근
      const contents =
        tabRenderer?.expandableTabRenderer?.content?.sectionListRenderer
          ?.contents?.[0]?.itemSectionRenderer?.contents[0];

      if (!contents) {
        console.log('검색 결과를 찾을 수 없습니다.');
        return false;
      }

      // 첫 번째 동영상 정보 찾기
      const videoData = contents?.videoRenderer;

      if (!videoData) {
        console.log(`검색 실패: "${title}" 관련 동영상을 찾을 수 없습니다.`);
        return false;
      }

      const youtubeTitle = videoData.title.runs[0].text;
      const youtubeVideoId = videoData.videoId;

      // 제목 일치 여부 확인 후 다운로드
      if (youtubeTitle.includes(title)) {
        console.log(`검색 성공: "${title}" 동영상을 찾았습니다.`);
        await YoutubeUtils.downloadVideoById(youtubeVideoId);
        return youtubeVideoId;
      } else {
        console.log(`검색 실패: "${title}" 동영상을 찾을 수 없습니다.`);
        return false;
      }
    } catch (error) {
      console.error('YouTube 검색 및 다운로드 중 오류 발생:', error);
      return false;
    }
  }
}

// 클래스와 static 메서드를 함께 내보내기
export const fetchAndDownloadVideo =
  YoutubeUtils.fetchAndDownloadVideo.bind(YoutubeUtils);
export default YoutubeUtils;
