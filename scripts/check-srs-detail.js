"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
async function checkDetail(id) {
    const url = `https://starrailstation.com/kr/relics/${id}`;
    try {
        const { data: html } = await axios_1.default.get(url);
        const markerMatch = html.match(/window\.PAGE_CONFIG\s*=\s*\{/);
        if (!markerMatch)
            return console.log('Marker not found');
        const startIdx = markerMatch.index;
        const jsonStartIdx = html.indexOf('{', startIdx);
        let configString = '';
        let depth = 0;
        for (let i = jsonStartIdx; i < html.length; i++) {
            const char = html[i];
            if (char === '{')
                depth++;
            else if (char === '}')
                depth--;
            if (depth === 0) {
                configString = html.substring(jsonStartIdx, i + 1);
                break;
            }
        }
        const config = JSON.parse(configString);
        const piece = config.pieces['1'];
        console.log('Piece RarityData:', JSON.stringify(piece.rarityData, null, 2));
        console.log('Piece IconPath:', piece.iconPath);
    }
    catch (e) {
        console.error(e);
    }
}
checkDetail('101');
