# 스크립트 가이드 (Scripts Guide)

이 프로젝트에는 설정, 초기화 및 데이터베이스 관리를 돕는 유틸리티 스크립트가 포함되어 있습니다.

## Ubuntu 초기화 (`scripts/init_ubuntu.sh`)

**목적**: 이 서버를 위한 새로운 Ubuntu 환경 설정을 자동화합니다.

**기능**:

- 시스템 의존성 설치: `curl`, `git`, `python3`, `ffmpeg`, `build-essential`.
- `yt-dlp` 설치: 최신 바이너리를 `/usr/local/bin`에 다운로드하여 설치 (동영상 다운로드 문제 해결).
- Node.js (LTS) 및 pnpm 설치.
- `init_db.sh` 실행.

**사용법**:

```bash
chmod +x scripts/init_ubuntu.sh
./scripts/init_ubuntu.sh
```

## 데이터베이스 초기화 (`scripts/init_db.sh`)

**목적**: 데이터베이스 스키마를 설정하고 초기 데이터를 주입(Seed)합니다.

**기능**:

- `.env` 파일이 없으면 생성.
- 패키지 의존성 설치 (`pnpm install`).
- Prisma Client 생성 (`prisma generate`).
- 마이그레이션 실행 (`prisma migrate`).
- 초기 데이터 주입 (`prisma db seed`).

**사용법**:

```bash
./scripts/init_db.sh
```
