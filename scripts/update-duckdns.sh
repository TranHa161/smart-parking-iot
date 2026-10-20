#!/usr/bin/env bash
# Cập nhật Public IP hiện tại của EC2 lên DuckDNS (không cần Elastic IP).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a; . "$ROOT/.env"; set +a

SUB="${DOMAIN%.duckdns.org}"
IP="$(curl -fsS --max-time 10 https://checkip.amazonaws.com | tr -d '[:space:]')"
RESP="$(curl -fsS --max-time 15 "https://www.duckdns.org/update?domains=${SUB}&token=${DUCKDNS_TOKEN}&ip=${IP}")"

echo "$(date -Is) ip=${IP} duckdns=${RESP}"
[[ "$RESP" == "OK" ]] || exit 1
