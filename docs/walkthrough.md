# 데이터베이스 구현 워크스루

게임 정보 사이트를 위한 범용 데이터베이스 스키마 설계 및 구현을 완료했습니다.

## 스키마 변경 사항

데이터베이스에는 이제 다음의 범용 테이블이 포함됩니다:

- **Game (게임)**: 범용 게임 정보 저장 (예: 원신, 스타레일).
- **Element (속성)**: 아이콘이 포함된 속성 정보 저장 (예: Pyro, Fire).
- **Character (캐릭터)**: 게임 및 속성과 연결되며, 범용 필드(무기 종류, 역할)와 특정 JSON 메타데이터를 가집니다.
- **Item (아이템)**: 게임과 연결되며, 무기, 성유물, 재료 등을 포괄합니다.

## 검증

### 1. 데이터베이스 마이그레이션

Prisma Migrate(`init_game_schema`)를 사용하여 로컬 PostgreSQL 데이터베이스에 스키마를 적용했습니다.

### 2. 데이터 초기화 (Cleanup)

초기 검증을 위해 생성했던 시드 데이터(Seed Data)와 관련 스크립트는 **사용자 요청에 따라 모두 삭제 및 초기화**되었습니다.
현재 데이터베이스는 스키마만 적용된 **빈 상태**입니다.

- `prisma/seed.ts` 삭제됨.
- 데이터베이스 리셋 완료 (`npx prisma migrate reset`).

## 3. 크롤러 목업 (Crawler Mockup)

자동 데이터 수집을 위한 기본 구조를 구현했습니다:

- **실행**: `npx ts-node src/crawlers/scheduler.ts`
- **구조**:
  - `src/crawlers/core/`: Browser, ScraperBase (공통 로직)
  - `src/crawlers/scrapers/genshin/`: 원신 캐릭터 수집 예시 (Mock Data 반환)
  - `src/crawlers/services/`: DB 동기화 로직 (현재는 로그만 출력)

## 다음 단계

이제 데이터를 Svelte 프론트엔드에 제공하기 위한 백엔드 API 엔드포인트(`express`) 구축을 시작할 수 있습니다.
