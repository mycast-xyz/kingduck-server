@echo off
setlocal

echo [INFO] 프로젝트 초기화를 시작합니다...

REM 1. .env 파일 확인 및 생성
if not exist .env (
    echo [INFO] .env 파일이 없습니다. 기본값으로 생성합니다.
    echo DATABASE_URL="postgresql://postgres:postgres@localhost:5432/kingduck?schema=public" > .env
) else (
    echo [INFO] .env 파일이 이미 존재합니다.
)

REM 2. 의존성 설치
echo [INFO] 패키지 의존성을 설치합니다...
call pnpm install
if %ERRORLEVEL% neq 0 (
    echo [INFO] pnpm이 없습니다. npm으로 시도합니다...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] pnpm 또는 npm을 실행할 수 없습니다. Node.js가 설치되어 있는지 확인해주세요.
        exit /b 1
    )
)

REM 3. Prisma Generate
echo [INFO] Prisma 클라이언트를 생성합니다...
call npx prisma generate

REM 4. Prisma Migrate (DB 스키마 동기화)
echo [INFO] 데이터베이스 마이그레이션을 실행합니다...
call npx prisma migrate dev --name init

REM 5. DB Seed (초기 데이터 주입)
echo [INFO] 초기 데이터를 주입합니다 (Seeding)...
call npx prisma db seed

echo [INFO] 프로젝트 초기화가 완료되었습니다!
echo [INFO] 이제 'pnpm run dev' (또는 'npm run dev')로 서버를 실행할 수 있습니다.
pause
