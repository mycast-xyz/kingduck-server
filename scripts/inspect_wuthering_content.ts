import axios from 'axios';
import fs from 'fs';
import path from 'path';

const URL =
  'https://hw-media-cdn-mingchao.kurogame.com/akiwebsite/website2.0/json/G152/kr/MainMenu.json';

async function inspectContent() {
  try {
    const response = await axios.get(URL);
    const articles = response.data.article;

    // Find one Update and one Tuning
    const updateEvent = articles.find((a: any) =>
      a.articleTitle.includes('버전 내용 안내'),
    );
    const tuningEvent = articles.find((a: any) =>
      a.articleTitle.includes('이벤트 튜닝'),
    );

    let output = '';
    if (updateEvent) {
      output += `=== UPDATE EVENT: ${updateEvent.articleTitle} ===\n`;
      output += updateEvent.articleContent + '\n\n';
    }
    if (tuningEvent) {
      output += `=== TUNING EVENT: ${tuningEvent.articleTitle} ===\n`;
      output += tuningEvent.articleContent + '\n\n';
    }

    const outputPath = path.join(
      process.cwd(),
      'data/crawlers/wutheringwaves/content_sample.txt',
    );
    fs.writeFileSync(outputPath, output, 'utf-8');
    console.log(`Saved content sample to ${outputPath}`);
  } catch (error) {
    console.error(error);
  }
}

inspectContent();
