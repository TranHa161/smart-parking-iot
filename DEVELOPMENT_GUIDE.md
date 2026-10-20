# Hướng dẫn phát triển dự án: Smart Parking IoT System

Tài liệu này quy định cấu trúc code, quy trình làm việc và cách chạy môi trường phát triển cho từng thành viên (Firmware, Backend, Frontend).

---

## 1. Nguyên tắc làm việc của nhóm (Git workflow)

**Tuyệt đối không sửa code trực tiếp trên server hay push thẳng vào branch `main`.**

Mỗi tính năng mới hoặc bản sửa lỗi, thành viên checkout một branch riêng:

```bash
git checkout main
git pull origin main
git checkout -b feature/<ten-tinh-nang>
```

Sau khi code và test kỹ ở máy cá nhân (local):

```bash
git add .
git commit -m "feat: mo ta ngan gon tinh nang vua lam"
git push origin feature/<ten-tinh-nang>
```

Tạo Pull Request (PR) trên GitHub vào branch `main`. Khi PR được duyệt và merge, GitHub Actions sẽ tự động kéo code về server EC2 và cập nhật phiên bản mới.

---

## 2. Dành cho thành viên Backend (Python)

### A. Vị trí file và quy ước để không lỗi Docker

- Toàn bộ mã nguồn đặt trong thư mục `backend/`.
- File khởi chạy chính bắt buộc là `backend/main.py` với đối tượng `app = FastAPI()` (hoặc Uvicorn entrypoint tương đương).
- Tất cả thư viện mới phải được ghi vào `backend/requirements.txt`.
- Đọc cấu hình từ **biến môi trường** (Environment Variables), không hardcode IP hay mật khẩu:
  - `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
  - `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
  - `MQTT_BROKER`, `MQTT_PORT`, `MQTT_USER`, `MQTT_PASSWORD`

### B. Cách chạy dưới máy local

Khởi động database, cache và broker local bằng Docker:

```bash
docker compose -f docker-compose.local.yml up -d
```

Tạo môi trường ảo Python và cài thư viện:

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Chạy API ở chế độ reload tự động:

```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Kiểm tra: truy cập <http://localhost:8000/docs> để xem tài liệu Swagger API.

---

## 3. Dành cho thành viên Frontend (Angular)

### A. Vị trí file và quy ước để không lỗi Docker

- Toàn bộ dự án Angular đặt trực tiếp bên trong thư mục `frontend/` (sao cho `package.json`, `angular.json`, `tsconfig.json` và thư mục `src/` nằm ngay dưới `frontend/`).
- File `package.json` phải có script build chuẩn:

  ```json
  "scripts": {
    "build": "ng build --configuration=production"
  }
  ```

- Đường dẫn thư mục build xuất ra cấu hình trong `angular.json` phải trỏ về `dist/frontend/browser` (hoặc `dist/frontend`).
- **Đường dẫn gọi API:** không gọi cứng `http://spark-hub.duckdns.org` hay `http://localhost:8000`. Hãy gọi qua đường dẫn tương đối `/api/...` (ví dụ: `/api/parking-slots`). Khi chạy qua Nginx, mọi request có tiền tố `/api/` tự động được chuyển tiếp tới Backend.

### B. Cách chạy dưới máy local

Cài đặt thư viện:

```bash
cd frontend
npm install
```

Chạy giao diện dev:

```bash
npm start
```

Kiểm tra: mở trình duyệt tại <http://localhost:4200>.

---

## 4. Dành cho thành viên Firmware (Gateway / ESP32 / STM32)

Phần cứng giao tiếp với hệ thống thông qua giao thức MQTT.

### A. Thông số kết nối MQTT

- **Broker host:**
  - Test local (cùng mạng với máy dev): dùng IP máy tính của bạn (ví dụ `192.168.1.x`).
  - Test online (qua server staging): `spark-hub.duckdns.org`
- **Port:** `1883` (TCP tiêu chuẩn)
- **Xác thực:**
  - Username: lấy từ biến `MQTT_USER` trong file `.env` (mặc định: `parking_gw`)
  - Password: lấy từ biến `MQTT_PASSWORD` trong file `.env`

### B. Quy ước topic và định dạng dữ liệu (JSON)

**Gateway gửi trạng thái chỗ đỗ (Publish)**

- Topic: `parking/slots/<slot_id>/status`
- Payload mẫu:

  ```json
  {
    "slot_id": "A01",
    "is_occupied": true,
    "distance_cm": 25.4,
    "timestamp": 1729418400
  }
  ```

**Gateway gửi thông tin xe ra/vào từ RFID (Publish)**

- Topic: `parking/gate/entry`
- Payload mẫu:

  ```json
  {
    "card_uid": "E28011700000020",
    "gate_id": "GATE_IN_01",
    "timestamp": 1729418400
  }
  ```

**Backend điều khiển đóng/mở barie (Subscribe)**

- Topic: `parking/gate/control`
- Payload:

  ```json
  {"gate_id": "GATE_IN_01", "action": "OPEN"}
  ```

---

## 5. Quy trình đưa code lên server (deploy thử nghiệm)

Khi bạn muốn đưa các file khung hoặc code ban đầu lên Git để đồng bộ với máy chủ:

1. Commit và đẩy code khung từ máy của bạn lên GitHub:

   ```bash
   git add backend/ frontend/
   git commit -m "chore: setup initial skeleton for backend and frontend"
   git push origin main
   ```

2. Khi code được merge vào `main`, GitHub Actions sẽ tự động kích hoạt tiến trình deploy.

3. Kiểm tra kết quả trên server:
   - Mở trình duyệt: <https://spark-hub.duckdns.org>
   - Kiểm tra log deploy nếu cần:

     ```bash
     docker compose ps
     docker compose logs -f backend
     docker compose logs -f frontend
     ```
