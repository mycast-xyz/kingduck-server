import axios from 'axios';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import logger from '../../utils/logger';

const STATIC_DIR = path.join(process.cwd(), 'static');
const BASE_IMG_URL = 'https://api-v2.encore.moe/resource/Data';

export class WutheringWavesDownloader {
  private static ensureDir(dirPath: string) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Downloads an asset preserving its path structure relative to /resource/
   * Handles relative paths (/Game/...) and UE4 repeated names
   * returns the JSON reference path (assets/resource/wutheringwaves/.../file.webp)
   */
  public static async downloadAsset(url: string): Promise<string> {
    if (!url) return url;

    // 1. Resolve relative URLs
    let fullUrl = url;
    if (url.startsWith('/')) {
      fullUrl = `${BASE_IMG_URL}${url}`;
    }

    if (!fullUrl.startsWith('http')) return url;

    try {
      // 2. Handle UE4 repeated name style: Name.Name -> Name.png
      const basename = path.basename(url);
      const parts = basename.split('.');

      // If basename is exactly Name.Name (2 parts, identical)
      if (parts.length === 2 && parts[0] === parts[1]) {
        const dir = path.dirname(url);
        if (url.startsWith('/')) {
          const urlDir = url.substring(0, url.lastIndexOf('/'));
          fullUrl = `${BASE_IMG_URL}${urlDir}/${parts[0]}.png`;
        } else {
          // If original url was http... likely won't hit this based on observation but safe fallback
          // We need to manipulate the fullUrl directly
          // Let's rely on fullUrl manipulation
          const fullDir = fullUrl.substring(0, fullUrl.lastIndexOf('/'));
          fullUrl = `${fullDir}/${parts[0]}.png`;
        }
      }

      const urlObj = new URL(fullUrl);
      const originalPath = urlObj.pathname; // This might have .png or original ext

      // 3. Construct Paths
      // Storage: static/resource/wutheringwaves/...
      // JSON Ref: assets/resource/wutheringwaves/...

      let pathSuffix = '';
      if (originalPath.startsWith('/resource/')) {
        pathSuffix = originalPath.replace('/resource/', '');
      } else {
        pathSuffix = originalPath.startsWith('/')
          ? originalPath.slice(1)
          : originalPath;
      }

      // Determine extension and handling
      const ext = path.extname(pathSuffix).toLowerCase();
      const isVideo = ext === '.mp4' || ext === '.webm';

      const dirName = path.dirname(pathSuffix);
      const name = path.basename(pathSuffix, ext);

      // Use original extension for video, .webp for images
      const finalExt = isVideo ? ext : '.webp';
      const finalPathSuffix = path.join(dirName, `${name}${finalExt}`);

      const jsonRef = path.join(
        'assets',
        'resource',
        'wutheringwaves',
        finalPathSuffix,
      );
      const storageRelPath = path.join(
        'resource',
        'wutheringwaves',
        finalPathSuffix,
      );

      const localFullPath = path.join(STATIC_DIR, storageRelPath);
      const localDir = path.dirname(localFullPath);

      // 4. Check Existence
      if (fs.existsSync(localFullPath)) {
        return jsonRef;
      }

      this.ensureDir(localDir);

      // 5. Download
      const response = await axios({
        url: fullUrl,
        method: 'GET',
        responseType: 'arraybuffer',
        timeout: 15000,
      });

      // 6. Save (Convert if image, Raw if video)
      if (isVideo) {
        fs.writeFileSync(localFullPath, response.data);
      } else {
        await sharp(response.data).webp({ quality: 80 }).toFile(localFullPath);
      }

      return jsonRef;
    } catch (error) {
      if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
        logger.warn(`Download timed out for ${fullUrl}`);
      } else {
        logger.warn(
          `Failed to download ${fullUrl}: ${(error as Error).message}`,
        );
      }
      return url;
    }
  }
}
