import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import logger from './logger';

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
      logger.info('Scrolling to load all Shorts...');
      for (let i = 0; i < 10; i++) {
        await page.evaluate(() => {
          window.scrollTo(0, document.documentElement.scrollHeight);
        });
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      logger.info('Finished scrolling');

      // YouTube의 초기 데이터 추출
      const pageConfig = await page.evaluate(() => {
        return (window as any).ytInitialData || null;
      });

      if (!pageConfig) {
        throw new Error('YouTube 데이터를 찾을 수 없습니다.');
      }

      return pageConfig;
    } catch (error) {
      logger.error('페이지 설정 추출 중 오류 발생:', error);
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
      // Create a wrapper that points to the system binary if possible
      const youtubedlFactory = (await import('youtube-dl-exec')).create;

      // Try to find system binary path (common locations)
      // On Mac/Linux brew installs to /opt/homebrew/bin or /usr/local/bin
      // We can try to use just 'yt-dlp' if it's in PATH, but spawn might not catch it if PATH isn't inherited perfectly in dev env.
      // Let's assume 'yt-dlp' is in PATH.

      const saveDirectory = path.join(__dirname, '../../static/video/');

      // 로컬 바이너리 경로는 OS별로 다르다: Windows는 bin/yt-dlp.exe, Linux/Mac은 bin/yt-dlp.
      // (홈서버는 Ubuntu라 .exe를 쓰면 안 됨.) 로컬 바이너리가 없으면 PATH의 전역 yt-dlp로 폴백한다
      // → Ubuntu에선 `apt install yt-dlp` 또는 `pip install yt-dlp`로 설치돼 있어야 한다.
      const binaryName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
      const localBinaryPath = path.resolve(process.cwd(), 'bin', binaryName);
      let ytDlpPath = 'yt-dlp'; // PATH의 전역 yt-dlp 기본값

      if (fs.existsSync(localBinaryPath)) {
        logger.info(`Using local yt-dlp binary: ${localBinaryPath}`);
        ytDlpPath = localBinaryPath;
      } else {
        logger.info(
          `Using global yt-dlp from PATH (local bin/${binaryName} not found)`,
        );
      }

      const youtubedl = youtubedlFactory(ytDlpPath);

      if (!fs.existsSync(saveDirectory)) {
        fs.mkdirSync(saveDirectory, { recursive: true });
      }

      logger.info('Downloading to:', saveDirectory);

      const outputPathTemplate = path.join(
        saveDirectory,
        `${fileName}.%(ext)s`,
      );

      await youtubedl(url, {
        output: outputPathTemplate,
        // 세로 Shorts는 픽셀 height가 720p=1280 / 1080p=1920이라 height<=1280으로 720p까지 허용.
        // 브라우저 <video> 호환을 위해 avc1(H.264) mp4 우선(av01/AV1은 Safari 등 호환 좁음).
        // 영상은 InfoMainImageView에서 muted 배경으로 재생되므로 video-only로 받아 ffmpeg 병합 불필요.
        format:
          'bestvideo[height<=1280][vcodec^=avc1][ext=mp4]/bestvideo[height<=1280][ext=mp4]/bestvideo[height<=1280]/best',
        // YouTube n-challenge 해결용 JS 런타임. 기본은 deno만 켜져 있어 node를 명시한다(설치돼 있음).
        // 이게 없으면 챌린지 실패로 고화질 포맷이 누락돼 360p(format18)만 받아진다.
        jsRuntimes: 'node',
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
        logger.info(`Successfully downloaded: ${downloadedFile}`);
        return extension;
      }

      return null;
      return null;
    } catch (error: any) {
      logger.error('동영상 다운로드 실패 상세:', error);
      logger.error('동영상 다운로드 실패 메시지:', error.message);
      if (error.stderr) logger.error('STDERR:', error.stderr);
      if (error.stdout) logger.error('STDOUT:', error.stdout);
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
    logger.info(`다운로드 시작: ${url}`);
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
      logger.info(`검색 시작: "${title}"`);

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
        logger.info('검색 결과를 찾을 수 없습니다.');
        return false;
      }

      // 첫 번째 동영상 정보 찾기
      const videoData = contents?.videoRenderer;

      if (!videoData) {
        logger.info(`검색 실패: "${title}" 관련 동영상을 찾을 수 없습니다.`);
        return false;
      }

      const youtubeTitle = videoData.title.runs[0].text;
      const youtubeVideoId = videoData.videoId;

      // 제목 일치 여부 확인 후 다운로드
      if (youtubeTitle.includes(title)) {
        logger.info(`검색 성공: "${title}" 동영상을 찾았습니다.`);
        await YoutubeUtils.downloadVideoById(youtubeVideoId);
        return youtubeVideoId;
      } else {
        logger.info(`검색 실패: "${title}" 동영상을 찾을 수 없습니다.`);
        return false;
      }
    } catch (error) {
      logger.error('YouTube 검색 및 다운로드 중 오류 발생:', error);
      return false;
    }
  }
}

// 클래스와 static 메서드를 함께 내보내기
export const fetchAndDownloadVideo =
  YoutubeUtils.fetchAndDownloadVideo.bind(YoutubeUtils);
export default YoutubeUtils;
