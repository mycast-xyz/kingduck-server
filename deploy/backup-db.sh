#!/usr/bin/env bash
# KingDuck PostgreSQL 일일 백업 + 보존(기본 7일). cron 등록은 crontab.example 참고.
# docker compose의 db 컨테이너 안에서 pg_dump를 실행해 호스트로 덤프를 떨군다.
#
# 사용: BACKUP_DIR=/backup/kingduck ./backup-db.sh
# 복원: docker compose -f deploy/docker-compose.prod.yml exec -T db \
#         pg_restore -U "$POSTGRES_USER" -d game --clean --if-exists < game_YYYY-MM-DD.dump
set -euo pipefail

# .env.production 에서 자격증명 로드(있으면).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -f "$SCRIPT_DIR/.env.production" ] && set -a && . "$SCRIPT_DIR/.env.production" && set +a

BACKUP_DIR="${BACKUP_DIR:-/backup/kingduck}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_NAME="${POSTGRES_DB:-game}"
COMPOSE="docker compose -f $SCRIPT_DIR/docker-compose.prod.yml --env-file $SCRIPT_DIR/.env.production"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%F_%H%M)"
OUT="$BACKUP_DIR/game_${STAMP}.dump"

echo "[backup] dumping $DB_NAME → $OUT"
$COMPOSE exec -T db pg_dump -U "$DB_USER" -Fc "$DB_NAME" > "$OUT"
echo "[backup] done: $(du -h "$OUT" | cut -f1)"

# 보존 정책: RETENTION_DAYS 보다 오래된 덤프 삭제.
find "$BACKUP_DIR" -name 'game_*.dump' -mtime "+${RETENTION_DAYS}" -delete
echo "[backup] pruned dumps older than ${RETENTION_DAYS}d"
