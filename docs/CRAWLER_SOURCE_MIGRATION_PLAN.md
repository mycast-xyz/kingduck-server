# 크롤러 데이터 소스 마이그레이션 기획안

작성일: 2026-06-16 · 대상: `src/crawlers` · 상태: **일부 착수**

> 2026-06-16 크롤링 전수 점검 중 발견한 **2건의 장애**에 대한 처리 기획안.
> 실제 크롤 실행으로 재현·검증한 결과를 바탕으로 한다.

## 진행 이력

- **2026-06-17 · 과제 2(endfield item type) 완료** (`61b517f`): `DataSyncService.ts`의 `itemType`을 `String(... ?? 'Unknown')`로 강제. 95건 sync 차단 해소.
- **2026-06-17 · 과제 1 동결(1.0-B) 완료**: `scheduler.ts`의 starrail character/item(LightCone)/relic/item(general) 4개 태스크에 `enabled:false`+`disabledReason` 부여. 스케줄러 루프·수동 실행(`CrawlerController.runCrawler` → 423) 모두 스킵, `getStatus`에 `enabled/disabledReason` 노출. 기존 DB(캐릭터 86 / 아이템 1740) 그대로 서빙, 에러·로그 스팸 중단. redeem/event/video는 유지.
  - 실측 재확인(2026-06-17): hakush `000`(연결 불가, 죽음 확정) · starrailstation `/kr/characters`·`/kr/equipment` 200 + `PAGE_CONFIG` 임베드 → 마이그레이션(A) 소스 생존.
  - **DB 백업 완료**: `backups/game_<timestamp>.dump` (pg_dump -Fc, native PG14@5432/`game`). `backups/` gitignore 추가.
- **2026-06-17 · 과제 1 마이그레이션(A) 완료** — starrailstation.com(PAGE_CONFIG) 단독 소스로 전환:
  - 공용 util `src/crawlers/utils/srsPageConfig.ts` (fetchPageConfig: 마커 탐색+중괄호 매칭 파싱, 실패 시 throw / srsAssetUrl / 한→영 속성·운명 매핑). 4개 스크래퍼 공유.
  - **CharacterScraper**: `/kr/characters`→`/kr/character/{pageId}`. 출력 metadata를 프론트 계약대로 재현(element/path는 **영문 키**로 역매핑 — 필터·elements 호환; skills/ranks_raw(Id·Desc·ParamList)/skill_tree/stats(인덱스 객체 HPBase..Cost)/eidolons/voiceLines/stories). SRS 미제공 추천필드(teams/lightcones/relics)는 **기존 metadata merge로 보존**.
  - **LightConeScraper**: `/kr/equipment`→`/kr/lightcone/{pageId}`. refinements/stats 재현, path 영문화.
  - **RelicScraper**: hakush 완전 제거, `/kr/relics`(+`/{id}`) 단독. 2pc/4pc·parts·이미지 SRS에서 직접.
  - **검증(실 크롤+sync)**: characters 92(기존 86+신규 6, 0 err) · LightCone 162(+6) · RelicSet 58(54 갱신+4 신규). originalId 매칭으로 중복 없음, elements 한국어 중복 0(필터 무결), 기존 캐릭터 teams 보존 확인. `tsc --noEmit` 0.
  - **동결 현황**: 일반 item(Material/Usable/Mission/Virtual ≈1530)만 동결 유지(SRS 독립 재료 소스 없음 — 사용자 결정). 기존 DB 데이터 그대로 서빙.

---

## 0. 배경 — 점검 결과 요약

`pnpm run crawl --game <game>`로 전 게임 실 크롤을 돌려 확인한 상태:

| 게임 | 태스크 | 상태 | 비고 |
|------|--------|------|------|
| starrail | character / item(LightCone) / relic / item | 🔴 **전멸** | `api.hakush.in` 도메인 사망 |
| starrail | redeem / video | ✅ | arca.live / YouTube 정상(11건 sync) |
| starrail | event | ⚠️ | 0건(빈 결과 삼킴 의심, B-H6) |
| reverse1999 | character | ✅ | 128건, 일부 이미지 404 |
| wutheringwaves | character/weapon/echo/item | ✅(데이터) | encore.moe **에셋 다수 404**(이미지 누락) |
| endfield | character/weapon/equipment | ✅ | 29/71/22, warfarin.wiki 스플래시 DNS 불안정 |
| endfield | item | 🔴 **sync 실패** | `type` Int→String Prisma 검증 오류, 95건 전부 |

