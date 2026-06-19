import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import logger from '../../utils/logger';
import { axiosGetWithRetry } from './httpRetry';

/**
 * Game-specific configuration for image downloading
 */
interface GameImageConfig {
  referer?: string;
  headers?: Record<string, string>;
}

/**
 * ImageDownloader - A utility class for downloading and converting images to WebP format
 * Supports multiple games with game-specific configurations
 */
export class ImageDownloader {
  private static readonly BASE_STATIC_PATH = path.join(
    process.cwd(),
    'static',
    'image',
  );

  // Game-specific configurations
  private static readonly GAME_CONFIGS: Record<string, GameImageConfig> = {
    starrail: {
      referer: 'https://hsr20.hakush.in/',
    },
    genshin: {
      referer: 'https://gi.yatta.moe/',
    },
    zzz: {
      referer: 'https://zenless.gg/',
    },
    nikke: {
      referer: 'https://nikke.gg/',
    },
  };

  /**
   * 강제 덮어쓰기 모드. 어드민 "덮어쓰기 실행"(강제 새로고침)이 크롤 전 true로 설정 →
   * 이미 존재하는 이미지도 skip하지 않고 재다운로드. 크롤 종료 후 다시 false로 리셋한다.
   */
  public static forceOverwrite = false;

  /**
   * Downloads an image from a URL, converts it to WebP, and saves it.
   * @param url The source URL of the image.
   * @param gameSlug The game identifier (e.g., 'starrail', 'genshin', 'zzz').
   * @param category The sub-folder category (e.g., 'character', 'weapon').
   * @param fileName The output filename (without extension).
   * @returns The relative path to access the image (e.g., 'assets/image/starrail/character/icon.webp').
   */
  public static async downloadAndSave(
    url: string,
    gameSlug: string,
    category: string,
    fileName: string,
  ): Promise<string | null> {
    try {
      // Build paths
      const dirPath = path.join(this.BASE_STATIC_PATH, gameSlug, category);
      const filePath = path.join(dirPath, `${fileName}.webp`);
      const relativePath = `assets/image/${gameSlug}/${category}/${fileName}.webp`;

      // Ensure directory exists
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      // Check if already exists (Skip if exists to save bandwidth) — 단, 강제 덮어쓰기면 재다운로드.
      if (!ImageDownloader.forceOverwrite && fs.existsSync(filePath)) {
        logger.info(
          `Image already exists, skipping: ${gameSlug}/${category}/${fileName}.webp`,
        );
        return relativePath;
      }

      // Get game-specific config
      const gameConfig = this.GAME_CONFIGS[gameSlug] || {};

      // Download (전이성 오류는 재시도, 404 등은 fail-fast — B-H7 후속)
      const response = await axiosGetWithRetry<Buffer>(url, {
        responseType: 'arraybuffer',
        timeout: 15000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          ...(gameConfig.referer && { Referer: gameConfig.referer }),
          ...gameConfig.headers,
        },
      });

      // Convert to WebP and Save
      await sharp(response.data).webp({ quality: 80 }).toFile(filePath);

      logger.info(`Saved image: ${gameSlug}/${category}/${fileName}.webp`);

      return relativePath;
    } catch (error) {
      logger.error(`Failed to download image from ${url}:`, error);
      return null;
    }
  }
}
