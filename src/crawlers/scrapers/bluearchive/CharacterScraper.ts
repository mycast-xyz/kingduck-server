import axios from 'axios';
import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { ImageDownloader } from '../../utils/ImageDownloader';
import { prisma } from '../../../utils/prisma';
import logger from '../../../utils/logger';

/**
 * 블루 아카이브(Blue Archive) 학생(캐릭터) 스크래퍼.
 *
 * 소스: SchaleDB 공개 JSON + 이미지 CDN (인증/렌더 불필요, 직접 axios).
 *   - 학생: https://schaledb.com/data/kr/students.min.json (한국어, 264명)
 *   - enum 한글명: https://schaledb.com/data/kr/localization.min.json
 *   - 이미지: https://schaledb.com/images/student/{collection|portrait|icon}/{Id}.webp
 *   - 필터 아이콘: 역할만 개별 아이콘 존재(images/ui/Role_{role}.png).
 *                  공격/방어 타입은 개별 아이콘이 없고 공용 Type_Attack/Type_Defense.png만 존재(실측).
 *
 * 4축 필터 매핑(니케 다축 패턴 참고):
 *   - BulletType(공격속성) → Element(type 'DamageType', elementId)  ← 카드/헤더 아이콘 = 공용 Type_Attack
 *   - ArmorType(방어속성)  → Element(type 'Path', pathId)          ← 카드/헤더 아이콘 = 공용 Type_Defense
 *   - TacticRole(역할)     → metadata.role + Character.role 컬럼(클라이언트 필터) ← 필터 아이콘 = game.attrIcons.role(개별)
 *   - School(학교)         → metadata.school(클라이언트 필터, 텍스트)
 *   공격/방어 아이콘은 metadata.elementIconUrl/pathIconUrl로 공급 → DataSyncService가 Element.iconUrl 적재.
 */

const DATA_BASE = 'https://schaledb.com/data/kr';
const IMG_BASE = 'https://schaledb.com/images/student';
const UI_ICON_BASE = 'https://schaledb.com/images/ui';
const GAME = 'bluearchive';

interface BAStudent {
  Id: number;
  Name: string;
  IsReleased: boolean[] | boolean;
  StarGrade: number;
  School: string;
  Club: string;
  SquadType: string;
  TacticRole: string;
  Position: string;
  BulletType: string;
  ArmorType: string;
  WeaponType: string;
  Skills?: Record<string, any>;
  AttackPower100?: number;
  MaxHP100?: number;
  DefensePower100?: number;
  HealPower100?: number;
  DodgePoint?: number;
  AccuracyPoint?: number;
  CriticalPoint?: number;
  StreetBattleAdaptation?: number;
  OutdoorBattleAdaptation?: number;
  IndoorBattleAdaptation?: number;
  Weapon?: { Name?: string } | null;
  Gear?: { Name?: string } | Record<string, never> | null;
  Equipment?: string[];
  FamilyName?: string;
  PersonalName?: string;
  SchoolYear?: string;
  CharacterAge?: string;
  Birthday?: string;
  CharacterVoice?: string;
  Illustrator?: string;
  Designer?: string;
  ProfileIntroduction?: string;
  Hobby?: string;
}

type LocMap = Record<string, Record<string, string>>;

// 스킬 키 → 한글 라벨(SchaleDB 표기 관행).
const SKILL_LABELS: [string, string][] = [
  ['Ex', 'EX 스킬'],
  ['Public', '노말 스킬'],
  ['Passive', '패시브 스킬'],
  ['ExtraPassive', '서브 스킬'],
];

export class BlueArchiveCharacterScraper extends ScraperBase {
  constructor() {
    super(GAME);
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const res = await axios.get(`${DATA_BASE}/${path}`, {
      timeout: 30000,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ko' },
    });
    return res.data as T;
  }

  /** SchaleDB가 미출시 학생을 [JP, Global, CN] 배열로 표기. JP(선행 서버, 한국 기준)로 출시 여부 판정. */
  private isReleased(s: BAStudent): boolean {
    if (Array.isArray(s.IsReleased)) return s.IsReleased[0] === true;
    return !!s.IsReleased;
  }

