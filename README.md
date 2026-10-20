# Smart Parking IoT

Stack: Python (backend) · Angular (frontend) · PostgreSQL 16 · Redis 7 · Mosquitto 2 (MQTT) · Nginx + Let's Encrypt · DuckDNS · AWS EC2 (Ubuntu 24.04).

```
Thiết bị/Gateway ──MQTT :1883──► Mosquitto ◄──► Backend (Python) ◄──► PostgreSQL / Redis
Trình duyệt ──HTTPS──► Nginx ──/api, /ws──► Backend      (Nginx cũng phục vụ file Angular)
```

## Quy trình làm việc (cả nhóm)
1. Không sửa code trên server, không push thẳng vào `main`.
2. `git checkout -b feature/ten-tinh-nang` → code ở máy cá nhân → push → mở Pull Request.
3. Review xong thì Merge vào `main` → GitHub Actions tự động deploy lên EC2.

## A. Thành viên mới: chạy local
```bash
git clone <URL-repo> && cd <repo>

# 1) Dựng Postgres, Redis, Mosquitto (chỉ bind 127.0.0.1)
docker compose -f docker-compose.local.yml up -d

# 2) Backend (ví dụ FastAPI) — chạy trực tiếp trên máy
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
export DATABASE_URL=postgresql://parking:parking_dev@localhost:5432/parking
export REDIS_URL=redis://localhost:6379/0
export MQTT_HOST=localhost MQTT_PORT=1883
uvicorn app.main:app --reload --port 8000

# 3) Frontend
cd ../frontend && npm ci && npx ng serve --proxy-config proxy.conf.json
```
`frontend/proxy.conf.json` (tạo trong project Angular) để gọi API/WS khi dev:
```json
{
  "/api": { "target": "http://localhost:8000", "secure": false },
  "/ws":  { "target": "ws://localhost:8000", "ws": true, "secure": false }
}
```
Test MQTT local: `docker compose -f docker-compose.local.yml exec mosquitto mosquitto_pub -t test -m hello`.
Tắt: `docker compose -f docker-compose.local.yml down` (thêm `-v` để xoá dữ liệu).

## B. Thiết lập server lần đầu

### B1. AWS EC2
- Instance **t3.micro** (hoặc t2.micro), Ubuntu 24.04 LTS, ổ gp3 **30 GB**, tạo/gán key pair.
- Security Group (inbound): **22** (SSH), **80**, **443**, **1883** (MQTT). Mở 22 cho `0.0.0.0/0` thì GitHub Actions mới SSH vào được (chỉ đăng nhập bằng key); có thể hạn chế bằng cách khác nếu muốn.
- Không dùng Elastic IP: IP đổi sau mỗi lần stop/start và DuckDNS tự cập nhật (cron mỗi 5 phút).

### B2. DuckDNS
Đăng nhập duckdns.org, tạo subdomain (vd `myparking`) và lấy **token**.

### B3. Cài đặt trên server
```bash
ssh -i key.pem ubuntu@<IP-EC2>

# Deploy key (read-only) để server kéo code từ repo private
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub     # GitHub repo → Settings → Deploy keys → Add (KHÔNG tick write)
printf 'Host github.com\n  IdentityFile ~/.ssh/github_deploy\n  IdentitiesOnly yes\n' >> ~/.ssh/config
ssh -T git@github.com            # gõ yes

git clone git@github.com:<org>/<repo>.git smart-parking && cd smart-parking
sudo ./scripts/01-setup-ec2.sh   # swap 4GB, Docker; xong thì ĐĂNG XUẤT và SSH lại
./scripts/02-init.sh             # hỏi domain, token, email → .env, SSL, cron, chạy hệ thống
```
Muốn thử SSL trước (tránh chạm giới hạn Let's Encrypt): `CERTBOT_STAGING=1 ./scripts/02-init.sh`, sau đó xoá thư mục `certbot/` (`sudo rm -rf certbot`) và chạy lại không có biến này.

### B4. GitHub Secrets cho CI/CD
Repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Giá trị |
|---|---|
| `EC2_HOST` | tên miền DuckDNS (vd `myparking.duckdns.org`) |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | nội dung private key (PEM/OpenSSH) dùng để SSH vào EC2 |
| `EC2_APP_DIR` | (tuỳ chọn) mặc định `/home/ubuntu/smart-parking` |


## C. Vận hành
```bash
docker compose ps                      # trạng thái
docker compose logs -f backend         # xem log
docker compose restart backend
free -h && docker stats --no-stream    # kiểm tra RAM
./scripts/deploy.sh                    # deploy tay
```
Thiết bị kết nối MQTT: host `<DOMAIN>`, cổng `1883`, user/password trong `.env` (`MQTT_USER`, `MQTT_PASSWORD`).
Test: `mosquitto_pub -h <DOMAIN> -p 1883 -u parking_gw -P '<mật khẩu>' -t test -m hi`.
