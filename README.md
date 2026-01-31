# KingDuck Server

게임 데이터 집계 및 API 서버입니다.

## 📚 문서 (Documentation)

상세 문서는 다음 섹션별로 정리되어 있습니다:

- **[📂 프로젝트 구조](docs/PROJECT_STRUCTURE.md)**: 전체 디렉토리 및 파일 구조 설명.
- **[🔌 API 라우트](docs/API_ROUTES.md)**: API 엔드포인트 구조 및 사용법.
- **[🛠️ 스크립트 가이드](docs/SCRIPTS_GUIDE.md)**: 서버 설정 및 초기화 스크립트 (Ubuntu/DB).
- **[🕷️ 크롤러 가이드](docs/CRAWLER_GUIDE.md)**: 스크래핑 및 데이터 파이프라인 작동 원리.

## 🚀 빠른 시작 (Quick Start)

### 1. 초기화 (Ubuntu)

```bash
chmod +x scripts/init_ubuntu.sh
./scripts/init_ubuntu.sh
```

### 2. 개발 서버 실행

```bash
pnpm run dev
```

### 3. 크롤러 실행

```bash
pnpm run crawl
```