  /** loc 맵에서 한글명을 찾고, 없으면 원본 영문 키를 반환. */
  private ko(loc: LocMap, cat: string, key: string | undefined): string | null {
    if (!key) return null;
    return loc?.[cat]?.[key] ?? key;
  }

  /** Game 행이 없으면 생성(서버에서 bluearchive 크롤만 돌려도 Game 행 보장 — nte/wuwa 패턴). */
  private async ensureGame(): Promise<void> {
    const existing = await prisma.game.findUnique({ where: { slug: GAME } });
    if (!existing) {
      logger.info('Creating Game: bluearchive (블루 아카이브)');
      await prisma.game.create({
        data: { slug: GAME, name: '블루 아카이브', iconUrl: 'bluearchive.webp' },
      });
    }
  }

  /**
   * 역할(TacticRole) 필터 아이콘을 game.attrIcons.role 에 적재.
   * 공격/방어 타입은 개별 아이콘이 없어(실측) Element.iconUrl(공용)로만 공급한다.
   */
  private async syncRoleIcons(roles: string[]): Promise<void> {
    const game = await prisma.game.findUnique({ where: { slug: GAME } });
    if (!game) return;
    const roleIcons: Record<string, string> = {};
    for (const role of roles) {
      const rel = await ImageDownloader.downloadAndSave(
        `${UI_ICON_BASE}/Role_${role}.png`,
        GAME,
        'attr',
        `role_${role}`,
      );
      if (rel) roleIcons[role] = rel;
    }
    const attrIcons = {
      ...((game.attrIcons as Record<string, unknown>) || {}),
      role: roleIcons,
    };
    await prisma.game.update({ where: { id: game.id }, data: { attrIcons } });
    logger.info(
      `BA attrIcons.role updated (${Object.keys(roleIcons).length} role icons).`,
    );
  }

  /** BA 스킬 Desc의 <?n> 치환 + 잔여 태그 제거. */
  private buildSkills(skills: Record<string, any> | undefined): any[] {
    if (!skills) return [];
    const out: any[] = [];
    for (const [key, label] of SKILL_LABELS) {
      const sk = skills[key];
      if (!sk || !sk.Name) continue;
      let desc: string = sk.Desc || '';
      if (Array.isArray(sk.Parameters)) {
        desc = desc.replace(/<\?(\d+)>/g, (_m, n) => {
          const arr = sk.Parameters[Number(n) - 1];
          if (Array.isArray(arr)) return String(arr[arr.length - 1] ?? '');
          return String(arr ?? '');
        });
      }
      desc = desc
        .replace(/<[^>]*>/g, '')
        .replace(/\r/g, '')
        .trim();
      out.push({ name: sk.Name, type: label, description: desc, icon: '' });
    }
    return out;
  }

