# 붕괴: 스타레일 캐릭터 데이터 매핑 (Star Rail Character Data Mapping)

`starrail_character_sample.json` (Hakush API) 데이터를 기반으로, 우리 DB(`Character` 모델)에 저장할 선별된 필드 구조입니다.

## 1. 기본 필드 (`Character` Table)

`Character` 테이블의 컬럼에 직접 매핑되는 핵심 정보입니다.

| 우리 DB 필드  | Hakush JSON 필드 | 변환 로직 / 예시                                       |
| :------------ | :--------------- | :----------------------------------------------------- |
| `name`        | `Name`           | 그대로 사용 ("Mar. 7th")                               |
| `rarity`      | `Rarity`         | `CombatPowerAvatarRarityType4` -> `4`                  |
| `pathId`      | `BaseType`       | Element 테이블 조회/연결 (type="Path", 아래 매핑 참조) |
| `elementId`   | `DamageType`     | Element 테이블 조회/연결 (type="DamageType", "Ice")    |
| `imageUrl`    | (Derived)        | `static/image/starrail/character/icon_{id}.webp`       |
| `description` | `Desc`           | 간단한 소개글                                          |

### 운명의 길 (BaseType) 매핑 테이블

**Element 테이블에 type="Path"로 저장됩니다.**

| Internal (JSON) | Display (KR) | English      |
| :-------------- | :----------- | :----------- |
| `Warrior`       | 파멸         | Destruction  |
| `Rogue`         | 수렵         | Hunt         |
| `Mage`          | 지식         | Erudition    |
| `Shaman`        | 화합         | Harmony      |
| `Warlock`       | 공허         | Nihility     |
| `Knight`        | 보존         | Preservation |
| `Priest`        | 풍요         | Abundance    |

## 2. 메타데이터 (`Character.metadata` JSON)

`metadata` 컬럼에 JSON 객체로 저장할 상세 정보입니다. 화면에 표시할 필수 정보 위주로 선별했습니다.

```jsonc
{
  "originalId": "1001",           // Hakush ID
  "cardImageUrl": "path/to/img",  // 전신 일러스트 경로
  "spNeed": 120,                  // 필살기 에너지 요구량 (SPNeed)

  // 스킬 정보 (Skills)
  // 평타, 전투스킬, 필살기, 특성, 비술 등을 리스트로 저장
  "skills": [
    {
      "id": "100101",
      "type": "Normal",           // Normal, BPSkill, Ultra, Talent, Maze(비술)
      "name": "극저온의 화살",
      "desc": "지정된 단일 적에게...",
      "simpleDesc": "단일 적에게 소량의 얼음 속성 피해...",
      "tag": "SingleAttack",
      "icon": "path/to/icon",     // https://api.hakush.in/hsr/UI/skillicons/{IconFilename}.webp
                                  // (Filename from SkillTrees, replace .png with .webp)
      "params": [0.5, 0.6, ...]
    }
  ],

  // 성혼 (Eidolons/Ranks)
  "eidolons": [
    {
      "rank": 1,
      "name": "기억 속 그대",
      "desc": "필살기로 목표를 1기 빙결할 때마다...",
      "icon": "path/to/icon"      // https://api.hakush.in/hsr/UI/rank/_dependencies/textures/{id}/{id}_Rank_{rank}.webp
                                  // -> static/image/starrail/character/rank_{id}_{rank}.webp
    }
    // ... 1~6 돌파
  ],

  // 행적 (SkillTrees/Traces)
  // 스킬 강화 및 스탯 증가 트리 정보
  "skillTrees": [
    {
      "pointId": "1001001",
      "anchor": "Point01",        // 트리 상의 위치 (Point01~Point18)
      "skillId": "100101",        // 연결된 스킬 ID (LevelUpSkillID)
      "maxLevel": 6,              // 최대 레벨
      "icon": "path/to/icon",     // 스킬 아이콘 (Skills와 동일)
      "unlockLevel": 2,           // 해금 필요 돌파 단계 (AvatarPromotionLimit)
      "materials": [              // 강화 재료 (MaterialList)
        { "itemId": 2, "count": 4000 },
        { "itemId": 110141, "count": 2 }
      ],
      "statBonus": [              // 스탯 보너스 (StatusAddList)
        { "type": "HPDelta", "value": 52.8 }
      ]
    }
    // ... 모든 트리 노드
  ]
}
```

## 3. 제외할 데이터 (DB 용량 절약)

- `CharaInfo.Voicelines`: 음성 대사 텍스트 (양이 많음)
- `CharaInfo.VA`: 성우 정보 (필요하면 `metadata.va`로 간단히 저장)
- `Skill.Level`: 모든 레벨별 상세 수치 (계수 배열 `params`만 남기고 구조 단순화)
