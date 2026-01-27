# 서버 배포 및 운영 가이드 (SERVER_DEPLOY_GUIDE)

이 문서는 Linux 서버(Ubuntu/Debian 기준)에서 `kingduck-server`를 배포하고, 크롤러를 주기적으로 실행하도록 설정하는 방법을 안내합니다.

## 1. 필수 라이브러리 설치 (Puppeteer/Headless Chrome)

서버 환경(CLI)에서 크롤러(Puppeteer)를 실행하려면 Chrome 실행에 필요한 시스템 라이브러리가 설치되어 있어야 합니다.

```bash
# 시스템 패키지 업데이트
sudo apt-get update

# Puppeteer 의존성 설치 (Ubuntu/Debian)
sudo apt-get install -y ca-certificates fonts-liberation libasound2 \
libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 \
libexpat1 libfontconfig1 libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 \
libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 \
libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 \
libxrandr2 libxrender1 libxss1 libxtst6 lsb-release wget xdg-utils
```

## 2. 프로젝트 설정

1.  **코드 복제 및 이동**:

    ```bash
    git clone https://github.com/Start-KingDuck/kingduck-server.git
    cd kingduck-server
    ```

2.  **초기화 스크립트 실행** (의존성 설치, DB 설정):

    ```bash
    chmod +x scripts/init_db.sh
    ./scripts/init_db.sh
    ```

    - `.env` 파일을 열어 운영 DB 정보로 수정해야 할 수 있습니다 (`vi .env`).

3.  **Chrome 브라우저 설치**:
    ```bash
    npx puppeteer browsers install chrome
    ```

## 3. API 서버 실행 (PM2 사용)

서버가 중단 없이 실행되도록 관리하기 위해 `pm2`를 사용하는 것을 권장합니다.

1.  **PM2 설치**:

    ```bash
    npm install -g pm2
    ```

2.  **프로젝트 빌드**:

    ```bash
    pnpm build
    # 또는 npm run build
    ```

3.  **서버 시작**:

    ```bash
    pm2 start npm --name "kingduck-api" -- run start
    ```

4.  **로그 확인**:
    ```bash
    pm2 logs kingduck-api
    ```

## 4. 크롤러 스케줄링 (Cron)

크롤러를 매일 특정 시간에 자동으로 실행하려면 `crontab`을 설정합니다.

1.  **크론탭 편집기 열기**:

    ```bash
    crontab -e
    ```

2.  **스케줄 추가** (예: 매일 새벽 4시에 실행):
    ```cron
    # 매일 04:00 실행 (경로는 실제 서버 경로로 수정 필요)
    0 4 * * * cd /home/user/kingduck-server && /usr/bin/npm run crawl >> /home/user/kingduck-server/logs/cron.log 2>&1
    ```

    - **주의**: `npm`의 절대 경로는 `which npm` 명령어로 확인하여 입력하세요.
    - 로그 디렉토리(`logs`)가 존재하는지 확인하세요.

## 5. 수동 실행 테스트

설정이 잘 되었는지 확인하기 위해 한번 수동으로 실행해 봅니다.

```bash
npm run crawl
```

- `Crawler Job Started` 메시지가 나오고 에러 없이 종료되면 성공입니다.
