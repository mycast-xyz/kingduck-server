export const BASE_API_URL = 'https://api.encore.moe/ko';
export const BASE_IMG_URL = 'https://api-v2.encore.moe/resource/Data';

// Helper to construct full image URL if it's relative
export const getImageUrl = (path: string) => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  if (path.startsWith('/'))
    return `https://api-v2.encore.moe/resource/Data${path}`;
  return path;
};

// Weapon Type Mapping (Interferred from API data)
export const WEAPON_TYPE_MAP: Record<number, string> = {
  1: 'Broadblade', // 대검
  2: 'Sword', // 직검
  3: 'Pistols', // 권총
  4: 'Gauntlets', // 권갑
  5: 'Rectifier', // 증폭기
};

export const ELEMENT_MAP: Record<number, string> = {
  1: 'Glacio', // 얼음
  2: 'Fusion', // 화염
  3: 'Electro', // 전도
  4: 'Aero', // 기류
  5: 'Spectro', // 회절
  6: 'Havoc', // 인멸
};
