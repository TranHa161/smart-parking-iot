#!/usr/bin/env bash
# Chạy 1 LẦN trên server (không cần sudo), từ thư mục repo:  ./scripts/02-init.sh
# Tạo .env, mật khẩu Mosquitto, lấy chứng chỉ SSL lần đầu, cài cron, khởi động hệ thống.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
mkdir -p logs certbot/conf certbot/www

log() { printf '\033[1;32m[init]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[init] LỖI:\033[0m %s\n' "$*" >&2; exit 1; }

docker info >/dev/null 2>&1 || die "Không chạy được docker. Đã đăng xuất/đăng nhập lại sau 01-setup-ec2.sh chưa?"

# ---------------------------------------------------------------- 1. .env
set_env() {  # set_env KEY VALUE
  if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi
}
gen() { openssl rand -hex "${1:-16}"; }

if [[ ! -f .env ]]; then
  [[ -f .env.example ]] || die "Thiếu .env.example"
  cp .env.example .env
  chmod 600 .env

  DOMAIN="${DOMAIN:-}"
  DUCKDNS_TOKEN="${DUCKDNS_TOKEN:-}"
  LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"
  [[ -n "$DOMAIN" ]]            || read -r -p "Tên miền DuckDNS đầy đủ (vd myparking.duckdns.org): " DOMAIN
  [[ -n "$DUCKDNS_TOKEN" ]]     || read -r -p "DuckDNS token: " DUCKDNS_TOKEN
  [[ -n "$LETSENCRYPT_EMAIL" ]] || read -r -p "Email nhận thông báo Let's Encrypt: " LETSENCRYPT_EMAIL
  [[ "$DOMAIN" == *.duckdns.org ]] || die "DOMAIN phải có dạng xxx.duckdns.org"

  set_env DOMAIN "$DOMAIN"
  set_env DUCKDNS_TOKEN "$DUCKDNS_TOKEN"
  set_env LETSENCRYPT_EMAIL "$LETSENCRYPT_EMAIL"
  set_env POSTGRES_PASSWORD "$(gen 16)"
  set_env REDIS_PASSWORD "$(gen 16)"
  set_env MQTT_PASSWORD "$(gen 16)"
  set_env APP_SECRET_KEY "$(gen 32)"
  log "Đã tạo .env với mật khẩu ngẫu nhiên (xem bằng: cat .env)."
else
  log ".env đã tồn tại, giữ nguyên."
fi

set -a; . ./.env; set +a
for v in DOMAIN DUCKDNS_TOKEN LETSENCRYPT_EMAIL POSTGRES_PASSWORD REDIS_PASSWORD MQTT_USER MQTT_PASSWORD APP_SECRET_KEY; do
  [[ -n "${!v:-}" ]] || die "Biến $v trong .env đang trống."
done

# ---------------------------------------------------------------- 2. DuckDNS
log "Cập nhật IP lên DuckDNS..."
bash "$ROOT/scripts/update-duckdns.sh"

PUBLIC_IP="$(curl -fsS --max-time 10 https://checkip.amazonaws.com | tr -d '[:space:]')"
log "Chờ DNS ${DOMAIN} trỏ về ${PUBLIC_IP}..."
for i in $(seq 1 30); do
  RESOLVED="$(getent ahostsv4 "$DOMAIN" | awk '{print $1; exit}' || true)"
  [[ "$RESOLVED" == "$PUBLIC_IP" ]] && break
  sleep 10
done
[[ "${RESOLVED:-}" == "$PUBLIC_IP" ]] || die "DNS chưa trỏ đúng (got '${RESOLVED:-}', cần '$PUBLIC_IP'). Kiểm tra DuckDNS token/domain rồi chạy lại."

# ---------------------------------------------------------------- 3. Mosquitto password
log "Tạo file mật khẩu Mosquitto cho user '${MQTT_USER}'..."
docker run --rm --user root -v "$ROOT/mosquitto:/work" --entrypoint sh eclipse-mosquitto:2 -c \
  "mosquitto_passwd -b -c /work/passwd '${MQTT_USER}' '${MQTT_PASSWORD}' && chown 1883:1883 /work/passwd && chmod 0700 /work/passwd"

# ---------------------------------------------------------------- 4. SSL lần đầu (standalone)
CERT="$ROOT/certbot/conf/live/${DOMAIN}/fullchain.pem"
if sudo -n test -f "$CERT" 2>/dev/null || [[ -f "$CERT" ]]; then
  log "Đã có chứng chỉ SSL, bỏ qua."
else
  log "Xin chứng chỉ Let's Encrypt (standalone, cần cổng 80 mở trong Security Group)..."
  EXTRA=()
  [[ "${CERTBOT_STAGING:-0}" == "1" ]] && EXTRA+=(--staging) && log "(chế độ STAGING - chứng chỉ thử nghiệm)"
  docker run --rm -p 80:80 \
    -v "$ROOT/certbot/conf:/etc/letsencrypt" \
    -v "$ROOT/certbot/www:/var/www/certbot" \
    certbot/certbot certonly --standalone --preferred-challenges http \
    -d "$DOMAIN" --email "$LETSENCRYPT_EMAIL" --agree-tos --no-eff-email --non-interactive "${EXTRA[@]}"
fi

# ---------------------------------------------------------------- 5. Cron
log "Cài cron (DuckDNS mỗi 5 phút + khi reboot, gia hạn SSL hằng ngày)..."
TAG="# smart-parking"
{
  crontab -l 2>/dev/null | grep -v "$TAG" || true
  echo "@reboot sleep 20 && $ROOT/scripts/update-duckdns.sh >> $ROOT/logs/duckdns.log 2>&1 $TAG"
  echo "*/5 * * * * $ROOT/scripts/update-duckdns.sh >> $ROOT/logs/duckdns.log 2>&1 $TAG"
  echo "17 3 * * * $ROOT/scripts/renew-cert.sh >> $ROOT/logs/renew.log 2>&1 $TAG"
} | crontab -

# ---------------------------------------------------------------- 6. Start
log "Build và khởi động (lần đầu build Angular trên 1 GB RAM có thể mất 5-10 phút)..."
export COMPOSE_PARALLEL_LIMIT=1
docker compose build
docker compose up -d --remove-orphans
docker compose ps

log "HOÀN TẤT. Mở: https://${DOMAIN}"
log "MQTT broker: ${DOMAIN}:1883  user=${MQTT_USER}  (mật khẩu trong .env)"
