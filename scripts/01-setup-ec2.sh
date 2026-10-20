#!/usr/bin/env bash
# Chạy 1 LẦN trên EC2 Ubuntu 24.04 mới:  sudo ./scripts/01-setup-ec2.sh
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Hãy chạy bằng sudo."; exit 1; }
TARGET_USER="${SUDO_USER:-ubuntu}"
SWAP_SIZE="${SWAP_SIZE:-4G}"
export DEBIAN_FRONTEND=noninteractive

log() { printf '\033[1;32m[setup]\033[0m %s\n' "$*"; }

log "Cập nhật hệ thống..."
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg git cron openssl util-linux

timedatectl set-timezone Asia/Ho_Chi_Minh || true

# ---- Swap (tránh OOM trên t3.micro 1 GB RAM) ----
if ! swapon --show=NAME --noheadings | grep -q '^/swapfile'; then
  log "Tạo swapfile ${SWAP_SIZE}..."
  fallocate -l "$SWAP_SIZE" /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=4096 status=none
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
else
  log "Swapfile đã có, bỏ qua."
fi
cat > /etc/sysctl.d/99-swap.conf <<'SYS'
vm.swappiness=20
vm.vfs_cache_pressure=50
SYS
sysctl --system >/dev/null

# ---- Docker Engine + Compose plugin (repo chính thức) ----
if ! command -v docker >/dev/null 2>&1; then
  log "Cài Docker Engine..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
  log "Docker đã được cài."
fi

# Giới hạn log container để không đầy ổ đĩa 30 GB
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
JSON
systemctl enable --now docker
systemctl restart docker

usermod -aG docker "$TARGET_USER"
systemctl enable --now cron

log "Xong. Hãy ĐĂNG XUẤT rồi SSH lại (để nhóm docker có hiệu lực), sau đó chạy ./scripts/02-init.sh"
docker --version
docker compose version
free -h
