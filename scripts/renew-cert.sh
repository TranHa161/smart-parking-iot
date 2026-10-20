#!/usr/bin/env bash
# Cron hằng ngày. Chỉ gia hạn khi chứng chỉ còn < RENEW_BEFORE_DAYS ngày.
# Chứng chỉ được cấp bằng "standalone" nên khi gia hạn phải tạm dừng nginx (~20-30 giây).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
set -a; . ./.env; set +a

RENEW_BEFORE_DAYS="${RENEW_BEFORE_DAYS:-30}"
CERT="$ROOT/certbot/conf/live/${DOMAIN}/fullchain.pem"
SUDO=""; [[ $EUID -ne 0 ]] && SUDO="sudo -n"   # thư mục archive của certbot chỉ root đọc được

if ! $SUDO test -f "$CERT"; then
  echo "$(date -Is) Chưa có chứng chỉ, chạy 02-init.sh trước."; exit 1
fi

if $SUDO openssl x509 -checkend $((RENEW_BEFORE_DAYS * 86400)) -noout -in "$CERT" >/dev/null; then
  echo "$(date -Is) Chứng chỉ còn hạn > ${RENEW_BEFORE_DAYS} ngày, không cần gia hạn."
  exit 0
fi

echo "$(date -Is) Bắt đầu gia hạn..."
trap 'docker compose start frontend >/dev/null 2>&1 || true' EXIT
docker compose stop frontend

docker run --rm -p 80:80 \
  -v "$ROOT/certbot/conf:/etc/letsencrypt" \
  -v "$ROOT/certbot/www:/var/www/certbot" \
  certbot/certbot renew --no-random-sleep-on-renew

echo "$(date -Is) Gia hạn xong, nginx sẽ được bật lại."
