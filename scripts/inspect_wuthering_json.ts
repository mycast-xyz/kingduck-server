import axios from 'axios';
import fs from 'fs';
import path from 'path';

const URL =
  'https://hw-media-cdn-mingchao.kurogame.com/akiwebsite/website2.0/json/G152/kr/MainMenu.json';

async function fetchAndInspect() {
  try {
    const response = await axios.get(URL);
    const data = response.data;

    // Save full data for inspection
    const outputPath = path.join(
      process.cwd(),
      'data/crawlers/wutheringwaves/raw_menu.json',
    );
    if (!fs.existsSync(path.dirname(outputPath))) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    }
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log(`Saved raw data to ${outputPath}`);

    // Log structure of first few items
    if (Array.isArray(data)) {
      console.log('Data is an array. First item structure:');
      console.log(JSON.stringify(data[0], null, 2));
    } else {
      console.log('Data is an object.');
      console.log(Object.keys(data));
    }
  } catch (error) {
    console.error('Error fetching data:', error);
  }
}

fetchAndInspect();
