#!/bin/bash
set -e

# 색상 코드
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${GREEN}Ubuntu 시스템 초기 설정을 시작합니다...${NC}"

# 1. 시스템 업데이트 및 필수 패키지 설치
echo -e "${GREEN}[1/5] 시스템 패키지 업데이트 및 기본 도구(git, curl, python3, ffmpeg 등) 설치...${NC}"
sudo apt-get update
sudo apt-get install -y curl wget git python3 python3-pip ffmpeg build-essential

# 2. yt-dlp 설치 (바이너리 직접 다운로드 방식)
echo -e "${GREEN}[2/5] yt-dlp 설치 중...${NC}"
if [ -f /usr/local/bin/yt-dlp ]; then
    echo "기존 yt-dlp 제거 중..."
    sudo rm /usr/local/bin/yt-dlp
fi

# 최신 릴리즈 다운로드
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp

# 설치 확인
if command -v yt-dlp &> /dev/null; then
    echo "yt-dlp 설치 완료: $(yt-dlp --version)"
else
    echo "yt-dlp 설치 실패!"
    exit 1
fi

# 3. Node.js 설치 (NodeSource 저장소 사용 - LTS 버전)
echo -e "${GREEN}[3/5] Node.js (LTS) 설치 중...${NC}"
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
    echo "Node.js 설치 완료: $(node -v)"
else
    echo "Node.js가 이미 설치되어 있습니다: $(node -v)"
fi

# 4. pnpm 설치
echo -e "${GREEN}[4/5] pnpm 설치 중...${NC}"
if ! command -v pnpm &> /dev/null; then
    sudo npm install -g pnpm
    echo "pnpm 설치 완료: $(pnpm -v)"
else
    echo "pnpm이 이미 설치되어 있습니다: $(pnpm -v)"
fi

# 5. 프로젝트 초기화 스크립트 실행
echo -e "${GREEN}[5/5] 프로젝트 초기화 (의존성 및 DB)...${NC}"

# 스크립트 실행 위치 확인 및 이동
CURRENT_DIR=$(pwd)
SCRIPT_DIR=$(dirname "$0")

# init_db.sh 실행 (루트에서 실행 가정)
if [ -f "$CURRENT_DIR/scripts/init_db.sh" ]; then
    chmod +x "$CURRENT_DIR/scripts/init_db.sh"
    bash "$CURRENT_DIR/scripts/init_db.sh"
elif [ -f "$CURRENT_DIR/init_db.sh" ]; then
    # scripts 폴더 안에서 실행한 경우
    chmod +x "$CURRENT_DIR/init_db.sh"
    bash "$CURRENT_DIR/init_db.sh"
else
    echo "경고: init_db.sh를 찾을 수 없습니다. 수동으로 의존성을 설치해주세요."
fi

echo -e "${GREEN}Ubuntu 초기 설정이 모든 완료되었습니다!${NC}"
