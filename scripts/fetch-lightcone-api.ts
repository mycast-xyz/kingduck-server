import axios from 'axios';
import fs from 'fs';

async function fetchLightConeDetail() {
  const url = 'https://api.hakush.in/hsr/data/kr/lightcone/20000.json';

  try {
    const { data } = await axios.get(url);

    fs.writeFileSync(
      'lightcone_api_sample.json',
      JSON.stringify(data, null, 2),
      'utf-8',
    );

    console.log('✅ Saved API response to: lightcone_api_sample.json');
    console.log('\nAPI Response Keys:', Object.keys(data));
    console.log('\nSample data:');
    console.log('  Name:', data.Name || data.name);
    console.log('  Rarity:', data.Rarity || data.rarity);
    console.log('  BaseType:', data.BaseType || data.baseType);
  } catch (error) {
    console.error('Failed to fetch:', error);
  }
}

fetchLightConeDetail();
