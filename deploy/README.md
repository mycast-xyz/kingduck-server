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

## 외부 공개 — Cloudflare Tunnel

`cloudflared` 가 공개 HTTPS를 종단하고 평문 HTTP로 Caddy(:80)에 접속한다. 공인IP/포트포워딩 불필요(CGNAT OK).

**cloudflared ingress 설정 (`~/.cloudflared/config.yml`)** — 반드시 **http://localhost:80** (Caddy)로:
```yaml
tunnel: <TUNNEL_ID>
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json
ingress:
  - hostname: www.kingduck.xyz
    service: http://localhost:80
  - hostname: kingduck.xyz
    service: http://localhost:80
  - service: http_status:404
```
적용: `cloudflared tunnel route dns <TUNNEL_ID> www.kingduck.xyz` 후 `cloudflared tunnel run`(또는 systemd 서비스).

> **중요**: Caddy는 CF Tunnel 뒤에서 **평문 `:80`만** 서빙한다(Caddyfile이 `:80` 블록). 도메인 기반 auto-HTTPS를
> 쓰면 Caddy가 HTTP→HTTPS 308 리다이렉트를 주고 cloudflared가 origin 도달에 실패해 **Cloudflare 530(error 1033)** 이 난다.
> Cloudflare 대시보드 SSL/TLS 모드는 **Full** 권장.

### ⚠️ 프론트는 공개 도메인으로 빌드해야 함 (아이콘/이미지 깨짐 방지)

프론트는 `{PUBLIC_API_BASE_URL}/api/...`·`{PUBLIC_API_BASE_URL}/assets/...` 로 호출하고, 이 값은 **빌드 타임에 인라인**된다.
로컬 개발용 `127.0.0.1:3100` 로 빌드하면 배포에서 모든 백엔드 이미지(게임 아이콘 등)가 깨진다. 반드시:
```bash
cd kingduck
echo 'PUBLIC_API_BASE_URL=https://www.kingduck.xyz' > .env
pnpm install && pnpm run build   # → kingduck/build
```
같은 도메인이므로 Caddy가 `/api`·`/assets` 를 백엔드로 프록시 → 동일 출처라 CORS도 불필요.

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

## 트러블슈팅

**전체 페이지 530 / `error code: 1033`**
- Cloudflare Tunnel이 origin(Caddy)에 못 닿는 상태. 점검 순서:
  1. 서버에서 `docker compose -f deploy/docker-compose.prod.yml ps` → caddy/app/db 가 Up 인지.
  2. `curl -I http://localhost:80/` 가 200/리다이렉트 아닌 정상 응답인지(308 리다이렉트면 Caddyfile이 도메인 기반 → `:80` 블록인지 확인).
  3. `cloudflared` 가 실행 중이고 ingress `service: http://localhost:80` 인지.
- 원인 대부분: Caddy가 도메인 기반 auto-HTTPS로 HTTP→HTTPS 리다이렉트 → 위 Caddyfile `:80` 수정으로 해결.

**API는 되는데 게임 아이콘/캐릭터 이미지만 깨짐 (또는 `/api/...` 가 SPA HTML 반환)**
- 프론트가 백엔드 `{base}/assets/...` 에 못 닿는 것. 둘 중 하나:
  1. 프론트 빌드의 `PUBLIC_API_BASE_URL` 이 `127.0.0.1`/로컬 → **공개 도메인으로 재빌드**(위 참고).
  2. Caddy가 `/api`·`/assets` 를 백엔드로 프록시하지 않음 → Caddyfile의 `handle /api/*`·`handle /assets/*` 블록 확인.
- 빠른 확인: `curl https://www.kingduck.xyz/api/v0/game/list` 가 **JSON**이면 정상, HTML이면 프록시 미작동.

**Caddy/cloudflared 수정 후 재적용**
```bash
cd kingduck-server
docker compose -f deploy/docker-compose.prod.yml up -d --build caddy   # Caddyfile 변경 반영
# cloudflared(호스트 서비스)면: sudo systemctl restart cloudflared
```
