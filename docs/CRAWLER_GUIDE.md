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

- **경로**: `src/crawlers/scrapers/wutheringwaves/YoutubeShortsScraper.ts`
- **기능**:
  - 공식 채널(`@WW_KR_Official`)에서 Shorts 동영상을 수집합니다.
  - **키워드 매칭**: "공명자 화면", "공명자 모먼트" 등의 키워드가 포함된 영상을 필터링합니다.
  - **캐릭터 매칭**: 제목/설명의 해시태그와 DB의 캐릭터 이름을 대조하여 연결합니다.
  - `src/utils/youtubeUtils.ts`를 통해 `yt-dlp`로 동영상을 다운로드합니다.

### 4. 동영상 다운로드 설정 (Video Download Setup)

`yt-dlp`는 동영상을 다운로드하기 위해 필수적입니다. 운영체제에 맞는 설정이 필요합니다.

#### 🪟 Windows

- **자동 설치**: `scripts/setup_ytdlp.bat` 실행.
- **상세 가이드**: [`docs/YOUTUBE_DOWNLOADER_SETUP.md`](YOUTUBE_DOWNLOADER_SETUP.md) 참조.

#### 🐧 Linux (Ubuntu) / 🍎 macOS

- **스크립트 설치**: `scripts/init_ubuntu.sh`를 실행하면 자동으로 설치됩니다.
- **수동 설치**:
  - **Ubuntu**: `sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && sudo chmod a+rx /usr/local/bin/yt-dlp`
  - **macOS**: `brew install yt-dlp`

## 문제 해결 (Troubleshooting)

### 동영상 다운로드 실패

만약 `spawn yt-dlp ENOENT` 에러가 발생한다면:

1. **Windows**: `scripts/setup_ytdlp.bat`을 실행하여 `bin/yt-dlp.exe`를 설치하세요.
2. **Linux/Mac**: `yt-dlp`가 설치되어 있는지 확인하세요 (`yt-dlp --version`). 없으면 설치하세요.
3. `src/utils/youtubeUtils.ts`가 로컬 바이너리(Windows) 또는 시스템 PATH(Linux/Mac)를 참조하는지 확인하세요.
