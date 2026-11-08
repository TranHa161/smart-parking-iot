# Smart Parking IoT — FastAPI backend

Backend cho mô hình STM32F401RE + gateway Wi-Fi + MQTT. Bản hiện tại tách xác thực QR, RFID vào, yêu cầu thanh toán và xác nhận xe đã ra.

## Chạy local

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
# Tạo .env từ .env.example nếu chưa có; giữ nguyên .env đang dùng.
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

`DATABASE_URL` đọc từ `.env` hoặc môi trường; mặc định SQLite. Database mới được migration tạo schema và app khởi tạo 4 slot mẫu. Swagger: http://localhost:8000/docs. Muốn mô phỏng MQTT cần Mosquitto đang chạy.

Database cũ: sao lưu và dừng backend trước khi chạy `alembic upgrade head`. Migration tự nhận diện schema gốc, giữ lịch sử đã thanh toán, sửa slot bị giữ bởi booking hết hạn. Nếu còn phiên cũ đang mở/chưa trả tiền hoặc booking có nhiều phiên, migration dừng để người vận hành đối soát; không tự đóng phiên, thu tiền hoặc xóa dữ liệu. Chưa có downgrade tự động; phục hồi từ bản sao lưu khi cần. Không dùng `stamp head` để bỏ qua thay đổi schema.

## Docker Compose

```bash
cd backend
docker compose up -d --build
docker compose logs -f backend
```

Container đợi PostgreSQL khỏe, chạy migration rồi khởi động một worker Uvicorn. Mật khẩu mẫu và broker anonymous trong Compose hiện dành cho môi trường phát triển; bước phân quyền/TLS cloud chưa triển khai trong đợt sửa này. Không dùng `--workers` nhiều hơn 1 vì MQTT client và WebSocket vẫn thuộc một process.

## Quy tắc nghiệp vụ

- `PENDING`: giữ slot và QR trong `BOOKING_EXPIRATION_MINUTES` (mặc định 15 phút).
- Quét QR đúng hạn: chuyển `VERIFIED`, cấp thẻ đã đăng ký, chưa tính giờ và chưa mở cổng. Mốc no-show của QR dừng tại đây.
- Sau khi cấp thẻ, khách có `ENTRY_AUTHORIZATION_MINUTES` (mặc định 15 phút riêng) để quẹt IN. Quá hạn này, quyền vào bị hủy, thẻ và slot được hoàn trả nếu không có xe.
- Khách vãng lai được cấp một slot nội bộ để giữ sức chứa trước khi quẹt IN. Cần đỗ đúng slot được cấp; cảm biến siêu âm không tự nhận diện xe.
- RFID IN: chỉ dùng quyền được cấp, bắt đầu tính giờ, phát lệnh mở cổng. Quẹt lặp không tạo phiên hoặc lệnh mới.
- RFID OUT: chốt báo phí theo giờ làm tròn lên, tối thiểu 1 giờ, chuyển `PAYMENT_PENDING`; chưa ghi `time_out`. Quẹt OUT lặp giữ nguyên báo phí. `HOURLY_RATE` mặc định 10.000 VND.
- Xác nhận thu tiền chỉ hợp lệ sau OUT; chuyển `PAID`, phát một lệnh mở cổng ra. Yêu cầu lặp không thu tiền hay mở cổng thêm.
- Sau khi xe qua cổng, thiết bị/bảo vệ gọi `/api/gate/exit/confirm`: chuyển `EXITED`, ghi `time_out`, hoàn trả thẻ. Chưa có tích hợp ACK/cảm biến làn cổng tự động.
- Có xe vật lý → đỏ; không có xe nhưng còn quyền giữ/lượt hoạt động → vàng; không có xe và không còn giữ chỗ → xanh. Vì vậy slot có thể vẫn vàng lúc xe đang di chuyển ra cổng; chỉ được bán lại sau khi lượt ra kết thúc.
- Các chuyển trạng thái dùng một hàng khóa DB cho bãi mô hình và index unique cho thẻ/slot đang hoạt động. Phát LED/WebSocket sau commit. Chưa có outbox/ACK bảo đảm giao lệnh sau sự cố.

`command_sent=true` chỉ nghĩa là MQTT client đã chấp nhận gửi lệnh; không xác nhận servo đã quay. Offline trả `false`. Nếu lệnh thất bại, bảo vệ kiểm tra thực tế rồi dùng override có chủ ý; gọi lại xác nhận thanh toán không phát lệnh mới.

## Thử một lượt xe trên Swagger