**크롤러 인프라(DB·Puppeteer·sync·timeout·browser finally)는 정상.** 문제는 ① 외부 데이터 소스
사망과 ② sync 코드 버그 2가지. 본 기획안은 이 둘을 다룬다.

---

## 과제 1 — starrail: `api.hakush.in` → `starrailstation.com` 소스 교체

### 1.0 전략 선택 — 즉시 동결(롤백) vs 마이그레이션

> "지금 데이터 구조에서 롤백이 더 안정적인가?" 에 대한 검토.

**전제 확인**: starrail CharacterScraper는 **생성 시점부터 hakush만** 사용해 왔다(git `-S hakush.in` 이력상
최초 커밋이 곧 hakush 도입). 즉 **되돌릴 "이전 안정 소스"는 코드에 존재하지 않는다** — 죽은 것은 코드가
아니라 외부 소스다. 따라서 "코드 롤백"은 해결책이 아니다.

단, **이미 크롤된 데이터가 DB에 남아 있다**(2026-06-16 실측):

| game | characters | items |
|------|-----------|-------|
| starrail | **86** | **1740** |
| wutheringwaves | 54 | 2254 |
| reverse1999 | 88 | 0 |
| endfield | 25 | 188 |

→ starrail은 캐릭터 86 + 아이템 1740이 이미 적재돼 있어 **"동결(freeze)" 전략이 유효**하다.

| 옵션 | 내용 | 장점 | 단점 |
|------|------|------|------|
| **A. 마이그레이션** | hakush → starrailstation HTML(PAGE_CONFIG) 스크래핑으로 교체 | 신규 캐릭터·최신 데이터 갱신 재개 | SRS HTML 구조 변경에 취약(유지보수 부담), 작업량 큼 |
| **B. 동결(freeze)** | 죽은 hakush 태스크를 **비활성/스킵** 처리하고 기존 DB 데이터를 그대로 서빙 | 즉시 안정·무위험, 프래자일 스크래퍼 없음 | 데이터 정지(신규 캐릭터 미반영). redeem/event/video는 계속 정상 갱신 |

**권장: B를 먼저, 그다음 A.**
1. **단기(즉시)**: 죽은 starrail character/item/relic 태스크를 **동결** — 크롤 시 에러·로그 스팸을 멈추고
   기존 86/1740 데이터를 안정적으로 유지. (구현: `scheduler.ts`의 해당 태스크에 `enabled:false` 플래그 또는
   주석 처리 + 사유 주석. redeem/video는 유지.)
2. **중기(여유 시)**: 검증된 starrailstation 소스로 **마이그레이션**(1.1~1.7)을 신중히 진행해 갱신 재개.

→ 사용자 직감대로 **단기 안정성은 동결이 우위**. 마이그레이션은 "정지된 데이터를 다시 흐르게 하는" 별도 과제로 분리.

### 1.1 문제

`api.hakush.in`이 **도메인째로 소실**(2026-06-16, Google DNS 8.8.8.8로도 `Non-existent domain`).
base/`api.` 모두 해석 불가. 일시 장애가 아니라 사이트가 내려간 것으로 판단.

영향 스크래퍼(4종, 전부 hakush를 1차 데이터 소스로 사용):

| 파일 | hakush 의존 |
|------|-------------|
| `scrapers/starrail/CharacterScraper.ts` | `LIST_API_URL`, `DETAIL_API_BASE`, UI 이미지 |
| `scrapers/starrail/LightConeScraper.ts` | (동형) |
| `scrapers/starrail/RelicScraper.ts` | `LIST_API_URL`, `DETAIL_API_BASE` (SRS는 이미 이미지·로어 보강용으로 병용 중) |
| `scrapers/starrail/ItemScraper.ts` | 일반 재료/아이템 |

