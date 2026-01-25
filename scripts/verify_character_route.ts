import axios from 'axios';

const BASE_URL = 'http://localhost:3000/api/v0';

async function verify() {
  try {
    // 1. Get Character List
    console.log('Testing Get Character List for genshin...');
    const charRes = await axios.get(`${BASE_URL}/character/genshin/list`);
    console.log('Status:', charRes.status);
    console.log('Characters found:', charRes.data.length);

    // 2. Get Element List
    console.log('\nTesting Get Element List for genshin...');
    const elemRes = await axios.get(
      `${BASE_URL}/character/genshin/list?type=elements`,
    );
    console.log('Status:', elemRes.status);
    console.log('Elements found:', elemRes.data.length);

    // 3. Filter by Name
    if (charRes.data.length > 0) {
      const targetName = charRes.data[0].name;
      console.log(`\nTesting Filter by Name '${targetName}'...`);
      const nameRes = await axios.get(
        `${BASE_URL}/character/genshin/list?name=${targetName}`,
      );
      console.log('Status:', nameRes.status);
      console.log('Characters found:', nameRes.data.length);
    }

    // 4. Filter by Element ID
    if (elemRes.data.length > 0) {
      const targetElementId = elemRes.data[0].id;
      console.log(`\nTesting Filter by Element ID '${targetElementId}'...`);
      const elemFilterRes = await axios.get(
        `${BASE_URL}/character/genshin/list?elementId=${targetElementId}`,
      );
      console.log('Status:', elemFilterRes.status);
      console.log('Characters found:', elemFilterRes.data.length);
    }

    // 5. Filter by Rarity
    console.log('\nTesting Filter by Rarity 5...');
    const rarityRes = await axios.get(
      `${BASE_URL}/character/genshin/list?rarity=5`,
    );
    console.log('Status:', rarityRes.status);
    console.log('Characters found:', rarityRes.data.length);
  } catch (error: any) {
    console.error('Error during verification:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

verify();
