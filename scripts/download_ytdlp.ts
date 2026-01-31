import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { Stream } from 'stream';
import { promisify } from 'util';

const finished = promisify(Stream.finished);

async function downloadFile(
  fileUrl: string,
  outputLocationPath: string,
): Promise<any> {
  const writer = fs.createWriteStream(outputLocationPath);
  return axios({
    method: 'get',
    url: fileUrl,
    responseType: 'stream',
  }).then((response) => {
    response.data.pipe(writer);
    return finished(writer);
  });
}

async function main() {
  const BIN_DIR = path.resolve(process.cwd(), 'bin');
  const OUTPUT_FILE = path.join(BIN_DIR, 'yt-dlp.exe');

  if (!fs.existsSync(BIN_DIR)) {
    console.log(`Creating directory: ${BIN_DIR}`);
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }

  console.log('Fetching latest release info for yt-dlp...');
  try {
    const releaseUrl =
      'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest';
    const { data } = await axios.get(releaseUrl);

    // Find the asset named 'yt-dlp.exe'
    const asset = data.assets.find((a: any) => a.name === 'yt-dlp.exe');

    if (!asset) {
      console.error('Could not find yt-dlp.exe in the latest release assets.');
      return;
    }

    const downloadUrl = asset.browser_download_url;
    console.log(`Downloading yt-dlp.exe from ${downloadUrl}...`);

    await downloadFile(downloadUrl, OUTPUT_FILE);
    console.log(`Success! yt-dlp.exe saved to: ${OUTPUT_FILE}`);
  } catch (error) {
    console.error('Error downloading yt-dlp:', error);
  }
}

main();
