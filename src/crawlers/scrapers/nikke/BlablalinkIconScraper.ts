import { ImageDownloader } from '../../utils/ImageDownloader';
import { prisma } from '../../../utils/prisma';
import logger from '../../../utils/logger';
import { crawlProgress } from '../../crawlProgress';

/**
 * 니케 속성 아이콘 스크래퍼 — blablalink(SHIFT UP 공식) 공개 정적 자산.
 *
 * blablalink는 Vite SPA라 필터/속성 아이콘이 DOM에 상시 렌더되지 않는다. 대신 SPA 번들의
 * 아이콘 URL 생성 규칙이 **결정론적**이라(아래 패턴) 렌더링 없이 URL을 직접 구성해 받는다.
 * 모든 URL은 `.../shiftysassets/images/` 하위 PNG이며, 존재하지 않는 파일은 200 + SPA index.html
 * (≈143KB)로 폴백되므로 실제 아이콘만(작은 PNG) 확정해 매핑했다.
 *
 * 번들에서 확인한 생성 규칙(2026-06-19, icon-XW3bYO3Z.js / shiftyspad-Dbiq4MKV.js):
 *   element(code):  `icon-code-${element.toLowerCase()}.png`        (Fire/Water/Wind/Iron/Electronic)
 *   weapon:         `icon-weapon-${WEAPON_FILE[weapon_type]}.png`   (AR=assault_rifle, SMG=sub_machine_gun, SG=shot_gun, MG=machine_gun, RL=rocket_launcher, SR=sniper_rifle)
 *   class(job):     `icon-job-${class.toLowerCase()}.png`           (Attacker/Defender/Supporter)
 *   corp:           `icon-manufacturer-${corp.toLowerCase()}--white.png` (ELYSION/MISSILIS/TETRA/PILGRIM/ABNORMAL)
 *   burst:          `icon-burst-${BURST_VALUE[use_burst_skill]}.png`     (Step1=1, Step2=2, Step3=3, AllStep=p)
 *
 * 저장/연결:
 *   - element/weapon: ImageDownloader로 받고 해당 Element 행(DamageType=element, Path=weapon)의 iconUrl을 update
 *     → 프론트 필터가 DB Element.iconUrl을 그대로 렌더(자동 반영).
 *   - class/corp/burst: Element 행이 아니므로 game.attrIcons(JSON 컬럼)에 { kind: { value: relPath } } 로 저장
 *     → getGameBySlug/character list가 game을 함께 반환하므로 프론트가 metadata 값으로 조회 가능.
 */
const ICON_BASE =
  'https://www.blablalink.com/assets/nikke/version/default/shiftysassets/images/';

// Element 행 이름(DB) → element-code 파일명. 주의: DB는 Electric, blablalink 속성값은 Electronic.
const ELEMENT_CODE: Record<string, string> = {
  Fire: 'fire',
  Water: 'water',
  Wind: 'wind',
  Iron: 'iron',
  Electric: 'electronic',
};
// Path 행 이름(DB, blablalink weapon_type와 동일) → weapon 파일명(snake_case).
const WEAPON_FILE: Record<string, string> = {
  AR: 'assault_rifle',
  SMG: 'sub_machine_gun',
  SG: 'shot_gun',
  MG: 'machine_gun',
  RL: 'rocket_launcher',
  SR: 'sniper_rifle',
};
// metadata.class 값 → job 파일명.
const CLASS_VALUES = ['Attacker', 'Defender', 'Supporter'];
// metadata.corp 값 → manufacturer 파일명.
const CORP_VALUES = ['ELYSION', 'MISSILIS', 'TETRA', 'PILGRIM', 'ABNORMAL'];
// metadata.burst 값 → icon-burst 접미.
const BURST_VALUE: Record<string, string> = {
  Step1: '1',
  Step2: '2',
  Step3: '3',
  AllStep: 'p',
};

export class BlablalinkIconScraper {
  /**
   * 니케 속성 아이콘을 전부 받아 로컬 저장하고 DB에 연결한다.
   * @returns 새로 저장/연결에 성공한 아이콘 개수.
   */
  async syncIcons(): Promise<number> {
    const game = await prisma.game.findUnique({ where: { slug: 'nikke' } });
    if (!game) throw new Error('Game not found: nikke');

    let saved = 0;
    const download = async (file: string, fileName: string): Promise<string | null> => {
      const rel = await ImageDownloader.downloadAndSave(
        ICON_BASE + file,
        'nikke',
        'attr',
        fileName,
      );
      if (rel) saved++;
      else logger.warn(`Nikke icon download failed: ${file}`);
      return rel;
    };

    // 1) element/weapon → 기존 Element 행의 iconUrl 갱신(DamageType=element, Path=weapon).
    const elements = await prisma.element.findMany({ where: { gameId: game.id } });
    let processed = 0;
    for (const el of elements) {
      if (crawlProgress.shouldStop()) break; // 사용자 중단 요청
      crawlProgress.report(processed, elements.length, el.name);
      processed++;
      let file: string | undefined;
      let fileName: string | undefined;
      if (el.type === 'DamageType' && ELEMENT_CODE[el.name]) {
        file = `icon-code-${ELEMENT_CODE[el.name]}.png`;
        fileName = `code_${el.name}`;
      } else if (el.type === 'Path' && WEAPON_FILE[el.name]) {
        file = `icon-weapon-${WEAPON_FILE[el.name]}.png`;
        fileName = `weapon_${el.name}`;
      }
      if (!file || !fileName) continue;
      const rel = await download(file, fileName);
      if (rel) {
        await prisma.element.update({ where: { id: el.id }, data: { iconUrl: rel } });
        logger.info(`Linked Element icon: [${el.type}] ${el.name} → ${rel}`);
      }
    }

    // 2) class/corp/burst → game.attrIcons(JSON) 맵 구축. 키는 metadata 값과 정확히 일치시킨다.
    const attrIcons: Record<string, Record<string, string>> = {
      class: {},
      corp: {},
      burst: {},
    };
    for (const v of CLASS_VALUES) {
      const rel = await download(`icon-job-${v.toLowerCase()}.png`, `class_${v}`);
      if (rel) attrIcons.class[v] = rel;
    }
    for (const v of CORP_VALUES) {
      const rel = await download(
        `icon-manufacturer-${v.toLowerCase()}--white.png`,
        `corp_${v}`,
      );
      if (rel) attrIcons.corp[v] = rel;
    }
    for (const [v, suffix] of Object.entries(BURST_VALUE)) {
      const rel = await download(`icon-burst-${suffix}.png`, `burst_${v}`);
      if (rel) attrIcons.burst[v] = rel;
    }

    await prisma.game.update({ where: { id: game.id }, data: { attrIcons } });
    logger.info(
      `Nikke attrIcons updated (class ${Object.keys(attrIcons.class).length}, ` +
        `corp ${Object.keys(attrIcons.corp).length}, burst ${Object.keys(attrIcons.burst).length}).`,
    );

    logger.info(`Nikke icon sync complete. Saved/linked ${saved} icons.`);
    return saved;
  }
}
