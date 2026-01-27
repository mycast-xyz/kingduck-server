#!/bin/bash

# 색상 코드
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo -e "${GREEN}프로젝트 초기화를 시작합니다...${NC}"

# 1. .env 파일 확인 및 생성
if [ ! -f .env ]; then
  echo -e "${GREEN}.env 파일이 없습니다. 기본값으로 생성합니다.${NC}"
  echo 'DATABASE_URL="postgresql://postgres:postgres@localhost:5432/kingduck?schema=public"' > .env
else
  echo -e "${GREEN}.env 파일이 이미 존재합니다.${NC}"
fi

# 2. 의존성 설치
echo -e "${GREEN}패키지 의존성을 설치합니다...${NC}"
if command -v pnpm &> /dev/null; then
  pnpm install
elif command -v npm &> /dev/null; then
  npm install
else
  echo "pnpm 또는 npm을 찾을 수 없습니다. 설치 후 다시 시도해주세요."
  exit 1
fi

# 3. Prisma Generate
echo -e "${GREEN}Prisma 클라이언트를 생성합니다...${NC}"
npx prisma generate

# 4. Prisma Migrate (DB 스키마 동기화)
echo -e "${GREEN}데이터베이스 마이그레이션을 실행합니다...${NC}"
npx prisma migrate dev --name init

# 5. DB Seed (초기 데이터 주입)
echo -e "${GREEN}초기 데이터를 주입합니다 (Seeding)...${NC}"
npx prisma db seed

echo -e "${GREEN}프로젝트 초기화가 완료되었습니다!${NC}"
echo -e "${GREEN}이제 'pnpm run dev' (또는 'npm run dev')로 서버를 실행할 수 있습니다.${NC}"
