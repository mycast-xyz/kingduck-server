# 붕괴: 스타레일(Star Rail) 크롤링 상세 설계

**목표**: [Hakush.in](https://hsr20.hakush.in/) 사이트를 데이터 소스로 하여 캐릭터, 광추, 유물, 아이템 정보를 수집하고 **이미지를 로컬에 저장**합니다.

## 1. 대상 경로 및 데이터 매핑

게임 Slug: `starrail`

| 카테고리              | 대상 URL     | 매핑 테이블 (Prisma)       | 비고                                         |
| :-------------------- | :----------- | :------------------------- | :------------------------------------------- |
| **캐릭터**            | `/char`      | `Character`                | 이름, 운명의 길(Role), 속성(Element), 이미지 |
| **광추 (Light Cone)** | `/lightcone` | `Item` (type: "LightCone") | 이름, 운명의 길, 희귀도, 스탯, 이미지        |
| **유물 (Relic)**      | `/relicset`  | `Item` (type: "RelicSet")  | 세트 효과, 이미지                            |
| **배낭 (Item)**       | `/item`      | `Item` (type: "Material")  | 소비용품, 재료 등                            |

## 2. 폴더 및 파일 구조

`src/crawlers/scrapers/starrail/` 폴더 내에 기능별로 스크래퍼를 분리합니다.

```
src/crawlers/scrapers/starrail/
├── StarRailScraper.ts       # 메인 진입점 (모두 실행)
├── CharacterScraper.ts      # 캐릭터 수집 로직
├── LightConeScraper.ts      # 광추 수집 로직
├── RelicScraper.ts          # 유물 수집 로직
└── ItemScraper.ts           # 일반 아이템 수집 로직
```

## 3. 이미지 다운로드 및 관리 전략

사용자 요청에 따라 이미지는 `static/image/starrail` 폴더에 분류하여 저장합니다.

### 저장 경로 규칙 (`g:\GitHub\kingduck-server\static\image\starrail\...`)

- **캐릭터**: `static/image/starrail/character/{id}.png`
- **광추**: `static/image/starrail/lightcone/{id}.png`
- **유물**: `static/image/starrail/relic/{id}.png`
- **아이템**: `static/image/starrail/item/{id}.png`

### DB 저장 (URL)

서버에서는 `/assets` 경로로 서빙되므로, DB (`iconUrl`, `imageUrl`)에는 다음과 같이 저장합니다.

- 예: `http://localhost:3000/assets/image/starrail/character/1001.png`

### 공통 유틸리티 구현 (`ImageDownloader`)

- `src/crawlers/utils/ImageDownloader.ts`
- 역할: 원본 URL을 받아 로컬 경로에 다운로드하고, 웹 접근 가능한 URL 반환.
- 기능: 폴더 자동 생성, 중복 다운로드 방지(옵션).

## 4. 상세 구현 로직 (예: 캐릭터)

1.  **목록 접근**: `https://hsr20.hakush.in/char` 접속.
2.  **파싱**: 리스트에서 캐릭터 ID, 이름, 속성, 운명의 길 아이콘 등을 추출.
3.  **이미지 처리**:
    - 사이트의 이미지 URL(`https://hsr20.hakush.in/...`) 추출.
    - `ImageDownloader`를 통해 `static/image/starrail/character/`에 다운로드.
4.  **DB 동기화**:
    - `Element` 테이블 조회/생성 (예: Fire, Ice).
    - `Character` 테이블 Upsert.

## 5. 실행 흐름 (Scheduler)

```typescript
// scheduler.ts
const starRail = new StarRailScraper();
await starRail.scrapeAndSync(); // 내부적으로 Char, LightCone, Relic, Item 순차 실행
```

이 구조로 구현을 진행하시겠습니까?