### 1.2 교체 소스: starrailstation.com (한국어판)

각 페이지 HTML에 `window.PAGE_CONFIG = {...}` 형태로 데이터 JSON이 임베드되어 있다.
**`RelicScraper.fetchSRSMapping()`에 이미 PAGE_CONFIG 추출 로직이 존재** → 이를 공용화해 재사용한다.

확인된 URL 패턴(2026-06-16 실측, 전부 HTTP 200):

| 데이터 | URL | 비고 |
|--------|-----|------|
| 캐릭터 목록 | `https://starrailstation.com/kr/characters` | `entries` 92건 |
| 캐릭터 상세 | `https://starrailstation.com/kr/character/{pageId}` | 단수 `character`, `pageId`는 목록 entry의 필드 |
| 광추(LightCone) 목록 | `https://starrailstation.com/kr/equipment` | `entries` 162건 |
| 유물 목록/상세 | `https://starrailstation.com/kr/relics` , `/kr/relics/{id}` | RelicScraper가 이미 사용 |
| 이미지 CDN | `https://cdn.starrailstation.com/assets/{iconPath}.webp` | iconPath는 해시 문자열 |

### 1.3 데이터 커버리지 (hakush 대비 동등 이상)

**캐릭터 목록 entry** 필드:
`name, rankKey(게임 내 ID), rarity, iconPath, damageType{name=속성}, baseType{name=운명}, damageTypeId, baseTypeId, pageId`

**캐릭터 상세** PAGE_CONFIG 필드(발췌):
`name, rarity, descHash(설명), damageType, baseType, skills[9], ranks[6]=성혼, skillTreePoints[4]=행적,`
`skillGrouping, relicRecommend, levelData, calculator(재료/경험치), itemReferences(재료 ID), voiceItems,`
`storyItems, archive(성우), skins, iconPath/bgPath/figPath/splashIconPath/artPath/miniIconPath(이미지)`

→ hakush가 주던 **이름·등급·속성·운명·스킬·성혼·행적·재료·이미지를 전부 커버**(오히려 더 풍부).

### 1.4 필드 매핑 (hakush → SRS)

| DB/sync 필드 | hakush | starrailstation |
|--------------|--------|-----------------|
| name | `detail.Name` | `entry.name` / `detail.name` |
| rarity | `detail.Rarity`("Type5"→5) | `entry.rarity`(이미 숫자) |
| element(속성) | hakush DamageType | `damageType.name` |
| path(운명) | hakush BaseType | `baseType.name` |
| originalId | hakush id | `rankKey`(숫자 ID) 또는 `pageId` |
| 아이콘/카드 | `api.hakush.in/.../{id}.webp` | `cdn.starrailstation.com/assets/{iconPath}.webp` |
| 스킬/성혼/행적 | hakush detail | `skills` / `ranks` / `skillTreePoints` |
| 재료 | hakush material | `itemReferences` + `calculator` |

### 1.5 작업 항목

1. **공용 util 추출**: `RelicScraper`의 PAGE_CONFIG 추출 로직 → `crawlers/utils/srsPageConfig.ts`
   (`fetchPageConfig(url): Promise<any>` — UA 헤더 + marker 탐색 + 중괄호 매칭 파싱). 4개 스크래퍼 공유.
2. **CharacterScraper**: `/kr/characters` 목록 → 각 `pageId` 상세 → 1.4 매핑 → 기존 `DataSyncService.syncCharacters` 계약 유지.
3. **LightConeScraper**: `/kr/equipment` 목록 → 상세 → `syncItems`(type='Lightcone').
4. **RelicScraper**: `LIST_API_URL`/`DETAIL_API_BASE`(hakush) 제거 → SRS PAGE_CONFIG가 세트/파츠/세트보너스를
   단독 제공하는지 확인 후 hakush 의존 완전 제거. (현재는 hakush=구조, SRS=이미지 병용)
5. **ItemScraper(일반 재료)**: ⚠️ **SRS에 독립 "재료 목록" 페이지 없음**. 후보:
   (a) 캐릭터/광추 상세의 `itemReferences`로 역참조 수집, (b) 다른 소스(예: 다른 위키), (c) 보류.
   → **별도 결정 필요**(아래 6. 미결 사항).