  async scrape(limit?: number): Promise<ScrapedData[]> {
    logger.info('Starting Blue Archive student scraping (SchaleDB)...');
    await this.ensureGame();

    const [studentsObj, loc] = await Promise.all([
      this.fetchJson<Record<string, BAStudent>>('students.min.json'),
      this.fetchJson<LocMap>('localization.min.json'),
    ]);

    let students = Object.values(studentsObj).filter((s) => this.isReleased(s));
    logger.info(
      `Found ${Object.keys(studentsObj).length} students, ${students.length} released.`,
    );
    if (limit && limit > 0) students = students.slice(0, limit);

    // 공용 공격/방어 타입 아이콘(개별 아이콘 부재 — 실측). 1회 다운로드해 전 학생 공유.
    const attackIcon = await ImageDownloader.downloadAndSave(
      `${UI_ICON_BASE}/Type_Attack.png`,
      GAME,
      'attr',
      'type_attack',
    );
    const defenseIcon = await ImageDownloader.downloadAndSave(
      `${UI_ICON_BASE}/Type_Defense.png`,
      GAME,
      'attr',
      'type_defense',
    );

    const results: ScrapedData[] = [];
    let errors = 0;
    const roleSet = new Set<string>();

    for (const s of students) {
      try {
        roleSet.add(s.TacticRole);

        // 카드/메인 이미지(collection). 실패해도 진행.
        const imageUrl =
          (await ImageDownloader.downloadAndSave(
            `${IMG_BASE}/collection/${s.Id}.webp`,
            GAME,
            'character',
            `char_${s.Id}`,
          )) || '';
        // 전신(portrait) — 상세용.
        const portraitUrl =
          (await ImageDownloader.downloadAndSave(
            `${IMG_BASE}/portrait/${s.Id}.webp`,
            GAME,
            'portrait',
            `portrait_${s.Id}`,
          )) || '';
        // 아이콘(작은 원형) — 폴백/아바타용.
        const iconUrl =
          (await ImageDownloader.downloadAndSave(
            `${IMG_BASE}/icon/${s.Id}.webp`,
            GAME,
            'avatar',
            `avatar_${s.Id}`,
          )) || '';

        const skills = this.buildSkills(s.Skills);
        const fullName = [s.FamilyName, s.PersonalName].filter(Boolean).join(' ');

        results.push({
          name: s.Name,
          sourceUrl: `https://schaledb.com/student/${s.Id}`,
          imageUrl,
          rarity: s.StarGrade,
          weaponType: s.WeaponType || null,
          role: s.TacticRole || null, // Character.role 컬럼 → 역할 클라이언트 필터(char.role)
          metadata: {
            originalId: String(s.Id),
            // 공격속성(DamageType Element)
            element: s.BulletType,
            elementIconUrl: attackIcon, // 공용 Type_Attack
            elementKo: this.ko(loc, 'BulletType', s.BulletType),
            // 방어속성(Path Element)
            path: s.ArmorType,
            pathIconUrl: defenseIcon, // 공용 Type_Defense
            pathKo: this.ko(loc, 'ArmorType', s.ArmorType),
            // 역할(클라이언트 필터 + attrIcons.role)
            role: s.TacticRole,
            roleKo: this.ko(loc, 'TacticRole', s.TacticRole),
            // 학교(클라이언트 필터, 텍스트)
            school: s.School,
            schoolKo: this.ko(loc, 'School', s.School),
            club: s.Club,
            clubKo: this.ko(loc, 'Club', s.Club),
            squadType: s.SquadType,
            squadTypeKo: this.ko(loc, 'SquadType', s.SquadType),
            position: s.Position || null,
            weaponType: s.WeaponType || null,
            // 프로필
            fullName: fullName || null,
            schoolYear: s.SchoolYear || null,
            age: s.CharacterAge || null,
            birthday: s.Birthday || null,
            cv: s.CharacterVoice || null,
            illustrator: s.Illustrator || null,
            hobby: s.Hobby || null,
            description: s.ProfileIntroduction || null,
            // 이미지
            cardImageUrl: imageUrl,
            portraitUrl,
            iconUrl,
            // 무기/고유장비
            weaponName: s.Weapon?.Name || null,
            gearName: (s.Gear && (s.Gear as { Name?: string }).Name) || null,
            equipment: Array.isArray(s.Equipment) ? s.Equipment : [],
            // 지형 적응(0~5) — 프론트가 D/C/B/A/S/SS 등급으로 표시
            terrain: {
              street: s.StreetBattleAdaptation ?? null,
              outdoor: s.OutdoorBattleAdaptation ?? null,
              indoor: s.IndoorBattleAdaptation ?? null,
            },
            // 기본 스탯(만렙)
            stats: {
              AttackPower: s.AttackPower100 ?? null,
              MaxHP: s.MaxHP100 ?? null,
              DefensePower: s.DefensePower100 ?? null,
              HealPower: s.HealPower100 ?? null,
              DodgePoint: s.DodgePoint ?? null,
              AccuracyPoint: s.AccuracyPoint ?? null,
              CriticalPoint: s.CriticalPoint ?? null,
            },
            skills,
          },
        });
      } catch (err) {
        errors++;
        logger.error(`Failed to scrape BA student ${s.Id} (${s.Name}):`, err);
      }
    }

    // 역할 필터 아이콘 적재(개별 존재).
    await this.syncRoleIcons([...roleSet]);

    if (results.length === 0 && errors > 0) {
      throw new Error(`All ${errors} BA student fetches failed (SchaleDB 장애 의심)`);
    }
    logger.info(
      `Blue Archive scrape done: ${results.length} ok / ${errors} failed`,
    );
    return results;
  }
}