1. `POST /api/gate/cards`, body `{"card_uid":"TEST_CARD_01"}` để đăng ký thẻ. Thẻ lạ không tự được chấp nhận.
2. Chọn một trong hai cách cấp thẻ:
   - Đặt trước: `POST /api/bookings`, body `{"phone_number":"0912345678"}` (hoặc thêm `"slot_id":1`). Lấy `qr_code_token`, gọi `POST /api/bookings/verify` với `{"qr_code_token":"TOKEN_VUA_NHAN","rfid_card_uid":"TEST_CARD_01"}`.
   - Vãng lai: `POST /api/gate/walk-ins`, body `{"card_uid":"TEST_CARD_01","slot_id":1}`.
3. Lưu `session_id`. Gọi `POST /api/gate/rfid-swipe`, body `{"gate":"IN","card_uid":"TEST_CARD_01"}`.
4. Chạy `python scripts/hardware_simulator.py`, mô phỏng xe đỗ/rời đúng slot đã cấp. Simulator không tự cấp thẻ; nút quẹt thẻ chỉ dùng được sau bước 1–2.
5. Gọi `/api/gate/rfid-swipe` với `{"gate":"OUT","card_uid":"TEST_CARD_01"}` để lấy phí.
6. Gọi `POST /api/gate/payment/confirm`, body `{"session_id":1}`; thay 1 bằng ID thực tế.
7. Sau khi xe đã qua cổng, gọi `POST /api/gate/exit/confirm`, body `{"session_id":1}`.
8. Xem `/api/gate/sessions` và `/api/slots`. Thử lặp IN, OUT và payment để kiểm tra không tạo thêm phiên/lệnh.

API guard/admin và WebSocket chưa có phân quyền trong bước 1–2. Chỉ chạy thử trong môi trường phát triển; cần hoàn thiện bước phân quyền trước khi đưa lên cloud.

## MQTT và WebSocket

Topic giữ nguyên để tương thích firmware/simulator:

| Topic | Chiều | Payload |
|---|---|---|
| `parking/slot/{id}/occupancy` | Thiết bị → server | `{"slot_id":1,"occupied":true,"distance_cm":15}` |
| `parking/slot/{id}/led_cmd` | Server → thiết bị | `{"slot_id":1,"color":"YELLOW"}` |
| `parking/gate/rfid_read` | Thiết bị → server | `{"gate":"IN","card_uid":"TEST_CARD_01"}` |
| `parking/gate/barrier_cmd` | Server → thiết bị | `{"gate":"OUT","action":"OPEN","duration_seconds":5}` |

`occupied` phải là boolean JSON; `slot_id` nếu có phải khớp topic. Gate chỉ IN/OUT. UID bỏ khoảng trắng hai đầu và chuyển chữ hoa.

WebSocket `/ws/parking` phát `SLOT_UPDATED`, `BOOKING_VERIFIED` (thay sự kiện cũ mở cổng ngay khi QR), `BOOKING_EXPIRED`, `ENTRY_EXPIRED`, `GATE_EVENT`, `PAYMENT_REQUIRED`, `PAYMENT_CONFIRMED`, `VEHICLE_EXITED`. Phiên được cấp thẻ có `time_in=null`. Frontend dùng `status`, không suy luận thanh toán/ra bãi chỉ từ `time_out`.

## Kiểm thử

```bash
cd backend
.venv/bin/python -m pytest -q
```

Tests dùng DB tạm, không dùng database trong `.env`, mock lệnh MQTT và WebSocket. Bao gồm luồng hai loại khách, hạn QR/quyền vào, thanh toán và sự kiện lặp, cạnh tranh chỗ cuối, API/schema và migration dữ liệu cũ. Chạy cùng bộ nghiệp vụ với PostgreSQL riêng bằng biến `PARKING_TEST_POSTGRES_URL`; mỗi test tạo/xóa schema ngẫu nhiên. Tests migration tự tạo SQLite tạm.

```bash
PARKING_TEST_POSTGRES_URL=postgresql+asyncpg://USER:PASS@localhost:PORT/TEST_DB .venv/bin/python -m pytest -q
```

Kết quả kiểm tra ngày 19/10/2026: 18 ca đạt trên SQLite; 18 ca đạt khi nghiệp vụ chạy trên PostgreSQL 15 (tests migration vẫn dùng SQLite tạm). Migration PostgreSQL và lượt API đầy đủ qua startup/shutdown đều đạt trên DB mới riêng. `docker compose config --quiet` và `pip check` đạt. Các lệnh MQTT được mock trong kiểm thử, chưa kiểm chứng servo/cảm biến hoặc kết nối broker thực tế.