6. **방어 코드**(B-H6 연계): PAGE_CONFIG marker 미발견/파싱 실패 시 빈 배열 대신 명시적 실패로 기록,
   부분 성공은 `PARTIAL`로. silent 0건 방지.

### 1.6 리스크

- **HTML 구조 의존**: `window.PAGE_CONFIG`가 SRS 측 변경에 취약 → marker 방어 + 실패 표면화 필수.
- **이름 매칭**: RelicScraper처럼 공백 제거 정규화로 매칭하는 부분이 있으면 신규 캐릭터 누락 위험.
  SRS 단독 전환 시 `pageId`/`rankKey` 키 기반으로 매칭해 회피.
- **일반 item 소스 공백**(1.5-5): 미해결 시 starrail 재료 데이터는 갱신 불가로 남음.
- **rate limit / 차단**: 캐릭터 92 + 광추 162 상세를 순차 요청 → 기존 `timeout:15000` 유지, 필요 시 지연/재시도.

### 1.7 공수(러프)

- 공용 util 추출: 소 · Character: 중 · LightCone: 중 · Relic(hakush 제거): 소~중 · Item: 미정.

---

## 과제 2 — endfield item sync 버그 (즉시 수정 가능)

### 2.1 문제

`DataSyncService.syncItems`가 endfield 아이템 95건 **전부 sync 실패**:

```
PrismaClientValidationError @ DataSyncService.ts:178
Argument `type`: Invalid value provided. Expected String ..., provided Int.   (type: 8)
```

- `prisma/schema.prisma` `Item.type`은 **String**.
- endfield 아이템의 `metadata.type`은 **숫자**(예: 8).
- `DataSyncService.ts:175` `const itemType = dataItem.metadata?.type || 'Unknown';`
  → 숫자 8은 truthy라 `itemType = 8`(number) → String 컬럼에 Int 주입 → 검증 실패.

### 2.2 수정

`src/crawlers/services/DataSyncService.ts:175`:

```ts
// before
const itemType = dataItem.metadata?.type || 'Unknown';
// after — String 강제 + 0도 'Unknown'으로 오인하지 않도록 ?? 사용
const itemType = String(dataItem.metadata?.type ?? 'Unknown');
```

- 효과: endfield(숫자 type) 즉시 sync 가능. 기존 문자열 type 게임은 동작 동일.
- (선택) 후속: endfield 숫자 type → 의미 라벨('Material' 등) 매핑 테이블. 현재는 `"8"` 문자열로 저장.

### 2.3 공수: 소 (1줄 + 단일 게임 재크롤 검증).

---

## 과제 3 — 신규 게임 추가: 원신 / 이환

신규 게임 1종 추가는 **백엔드(데이터 소스 + 스크래퍼 + 동기화) + 프론트(게임 Init + slug 등록)** 양쪽 작업이다.
프론트 추가 절차는 `kingduck`(프론트) `doc/ARCHITECTURE.md`의 "새 게임 추가" 참고: `model/game/<Game>Init.ts`
신규 + 라우트 `+page.ts`들의 slug switch 등록.

### 3.0 현황 (실측)

| 항목 | 원신(genshin) | 이환 |
|------|---------------|------|
| DB Game 레코드 | **있음**(slug=`genshin`, name=원신), 데이터 0건 | **없음** (DB 미등록) |
| 백엔드 스크래퍼 | `scrapers/genshin/character.ts` 존재하나 **순수 목 스텁**(Amber/Kaeya 하드코딩) | 없음 |
| 스케줄러 태스크 | `scheduler.ts`에 **주석 처리**된 상태 | 없음 |
| 프론트 `<Game>Init.ts` | **없음**(GenshinInit 부재) | 없음 |
| 데이터 소스 | hakush(gi) 사망 → 대체 필요 | 미정(신생 게임, 소스 조사 필요) |

### 3.1 원신 (Genshin Impact)

상대적으로 수월 — DB 레코드가 이미 있고, 원신은 성숙한 공개 데이터 API가 존재.

