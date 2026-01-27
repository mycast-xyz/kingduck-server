# 프로젝트 초기화 가이드 (INIT_GUIDE)

이 문서는 `kingduck-server` 프로젝트를 처음 실행하는 개발자를 위한 초기화 가이드입니다.
제공된 스크립트를 사용하여 데이터베이스 설정, 의존성 설치, 초기 데이터 주입을 한 번에 수행할 수 있습니다.

## 1. 필수 조건 (Prerequisites)

이 프로젝트를 실행하기 위해 다음 소프트웨어가 설치되어 있어야 합니다.

- **Node.js**: (LTS 버전 권장, v18 이상)
- **PostgreSQL**: 데이터베이스 서버가 로컬(또는 원격)에서 실행 중이어야 합니다.
  - 기본 설정은 `localhost:5432`에 `postgres` 계정, `postgres` 비밀번호, `kingduck` 데이터베이스를 사용합니다.
  - 설정이 다른 경우 스크립트 실행 후 생성되는 `.env` 파일을 수정해야 합니다.

## 2. 초기화 스크립트 실행

운영체제에 맞는 스크립트를 실행하여 프로젝트를 초기화하세요.

### macOS / Linux

터미널을 열고 프로젝트 루트 디렉토리에서 다음 명령어를 실행합니다.

```bash
./scripts/init_db.sh
```

> **참고:** 실행 권한 오류(`Permission denied`)가 발생하면 `chmod +x scripts/init_db.sh`를 먼저 실행해주세요.

이 스크립트는 다음 작업을 수행합니다:

1.  `.env` 파일 확인 (없으면 기본값 생성)
2.  `pnpm install` (또는 `npm install`)
3.  Prisma Client 생성
4.  DB 마이그레이션 (`prisma migrate dev`)
5.  초기 데이터 시딩 (`prisma db seed`)

### Windows

CMD 또는 PowerShell을 열고 프로젝트 루트 디렉토리에서 다음 명령어를 실행합니다.

```cmd
scripts\init_db.bat
```

또는 탐색기에서 `scripts/init_db.bat` 파일을 더블 클릭하여 실행할 수도 있습니다.

## 3. 서버 실행

초기화가 성공적으로 완료되면 다음 명령어로 개발 서버를 실행할 수 있습니다.

```bash
pnpm run dev
# 또는
npm run dev
```

## 4. 문제 해결 (Troubleshooting)

- **데이터베이스 연결 오류**:
  - PostgreSQL이 실행 중인지 확인하세요.
  - `.env` 파일의 `DATABASE_URL`이 실제 DB 설정과 일치하는지 확인하세요.
  - `kingduck` 데이터베이스를 찾을 수 없다는 오류가 나오면 PostgreSQL에서 `CREATE DATABASE kingduck;` 명령어로 직접 DB를 생성해야 할 수도 있습니다 (일반적으로 Prisma가 처리하지만 권한 문제일 수 있음).
- **Prisma 오류**: `npx prisma generate`를 수동으로 실행해 보세요.
