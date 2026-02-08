# Kingduck Server 배포 가이드

이 문서는 Kingduck Server를 Docker를 사용하여 배포하는 방법을 설명합니다.
운영체제별(Windows, macOS, Linux) 설정 방법과 실행 방법을 포함하고 있습니다.

## 사전 요구 사항

- **Docker**: 컨테이너화된 애플리케이션을 실행하기 위해 필요합니다.
- **Docker Compose**: 여러 컨테이너를 관리하기 위해 필요합니다 (최신 Docker Desktop에는 포함되어 있습니다).

---

## 1. 운영체제별 Docker 설치

### Windows

1.  **WSL2 (Windows Subsystem for Linux 2) 활성화**:
    - PowerShell을 관리자 권한으로 실행하고 다음 명령어를 입력합니다:
      ```powershell
      wsl --install
      ```
    - 설치 후 재부팅이 필요할 수 있습니다.

2.  **Docker Desktop 설치**:
    - [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/)를 다운로드하여 설치합니다.
    - 설치 중 "Use WSL 2 based engine" 옵션을 체크합니다.

3.  **실행 확인**:
    - PowerShell 또는 명령 프롬프트에서 `docker --version`을 입력하여 버전이 출력되면 설치 완료입니다.

### macOS

1.  **Docker Desktop 설치**:
    - [Docker Desktop for Mac](https://docs.docker.com/desktop/install/mac-install/)을 다운로드하여 설치합니다.
    - **Apple Silicon (M1/M2/M3)** 사용자는 "Apple Chip" 버전을, **Intel** 사용자는 "Intel Chip" 버전을 선택하세요.

2.  **실행**:
    - 응용 프로그램 폴더에서 Docker를 실행하고 상단 메뉴 바에 고래 아이콘이 나타나는지 확인합니다.

3.  **실행 확인**:
    - 터미널에서 `docker --version`을 입력하여 확인합니다.

### Linux (Ubuntu 예시)

1.  **필수 패키지 설치**:

    ```bash
    sudo apt-get update
    sudo apt-get install ca-certificates curl gnupg
    ```

2.  **Docker 저장소 추가**:

    ```bash
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg

    echo \
      "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | \
      sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    ```

3.  **Docker Engine 설치**:

    ```bash
    sudo apt-get update
    sudo apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    ```

4.  **권한 설정 (옵션)**:
    - `sudo` 없이 docker 명령어를 사용하려면 현재 사용자를 docker 그룹에 추가합니다:
      ```bash
      sudo usermod -aG docker $USER
      ```
    - 로그아웃 후 다시 로그인해야 적용됩니다.

---

## 2. 애플리케이션 실행

Docker가 설치되었다면, 다음 단계를 통해 서버를 실행할 수 있습니다.

### 1. 환경 변수 설정

프로젝트 루트 디렉토리에 `.env` 파일이 있는지 확인하고, 필요한 환경 변수(DB 연결 정보 등)가 설정되어 있는지 확인하세요.
Docker 컨테이너 내부에서 실행되므로 `DATABASE_URL`이 로컬 호스트(`localhost`)를 가리키면 안 될 수 있습니다. (Docker 내부 네트워크나 외부 IP 사용 필요)

### 2. 컨테이너 빌드 및 실행

터미널(또는 PowerShell)에서 프로젝트 루트 디렉토리로 이동한 후 다음 명령어를 실행합니다:

```bash
docker-compose up -d --build
```

- `-d`: 백그라운드에서 실행 (Detached mode)
- `--build`: 이미지를 새로 빌드 (코드 변경 사항 반영)

### 3. 실행 확인

- **로그 확인**:

  ```bash
  docker-compose logs -f
  ```

  서버가 정상적으로 시작되었는지 실시간 로그를 확인할 수 있습니다.

- **상태 확인**:
  ```bash
  docker-compose ps
  ```
  컨테이너의 상태(Up/Down)를 확인할 수 있습니다.

### 4. 컨테이너 중지

서버를 종료하려면 다음 명령어를 사용합니다:

```bash
docker-compose down
```

---

## 3. 문제 해결 (Troubleshooting)

### Q: Puppeteer(Chrome) 실행 오류가 발생해요.

A: `Dockerfile`에는 Chrome 실행에 필요한 모든 시스템 라이브러리가 포함되어 있습니다. 만약 문제가 지속된다면 `docker-compose logs`를 통해 정확한 에러 메시지를 확인해주세요. 메모리 부족 문제일 경우 `docker-compose.yml`에서 `shm_size: '1gb'` 옵션을 추가해보세요.

### Q: DB 연결이 안 돼요.

A: `localhost`는 컨테이너 자신을 의미합니다. 호스트 머신(내 컴퓨터)의 DB에 접속하려면 `host.docker.internal` (Windows/Mac)을 사용하거나 실제 IP 주소를 사용해야 합니다. Linux의 경우 `--network host` 옵션을 사용하거나 `172.17.0.1` (Docker bridge IP)를 시도해보세요.

### Q: 파일 권한 문제가 있어요. (Linux)

A: 데이터가 저장되는 폴더(`data/`)에 쓰기 권한이 있는지 확인하세요. `chown -R 1000:1000 data` 명령어로 권한을 조정할 필요가 있을 수 있습니다.

---

## 4. Docker 없이 직접 배포하기 (PM2 사용)

Docker를 사용하지 않고 서버(AWS EC2, VPS 등)나 로컬 환경에 직접 배포하는 방법입니다.

### 1. 사전 요구 사항 설치

#### Node.js & pnpm

- **Node.js**: v18 이상 권장 (공식 홈페이지 설치)
- **pnpm**: `npm install -g pnpm`

#### Chrome/Puppeteer 의존성 (Linux 필수)

Ubuntu/Debian 서버의 경우 크롤러(Puppeteer) 실행을 위해 다음 라이브러리들이 필요합니다:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates fonts-liberation libappindicator3-1 libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 lsb-release wget xdg-utils
```

### 2. 프로젝트 설정

1.  **코드 다운로드**:

    ```bash
    git clone <repository-url>
    cd kingduck-server
    ```

2.  **의존성 설치**:

    ```bash
    pnpm install
    ```

3.  **환경 변수 설정**:
    - `.env` 파일을 생성하고 필요한 값을 입력합니다.

4.  **Prisma 클라이언트 생성**:

    ```bash
    pnpm prisma generate
    ```

5.  **빌드**:
    ```bash
    pnpm build
    ```

### 3. 서버 실행 (PM2)

서버가 터미널을 닫아도 계속 실행되도록 하려면 프로세스 관리 도구인 **PM2**를 사용하는 것이 좋습니다.

1.  **PM2 설치**:

    ```bash
    npm install -g pm2
    ```

2.  **서버 실행**:

    ```bash
    pm2 start dist/src/index.js --name "kingduck-server"
    ```

    (또는 `pnpm start` 스크립트를 직접 실행: `pm2 start npm --name "kingduck-server" -- run start`)

3.  **상태 확인**:

    ```bash
    pm2 list
    pm2 logs kingduck-server
    ```

4.  **서버 재시작 관리**:
    서버 재부팅 시 자동 실행되도록 설정:
    ```bash
    pm2 startup
    pm2 save
    ```