- **데이터 소스 후보**(hakush 대체):
  - **Ambr — `https://gi.yatta.moe/api/v2/{lang}/...`** ← 권장. 원신판 hakush에 해당하는 안정적 JSON API
    (캐릭터·무기·성유물·재료 망라, 한국어 지원). 구조화 JSON이라 SRS HTML 스크래핑보다 견고.
    (2026-06-16 실측: `gi.yatta.moe/api/v2/kr/avatar` **HTTP 200** ✅ / `api.ambr.top`은 이 네트워크에서 실패 →
    **`gi.yatta.moe` 미러 사용 권장**.)
  - 대안: Enka.Network, namuwiki(스텁에 주석된 방식, 파싱 취약).
- **백엔드 작업**: `genshin/CharacterScraper`(목 → 실제), `WeaponScraper`, `ArtifactScraper`(성유물),
  `ItemScraper`(재료) 신규 + `scheduler.ts` 태스크 등록(주석 해제/추가). `DataSyncService` 계약 재사용.
- **프론트 작업**: `model/game/GenshinInit.ts` 신규(필터: 속성 7원소 / 무기타입 / ★ / 지역), slug `genshin`
  을 `list`·`tier-list`·`content` 라우트 `+page.ts` switch에 등록.
- **공수**: 중(소스 안정적이라 스크래퍼 자체는 정형화 가능).

### 3.2 이환

신생 게임 — **불확실성 높음**. 선행 조사가 필요.

- **선행 과제**:
  - 정식 명칭/영문 slug 확정(예: `???`), DB `Game` 레코드 seed.
  - **데이터 소스 조사**: 출시 초기 게임은 hakush/ambr급 정형 API가 없을 수 있음 → 공식 사이트/위키
    (namuwiki 등) HTML 스크래핑이 현실적일 수 있으나 취약. 소스 확정이 1차 관문.
- **백엔드**: 소스 확정 후 스크래퍼 신규(character 우선), 스케줄러 등록.
- **프론트**: `model/game/이환Init.ts` 신규(해당 게임 도메인에 맞는 필터/레이아웃 설계), slug 등록.
- **공수**: 중~대(소스 가용성에 좌우). 소스 미확정 시 **조사 단계부터** 시작.

> 두 게임 모두 **데이터 소스 확정이 선결**이다. 원신은 Ambr로 사실상 해결, 이환은 조사 필요.

---

## 진행 순서 제안

**즉시(안정화·저위험)**
1. **과제 2** — endfield item 1줄 수정. `--game endfield --type item` 재크롤로 95건 sync 확인.
2. **과제 1 동결(1.0-B)** — starrail character/item/relic 죽은 태스크 비활성. 크롤 에러·로그 스팸 중단,
   기존 86/1740 데이터 유지. redeem/video는 그대로.

**중기(데이터 갱신 재개)**
3. **공용 PAGE_CONFIG util** 추출(1.5-1).
4. starrail **CharacterScraper** 마이그레이션 → `--game starrail --type character` 검증 → **LightCone** → **Relic**.
5. **일반 item 소스** 결정(아래 미결).

**신규 게임(별 트랙)**
6. **원신**: Ambr 소스로 스크래퍼 구현 + GenshinInit + slug 등록.
7. **이환**: 데이터 소스 조사부터.

> 각 단계는 독립적으로 머지 가능. 1·2를 먼저 넣어 "안 되는 상태"를 멈춘 뒤, 3~7은 여유에 따라.

---

## 미결 사항 (결정 필요)

- [ ] **starrail 단기 전략**: 동결(B) 후 마이그레이션(A) — 본 기획 권장안 승인?
- [ ] starrail **일반 재료(item)** 데이터 소스: `itemReferences` 역참조 vs 대체 소스 vs 보류?
- [ ] endfield item **숫자 type → 라벨 매핑** 도입 여부(지금은 `String()`만).
- [ ] **이환** 정식 명칭/slug 확정 + 데이터 소스 조사(선결).
- [ ] 부수 발견(범위 외, 별건): wuthering encore.moe 에셋 404, reverse1999/endfield 이미지 일부 404·DNS,
      starrail event 0건(B-H6) — 데이터 자체는 동작하므로 본 기획안에서는 제외.
