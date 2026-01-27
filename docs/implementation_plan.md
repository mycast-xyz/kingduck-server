# 구현 계획 - 게임 API (Backend)

`src/routes/index.ts`에 정의되어 있지만 실제로는 존재하지 않는 `game`, `character`, `item` 관련 API 엔드포인트와 로직을 구현합니다.

## 사용자 검토 필요

없음. 기존 아키텍처(Controller-Service-Router 패턴)를 따릅니다.

## 변경 제안

### 1. Prisma Client 인스턴스 설정

`src/utils/prisma.ts` (또는 유사 경로)를 생성하여 Prisma Client 인스턴스를 싱글톤으로 관리하고, Prisma 7 설정(`@prisma/adapter-pg`)을 적용합니다.

### 2. API 구조 구현

각 기능(Game, Character, Item)별로 `routes`, `controller`, `service`를 구현합니다.

#### [NEW] `src/routes/game/`

- `router.ts`: 라우트 정의 (`/list`, `/:slug`)
- `controller.ts`: 요청/응답 처리
- `service.ts`: Prisma를 사용한 비즈니스 로직

#### [NEW] `src/routes/character/`

- 캐릭터 목록 조회 및 상세 조회 구현

#### [NEW] `src/routes/item/`

- 아이템 목록 조회 구현

### 3. 기존 코드 수정

- `src/routes/index.ts`: 주석 처리되어 있거나 에러가 발생하는 import 문들이 정상 작동하도록 연결.

## 검증 계획

### 자동화/수동 테스트

- `pnpm run dev`로 서버 실행.
- `curl` 또는 브라우저를 통해 다음 엔드포인트 호출 테스트:
  - `http://localhost:3000/api/v0/game/list` -> 게임 목록(JSON) 반환 확인.
  - `http://localhost:3000/api/v0/game/genshin` -> 원신 상세 정보 및 속성(Element) 포함 확인.
