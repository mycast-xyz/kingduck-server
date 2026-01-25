# Star Rail 유물 데이터 DB 저장 설계 (Item 테이블)

수집된 유물 세트 데이터를 현재 DB 스키마(`Item` 테이블)에 가장 효율적으로 저장하기 위한 설계 방안입니다.

## 1. 개요

유물 데이터는 **세트(Set)** 정보와 **개별 파츠(Piece)** 정보가 결합된 형태입니다. 현재의 `Item` 테이블 구조를 유지하면서 모든 상세 데이터를 유실 없이 저장하기 위해 `metadata` JSON 필드를 적극적으로 활용합니다.

## 2. 테이블 필드 매핑 세부 사항

| 필드명          | 매핑 데이터 (`relic_sample.json`) | 설명                                                               |
| :-------------- | :-------------------------------- | :----------------------------------------------------------------- |
| **gameId**      | Star Rail 게임의 고유 ID          | `slug: "starrail"`인 게임의 DB ID                                  |
| **name**        | `name`                            | 유물 세트 이름 (예: "흔적을 남기지 않은 과객")                     |
| **type**        | `"RelicSet"`                      | 유물 세트임을 나타내는 식별자                                      |
| **rarity**      | `5` (고정 또는 수집 데이터 기반)  | 기본적으로 5성 기준으로 저장                                       |
| **description** | 2/4세트 효과 요약                 | 예: "[2세트] 치유량 증가\n[4세트] 스킬 포인트 회복"                |
| **imageUrl**    | `imageUrl`                        | 세트 대표 아이콘 로컬 경로 (`assets/image/starrail/relic-set/...`) |
| **metadata**    | 상세 JSON 데이터                  | 하단 3번 항목 참조                                                 |

## 3. Metadata 구조 설계 (JSON)

유동적인 데이터 처리를 위해 `metadata` 필드에 다음과 같은 구조로 저장합니다.

```json
{
  "originalId": "101",          // 외부 API 원본 ID
  "source": "Hakush.in + SRS",  // 데이터 출처
  "setBonuses": {
    "2pc": {
      "desc": "치유량 #1[i]% 증가",
      "params": [0.1]
    },
    "4pc": {
      "desc": "전투 시작 시...",
      "params": []
    }
  },
  "parts": {
    "31011": {
      "name": "과객의 봄맞이 나무 비녀",
      "iconUrl": "assets/image/starrail/relic-piece/31011.webp",
      "desc": "...(Lore 내용)...",
      "story": "과객의 봄맞이 나무 비녀",
      "rarityData": { ... }      // 희귀도별 주옵/부옵 수치 데이터
    },
    // ... 나머지 파츠들
  }
}
```

## 4. 데이터 저장 전략 (Implementation)

### [UPSERT 정책]

`originalId`를 기준으로 기존 데이터가 있으면 **Update**, 없으면 **Create**를 수행합니다.
Prisma의 `Item` 테이블에 유니크 제약 조건이 부족할 경우, `metadata->>'originalId'`와 `gameId` 조합으로 존재 여부를 먼저 확인합니다.

### [데이터 정제]

- `desc` 내의 `<nobr>`, `<br />` 등 HTML 태그를 프론트엔드에서 처리하기 쉽게 유지하거나 일부 제거하여 저장합니다.
- `imageUrl`과 각 파츠의 `iconUrl`은 반드시 로컬 서버 경로로 저장되어야 합니다.

## 5. 기대 효과

- **유연성**: 추후 다른 게임(원신, 젠존제로)의 성유물/디스크 데이터를 저장할 때도 동일한 `RelicSet` 타입을 사용하여 일관성을 유지할 수 있습니다.
- **풍부한 정보**: 단순 텍스트가 아닌 `ParamList`와 `rarityData`를 포함함으로써, 향후 데미지 계산기나 유물 강화 시뮬레이터 등의 기능을 구현할 수 있는 기반이 됩니다.
