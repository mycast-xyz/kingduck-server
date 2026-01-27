# 크롤러 가이드 (Crawler Guide)

크롤러 시스템은 외부 소스로부터 게임 데이터(캐릭터, 무기, 동영상)를 수집합니다.

## 아키텍처 (Architecture)

### 1. 스케줄러 (`src/crawlers/scheduler.ts`)

메인 진입점(Entry Point)입니다. 여러 스크래퍼(Scraper)의 실행을 조율합니다.

- **실행 명령어**: `pnpm run crawl`

### 2. 캐릭터 스크래퍼 (`WutheringWavesCharacterScraper`)

**경로**: `src/crawlers/scrapers/wutheringwaves/CharacterScraper.ts`

**기능**:

- **통합 아키텍처**: 스크래퍼(Scraper)와 저장소(Saver) 로직이 하나의 클래스로 통합되어 있습니다.
- **수집 (Scrape)**: API에서 캐릭터 목록 및 상세 정보를 가져옵니다.
- **변환 (Transform)**: API 필드를 데이터베이스 스키마(`imageUrl`, `elementId` 등)에 맞게 매핑합니다.
- **DB 동기화 (DB Sync)**: `Games`, `Elements`, `Weapons` 테이블을 확인하고 없으면 자동 생성하여 외래 키(Foreign Key) ID를 연결합니다.
- **저장 (Save)**:
  - 중복 검사 (`gameId` + `name` + `elementId` ...).
  - **신규**: 새로운 레코드를 생성(Insert).
  - **중복**: 기존에 수동으로 수정한 데이터를 보호하기 위해 `metadata.Skins` 필드만 업데이트.

### 3. 동영상 스크래퍼 (YouTube)

**경로**: `src/crawlers/scrapers/starrail/YoutubeShortsScraper.ts`

**기능**:

- `src/utils/youtubeUtils.ts`를 사용합니다.
- **시스템 yt-dlp 사용**: 안정성을 위해 시스템에 설치된 `yt-dlp` 바이너리를 직접 래핑(Wrapping)하여 사용합니다.
- Shorts 및 동영상을 `static/video` 폴더에 다운로드합니다.

## 문제 해결 (Troubleshooting)

### 동영상 다운로드 실패

만약 `yt-dlp` 관련 에러가 발생한다면:

1. `yt-dlp`가 설치되어 있는지 확인하세요: `brew install yt-dlp` 또는 `scripts/init_ubuntu.sh` 실행.
2. 서버에서 YouTube 로의 네트워크 연결 상태를 확인하세요.
