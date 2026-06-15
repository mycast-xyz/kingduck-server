import axios from 'axios';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import logger from '../../utils/logger';

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
      referer: 'https://genshin.honeyhunterworld.com/',
    },
    zzz: {
      referer: 'https://zenless.gg/',
    },
    nikke: {
      referer: 'https://nikke.gg/',
    },
  };

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

      // Check if already exists (Skip if exists to save bandwidth)
      if (fs.existsSync(filePath)) {
        logger.info(
          `Image already exists, skipping: ${gameSlug}/${category}/${fileName}.webp`,
        );
        return relativePath;
      }

      // Get game-specific config
      const gameConfig = this.GAME_CONFIGS[gameSlug] || {};

      // Download
      const response = await axios({
        url,
        method: 'GET',
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
