# KingDuck 홈서버 배포 (deploy/)

홈서버에서 KingDuck 전체 스택(PostgreSQL + 백엔드 + 정적 프론트 + HTTPS)을 Docker로 띄우는 실전 스크립트.
배경/설계는 [`../docs/home-server-plan.md`](../docs/home-server-plan.md) 참고.

## 구성 파일

| 파일 | 역할 |
|---|---|
| `docker-compose.prod.yml` | db(postgres:14) + app(백엔드) + caddy(프론트+프록시+HTTPS) |
| `Caddyfile` | 리버스 프록시: `/api`·`/assets`→app, 그 외→프론트 정적, 자동 HTTPS |
| `.env.production.example` | 도메인·DB 자격증명·백업 설정 템플릿 → `.env.production` 으로 복사 |
| `backup-db.sh` | `pg_dump` 일일 백업 + 보존 정책 |
| `crontab.example` | 크롤러·백업 cron 예시 |

## 사전 준비

1. `kingduck` 와 `kingduck-server` 를 **같은 부모 디렉터리**에 클론.
2. 시크릿 채우기:
   - `kingduck-server/.env` — `JWT_SECRET_KEY`, `YOUTUBE_API_KEY` 등 (DB는 compose가 주입).
   - `deploy/.env.production` — `.env.production.example` 복사 후 `DOMAIN`, `POSTGRES_*` 입력.
3. 프론트는 **배포 도메인으로 빌드**:
   ```bash
   cd kingduck
   echo 'PUBLIC_API_BASE_URL=https://kingduck.example.com' > .env
   pnpm install && pnpm run build      # → kingduck/build (adapter-static)
   ```
4. 백엔드 CORS 화이트리스트(`src/index.ts`)에 배포 도메인 추가(같은 도메인이면 동일 출처라 생략 가능).

## 기동

```bash
cd kingduck-server
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.production up -d --build
```

- 최초 1회 DB 마이그레이션/적재: 기존 개발 DB를 옮길 경우
  ```bash
  # 개발 PC에서
  pg_dump -Fc game > game.dump
  # 서버에서
  docker compose -f deploy/docker-compose.prod.yml exec -T db pg_restore -U "$POSTGRES_USER" -d game --clean --if-exists < game.dump
  ```
  (이미지 자산은 `kingduck-server/static/image/**` 를 rsync 로 서버에 복사.)

## 외부 공개 (택1)

- **Cloudflare Tunnel(권장)**: 공인IP/포트포워딩 불필요. `cloudflared` 로 `localhost:80`(caddy) 노출.
  CGNAT 회선에서도 동작하고 인증서/DDoS를 Cloudflare가 처리.
- **포트포워딩 + Caddy 자동 HTTPS**: 공유기 80/443 → 서버. `DOMAIN` 의 DNS A레코드를 공인IP(또는 DDNS)로.

## 크롤러 / 백업 자동화

```bash
chmod +x deploy/backup-db.sh
crontab -e   # crontab.example 내용 참고해 등록
mkdir -p /var/log/kingduck
```

> **Puppeteer 주의**: 원신/스타레일/명조/명조 등은 Puppeteer(Chromium)를 쓴다. app 이미지에 Chromium
> 의존성이 없으면 해당 크롤은 실패한다. 그 게임들을 cron으로 돌리려면 `Dockerfile` 에 Chromium deps
> (`chromium`, `libnss3`, `libatk*`, `fonts-noto-cjk` 등)를 추가하거나 크롤러 전용 이미지를 만들 것.
> 니케는 fetch/YouTube API 기반이라 추가 의존성 없이 동작한다.

## 운영 체크리스트

- [ ] `.env` / `.env.production` 시크릿 채움 + 커밋 안 됨 확인
- [ ] 프론트를 배포 도메인으로 빌드(`PUBLIC_API_BASE_URL`)
- [ ] CORS 화이트리스트(필요 시)
- [ ] DB 이전 + 이미지 rsync
- [ ] `docker compose ... up -d` 후 `/health` 200 확인
- [ ] 외부에서 도메인 접속 / API / 이미지 로딩 확인
- [ ] cron(크롤러·백업) 등록 + 백업 복원 1회 리허설
- [ ] (선택) Uptime Kuma 로 다운 알림
