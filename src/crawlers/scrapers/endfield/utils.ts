export const BASE_LIST_URL =
  'https://endfieldtools.dev/localdb/optimized/characters/characters-list.json';
export const BASE_DETAIL_URL =
  'https://endfieldtools.dev/localdb/optimized/characters/details';

export const BASE_WEAPON_LIST_URL =
  'https://endfieldtools.dev/localdb/optimized/weapons/weapons-list.json';
export const BASE_WEAPON_DETAIL_URL =
  'https://endfieldtools.dev/localdb/optimized/weapons/details';

export const BASE_EQUIPMENT_SUIT_LIST_URL =
  'https://endfieldtools.dev/localdb/optimized/equipment/suits/suits-list.json';
export const BASE_EQUIPMENT_SUIT_DETAIL_URL =
  'https://endfieldtools.dev/localdb/optimized/equipment/suits/details';
export const BASE_EQUIPMENT_ITEM_DETAIL_URL =
  'https://endfieldtools.dev/localdb/optimized/equipment/details';
export const BASE_ITEM_LIST_URL =
  'https://endfieldtools.dev/localdb/optimized/items/items-list.json';

export const BASE_ICON_URL =
  'https://endfieldtools.dev/assets/images/endfield/charhorheadicon';
export const BASE_SPLASH_URL = 'https://assets.warfarin.wiki/v2/charsplash';

export const I18N_URLS = {
  CORE: 'https://endfieldtools.dev/localdb/optimized/i18n/core/I18nTextTable_KR.json',
  CHARACTERS:
    'https://endfieldtools.dev/localdb/optimized/i18n/characters/I18nTextTable_KR.json',
  WEAPONS:
    'https://endfieldtools.dev/localdb/optimized/i18n/weapons/I18nTextTable_KR.json',
  COMBAT:
    'https://endfieldtools.dev/localdb/optimized/i18n/combat/I18nTextTable_KR.json',
  EQUIPMENT:
    'https://endfieldtools.dev/localdb/optimized/i18n/equipment/I18nTextTable_KR.json',
};

export const KR_I18N_URL = I18N_URLS.CORE; // Backwards compatibility if needed

export const ELEMENT_MAP: Record<string, { name: string; iconSlug: string }> = {
  Physical: { name: 'Physical', iconSlug: 'physical' },
  Fire: { name: 'Heat', iconSlug: 'heat' },
  Cryst: { name: 'Cryo', iconSlug: 'cryo' },
  Natural: { name: 'Nature', iconSlug: 'nature' },
  Pulse: { name: 'Electric', iconSlug: 'electric' },
};

export const WEAPON_MAP: Record<string, string> = {
  SWORD: 'Sword',
  '1': 'Sword',
  'ARTS UNIT': 'Arts Unit',
  WAND: 'Arts Unit',
  '2': 'Arts Unit',
  GREATSWORD: 'Greatsword',
  CLAYMORES: 'Greatsword',
  '3': 'Greatsword',
  POLEARM: 'Polearm',
  LANCE: 'Polearm',
  '5': 'Polearm',
  HANDCANNON: 'Handcannon',
  PISTOL: 'Handcannon',
  '6': 'Handcannon',
};

// Inferred logic for constructing image URLs
export const getPortraitUrl = (charId: string) => {
  return `${BASE_ICON_URL}/${charId}.png`;
};

export const getSplashUrl = (charId: string) => {
  return `${BASE_SPLASH_URL}/${charId}.png`;
};

export const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};
