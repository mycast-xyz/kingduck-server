import axios from 'axios';

const BASE_URL =
  'https://hw-media-cdn-mingchao.kurogame.com/akiwebsite/website2.0/json/G152/kr';
const ID = 4212;

const candidates = [
  `${BASE_URL}/article/${ID}.json`,
  `${BASE_URL}/news/${ID}.json`,
  `${BASE_URL}/detail/${ID}.json`,
  `${BASE_URL}/content/${ID}.json`,
  `${BASE_URL}/${ID}.json`,
  // Sometimes they are grouped?
];

async function probe() {
  for (const url of candidates) {
    try {
      console.log(`Checking ${url}...`);
      const res = await axios.get(url, { validateStatus: () => true });
      if (res.status === 200) {
        console.log(`FOUND! ${url}`);
        console.log('Sample:', JSON.stringify(res.data).substring(0, 200));
        return;
      } else {
        console.log(`Failed: ${res.status}`);
      }
    } catch (e) {
      console.error(`Error checking ${url}`);
    }
  }
  console.log('No valid endpoint found.');
}

probe();
