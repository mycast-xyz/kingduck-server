# KingDuck 홈서버 운영 기획안

별도 PC를 24/7 홈서버로 구성해 KingDuck 스택(백엔드 API · PostgreSQL · 크롤러 · 정적 프론트)을
상시 서비스하고 외부(인터넷)에서 접속 가능하게 만드는 계획.

> 대상 스택: `kingduck`(프론트, SvelteKit adapter-static) + `kingduck-server`(Node/Express + Prisma) +
> PostgreSQL 14 + 크롤러(Puppeteer 기반). 현재는 개발 PC(Windows 11)에서 수동 실행 중.

---

## 1. 목표 / 현황

| | 현재 (개발 PC) | 목표 (홈서버) |
|---|---|---|
| 가동 | PC 켜져 있을 때만, 수동 실행 | 24/7 상시, 자동 |
| 접속 | localhost(4173/3100) | 공개 도메인 + HTTPS |
| 크롤러 | 손으로 `pnpm crawl` | cron 자동 스케줄 |
| 백업 | 수동 pg_dump | 자동 일일 백업 |

## 2. 구성요소별 자원 / 특성

| 구성 | 포트(현재) | 자원 | 비고 |
|---|---|---|---|
| 백엔드 API (Express+Prisma) | 3100 | CPU 낮음, RAM ~300MB | Docker 이미지 존재 |
| PostgreSQL 14 | 5432 | RAM 0.3~1GB, 디스크 증가 | **현재 비컨테이너(native)**. 백업 필수 |
| 크롤러 (스케줄) | — | **Puppeteer/Chromium 무거움**, RAM 스파이크 | 주기 실행, 동시실행 가드 있음 |
| 정적 프론트 (adapter-static) | 4173(dev) | nginx 정적 서빙이면 거의 0 | 빌드 산출물만 배포 |
| 이미지 자산 (`static/image`) | — | 디스크 증가(게임 추가마다 수백 MB) | 볼륨/백업 대상 |

## 3. 하드웨어 / OS 권장

- **CPU**: 4코어+ (Puppeteer 크롤링이 가장 무겁다). **RAM 8GB+** (DB+크롤러 동시 가동 여유).
- **디스크**: SSD 256GB+ (이미지 자산이 계속 늘어남). 백업용 별도 디스크/외장 권장.
- **OS**: **Ubuntu Server 24.04 LTS** 추천 — Docker 친화적, 저전력, SSH 원격 관리. (Windows도 가능하나
  Docker Desktop 오버헤드/라이선스 고려.)
- **하드웨어**: 저전력 미니PC(Intel N100/N305, Ryzen 미니PC) 또는 남는 데스크톱. 24/7이므로 전력효율 우선.

## 4. 배포 아키텍처 (권장: Docker Compose 통합)

이미 `docker-compose.yml`(app) · `Dockerfile` · `DEPLOY.md`가 있으므로 이를 확장한다.

```
                 인터넷
                   │  (80/443)
            ┌──────▼───────┐
            │ 리버스 프록시 │  Caddy 또는 nginx (HTTPS 종단)
            │  /     → web  │
            │  /api  → app  │
            │  /assets → app│
            └──┬────┬───┬───┘
        web(nginx) app(node) db(postgres)
        정적 프론트  :3100     :5432(내부)
                              볼륨: pgdata
                    크롤러(app 내 cron 또는 별도 oneshot)
```

- **db**: `postgres:14` 서비스 추가 + named volume(`pgdata`)로 영속. (또는 호스트 native PG 유지하고
  app의 `DATABASE_URL`만 호스트로 향하게 — 단 컨테이너↔호스트 네트워크 주의.)
- **app**: 기존 백엔드 이미지. `DATABASE_URL`을 `db:5432`로.
- **web**: nginx로 프론트 빌드 산출물 서빙 + `/api` 프록시. 또는 Caddy 단일 서비스로 프록시+정적+HTTPS 통합(가장 단순).
- **리버스 프록시 권장 = Caddy**: 설정 몇 줄로 Let's Encrypt 자동 HTTPS.

## 5. 네트워킹 / 외부 공개

- **공유기 포트포워딩**: 80/443 → 서버 IP. (가정용 회선이 공인 IP인지 확인 — CGNAT면 포트포워딩 불가 → 아래 Tunnel)
- **권장: Cloudflare Tunnel** — 포트포워딩/공인IP 없이도 안전하게 외부 공개, 인증서 자동, DDoS 보호. CGNAT 환경에 최적.
- 대안: **DDNS**(DuckDNS/No-IP) + 포트포워딩 + Caddy 자동 인증서.
- **도메인**: 저렴한 도메인 구매 후 Cloudflare DNS 연결.

## 6. 보안 (필수)

- SSH: **키 인증만**, 비밀번호 로그인 비활성, 포트 변경(선택), `fail2ban`.
- 방화벽(`ufw`): 22(SSH)·80·443만 허용. **5432(DB)·3100(API)는 외부 비공개**(프록시 통해서만).
- `.env`/시크릿: 리포에 커밋 금지(JWT_SECRET_KEY 등은 서버 환경변수로). 현재 `.env`는 gitignore 확인됨.
- 관리자 API: 백엔드 인증이 진짜 가드(프론트 가드는 UX용) — 공개 전 점검.

## 7. 크롤러 운영

