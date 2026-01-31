# 프로젝트 구조 (Project Structure)

KingDuck Server의 전체 디렉토리 구조와 주요 파일들에 대한 설명입니다.

## 📂 최상위 디렉토리 (Root Directory)

- **`bin/`**: 외부 바이너리 파일이 위치합니다. (예: `yt-dlp.exe`)
- **`dist/`**: 빌드된 결과물이 저장되는 폴더입니다.
- **`docs/`**: 프로젝트 관련 문서들이 모여 있습니다.
- **`prisma/`**: 데이터베이스 스키마(`schema.prisma`)와 마이그레이션 파일이 위치합니다.
- **`scripts/`**: 서버 관리 및 설정을 위한 유틸리티 스크립트들이 있습니다.
- **`src/`**: 서버의 핵심 소스 코드가 포함되어 있습니다.
- **`static/`**: 정적 파일(이미지, 동영상 등)이 저장되는 폴더입니다.
  - **`video/`**: 다운로드된 YouTube Shorts 동영상이 저장됩니다.

## 📂 src (Source Code)

핵심 비즈니스 로직이 구현된 디렉토리입니다.

### 🕷️ `src/crawlers/` (크롤러 & 스크래퍼)

게임 데이터를 수집하는 로직입니다.

- **`scheduler.ts`**: 크롤링 작업의 진입점입니다. 게임별/타입별 스크래퍼를 실행하고 조율합니다.
- **`core/`**: `ScraperBase.ts` 등 스크래퍼가 상속받는 기본 클래스가 있습니다.
- **`scrapers/`**: 게임별 스크래퍼 구체 구현체 폴더입니다.
  - **`wutheringwaves/`**: 명조: 워더링 웨이브 관련 스크래퍼 모음.
    - `CharacterScraper.ts`: 캐릭터 정보 수집.
    - `YoutubeShortsScraper.ts`: YouTube Shorts 수집 (검색어 기반 + 해시태그).
    - `ItemScraper.ts`, `EchoScraper.ts`, `WeaponScraper.ts`: 아이템 및 장비 수집.
  - **`starrail/`**, **`reverse1999/`**, **`endfield/`**: 타 게임 스크래퍼.
- **`services/`**: `DataSyncService.ts` - 수집된 데이터를 Prisma를 통해 DB에 저장/동기화하는 로직입니다.

### 🌐 `src/routes/` (API 라우트)

클라이언트 요청을 처리하는 API 엔드포인트입니다.

- 게임별(`v0/game/`), 캐릭터별(`v0/character/`) 라우트가 분리되어 있습니다.

### 🔧 `src/utils/` (유틸리티)

공통적으로 사용되는 헬퍼 함수들입니다.

- **`youtubeUtils.ts`**: `yt-dlp`를 사용하여 YouTube 동영상을 다운로드하는 핵심 로직입니다. 로컬 `bin/` 폴더를 우선 확인합니다.

---

## 📂 scripts (스크립트)

서버 운영을 돕는 자동화 스크립트입니다.

- **`setup_ytdlp.bat`**: (Windows용) `yt-dlp.exe`를 자동으로 다운로드하여 `bin/` 폴더에 설치합니다.
- **`download_ytdlp.ts`**: 위 배치 파일에서 호출하는 TypeScript 스크립트입니다.
- **`init_db.sh` / `init_db.bat`**: 데이터베이스 초기화 스크립트입니다.

## 📂 docs (문서)

- **`PROJECT_STRUCTURE.md`**: 현재 파일. 프로젝트 구조 설명.
- **`CRAWLER_GUIDE.md`**: 크롤러 작동 원리 및 가이드.
- **`YOUTUBE_DOWNLOADER_SETUP.md`**: YouTube 다운로더(`yt-dlp`) 설정 방법.
- **`API_ROUTES.md`**: API 명세서.
