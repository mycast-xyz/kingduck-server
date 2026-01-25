"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const fs_1 = __importDefault(require("fs"));
async function fetchLightConeDetail() {
    const url = 'https://api.hakush.in/hsr/data/kr/lightcone/20000.json';
    try {
        const { data } = await axios_1.default.get(url);
        fs_1.default.writeFileSync('lightcone_api_sample.json', JSON.stringify(data, null, 2), 'utf-8');
        console.log('✅ Saved API response to: lightcone_api_sample.json');
        console.log('\nAPI Response Keys:', Object.keys(data));
        console.log('\nSample data:');
        console.log('  Name:', data.Name || data.name);
        console.log('  Rarity:', data.Rarity || data.rarity);
        console.log('  BaseType:', data.BaseType || data.baseType);
    }
    catch (error) {
        console.error('Failed to fetch:', error);
    }
}
fetchLightConeDetail();