- 현재: `pnpm run crawl --game <slug> --type <type>` (단일 게임/타입 필터 지원).
- 홈서버: **cron**으로 주기 실행(예: 매일 04:00 KST). 게임별 분산 실행으로 부하 분산.
- **Puppeteer**: 컨테이너에 Chromium 의존성(libnss3 등) 설치 필요 — 크롤러 전용 이미지 또는 app 이미지에 포함.
- 동시 실행 방지(이미 RUNNING 상태 가드 존재). 실패 시 **Discord 웹훅 알림** 권장.

## 8. 백업 (중요 — 데이터 유실 방지)

- **DB**: `pg_dump` 일일 자동 백업 → 별도 디스크 + 클라우드(예: rclone→구글드라이브/S3). 보존: 일일 7개 + 주간 4개.
- **이미지 자산**(`static/image`): rsync 주기 백업(증분).
- cron 예시: `0 5 * * * pg_dump -Fc game > /backup/game_$(date +\%F).dump`
- **복원 리허설**을 한 번은 해볼 것(백업이 실제로 복구되는지).

## 9. CI/CD (선택, 점진 도입)

- 1단계(간단): 서버에서 `git pull && docker compose up -d --build`.
- 2단계: GitHub Actions로 빌드 → SSH 배포, 또는 self-hosted runner.
- 3단계: 이미지 레지스트리 + `watchtower` 자동 갱신.

## 10. 모니터링

- 컨테이너 **healthcheck** 이미 있음(`/health`, DB 연결까지 검증).
- **Uptime Kuma**(자가호스팅 업타임/알림) — 외부 다운 감지 + Discord 알림.
- 리소스: `netdata` 또는 `glances`.

## 11. 마이그레이션 단계 (체크리스트)

1. [ ] 서버 OS(Ubuntu) 설치 + Docker/Compose.
2. [ ] DB 이전: 개발 PC `pg_dump -Fc game` → 서버에서 `pg_restore`(또는 db 컨테이너에 적재).
3. [ ] 이미지 자산 복사: `static/image/**` rsync.
4. [ ] `.env` 구성: `DATABASE_URL`(서버 DB), `JWT_SECRET_KEY`, `PUBLIC_API_BASE_URL`=공개 도메인.
5. [ ] docker compose up (db/app/web). 프론트는 도메인 확정 후 빌드.
6. [ ] 리버스 프록시 + HTTPS(Caddy) + Cloudflare Tunnel/DDNS.
7. [ ] 크롤러 cron + 백업 cron 등록.
8. [ ] 외부 검증: 도메인 접속 / API / 이미지 로딩 / 관리자 로그인.

## 12. 이 프로젝트 특화 주의점

- **프론트 base URL은 빌드 타임에 인라인된다**(`$env/static/public`의 `PUBLIC_API_BASE_URL`). 따라서
  **공개 도메인을 확정한 뒤 프론트를 빌드**해야 한다. 같은 도메인 `/api`로 묶거나 `api.도메인`으로 분리.
- **`client.ts`의 `:3100` 폴백**은 로컬 개발용 — 프로덕션은 `PUBLIC_API_BASE_URL`이 채워지므로 폴백을 타지 않지만,
  배포 형상에 맞는지 한 번 점검.
- **CORS 화이트리스트**(`src/index.ts`의 `whitelist`)에 **공개 프론트 도메인**을 추가해야 한다.
  (현재는 localhost:4173/5173 등 개발 origin만.)
- **포트**: 현재 dev 포트 3100/4173은 개발 PC의 타 프로젝트 충돌 회피용. 홈서버에선 컨테이너 내부 포트는 자유롭게,
  외부는 80/443만 노출.
- **adapter-static = SSR 없음**: 프론트는 정적 파일 묶음이라 nginx/Caddy 정적 서빙으로 충분(Node 불필요).

---

### 요약 권장안 (가장 단순한 1안)

> 미니PC + Ubuntu + Docker Compose(db/app) + **Caddy**(정적 프론트 서빙 + `/api` 프록시 + 자동 HTTPS) +
> **Cloudflare Tunnel**(포트포워딩 없이 공개) + **cron**(크롤러·pg_dump 백업) + **Uptime Kuma**(모니터링).
> 이 조합이면 공인 IP/포트포워딩 없이도 안전하게 공개되고, 인증서·갱신·DDoS까지 Cloudflare가 처리한다.

---

## 13. 실제 배포 스크립트

이 기획을 그대로 실행할 수 있는 스크립트를 [`../deploy/`](../deploy/) 에 만들어 두었다.

| 파일 | 역할 |
|---|---|
| `deploy/docker-compose.prod.yml` | db(postgres:14) + app(백엔드) + caddy(프론트+프록시+HTTPS) 통합 |
| `deploy/Caddyfile` | `/api`·`/assets`→app, 그 외→정적 프론트, 자동 HTTPS |
| `deploy/.env.production.example` | 도메인·DB 자격증명·백업 설정 템플릿 |
| `deploy/backup-db.sh` | `pg_dump` 일일 백업 + 보존 |
| `deploy/crontab.example` | 크롤러·백업 cron 예시 |
| `deploy/README.md` | 사전준비 → 기동 → 외부공개 → 자동화 절차 |

기동 한 줄:
```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.production up -d --build
```
자세한 절차와 주의점(프론트 빌드 타임 도메인, Puppeteer Chromium 의존성 등)은 `deploy/README.md` 참고.
