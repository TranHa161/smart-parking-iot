#!/usr/bin/env bash
# Được GitHub Actions gọi qua SSH sau khi PR được merge vào main.
# Có thể chạy tay trên server:  ./scripts/deploy.sh
# Container cũ vẫn chạy trong lúc build; chỉ khi build xong mới thay container (downtime vài giây).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
BRANCH="${DEPLOY_BRANCH:-main}"

exec 9>"$ROOT/.deploy.lock"
flock -n 9 || { echo "Đang có một lần deploy khác chạy."; exit 1; }

log() { printf '\033[1;32m[deploy]\033[0m %s\n' "$*"; }

OLD="$(git rev-parse HEAD)"
log "Kéo code mới nhất của ${BRANCH}..."
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"
NEW="$(git rev-parse HEAD)"
log "Commit: ${OLD:0:7} -> ${NEW:0:7}"

export COMPOSE_PARALLEL_LIMIT=1
log "Build image..."
docker compose build

log "Thay container..."
docker compose up -d --remove-orphans

# File cấu hình được mount (không nằm trong image) đổi thì cần restart service tương ứng
CHANGED="$(git diff --name-only "$OLD" "$NEW" || true)"
if grep -q '^nginx/' <<<"$CHANGED"; then log "nginx đổi cấu hình -> restart"; docker compose restart frontend; fi
if grep -q '^mosquitto/mosquitto.conf' <<<"$CHANGED"; then log "mosquitto.conf đổi -> restart"; docker compose restart mosquitto; fi

log "Chờ backend healthy..."
CID="$(docker compose ps -q backend)"
for i in $(seq 1 24); do
  STATUS="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$CID")"
  [[ "$STATUS" == "healthy" ]] && break
  sleep 5
done
if [[ "$STATUS" != "healthy" ]]; then
  echo "Backend KHÔNG healthy (status=$STATUS). Log gần nhất:"
  docker compose logs --tail=60 backend
  exit 1
fi

docker image prune -f >/dev/null
docker compose ps
log "Deploy thành công."
