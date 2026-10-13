# Hướng dẫn đóng góp (CONTRIBUTING)

Tài liệu này là quy tắc làm việc chung của nhóm trong project **IoT Smart Parking System**. Cả 4 thành viên cần đọc một lần trước khi bắt đầu và làm theo. Nếu thấy quy tắc nào không hợp lý, hãy đề xuất sửa trong một PR vào chính file này.

## Mục lục

1. [Tóm tắt](#1-tóm-tắt)
2. [Phân công và cấu trúc repo](#2-phân-công-và-cấu-trúc-repo)
3. [Chiến lược nhánh](#3-chiến-lược-nhánh)
4. [Quy trình làm một task](#4-quy-trình-làm-một-task)
5. [Quy ước commit](#5-quy-ước-commit)
6. [Pull Request và review](#6-pull-request-và-review)
7. [GitHub Issues](#7-github-issues)
8. [GitHub Project (bảng công việc)](#8-github-project-bảng-công-việc)
9. [Quy tắc riêng cho IoT](#9-quy-tắc-riêng-cho-iot)
10. [Triển khai (Deployments)](#10-triển-khai-deployments)
11. [Bảo mật](#11-bảo-mật)
12. [Phát hành và tag](#12-phát-hành-và-tag)

---

## 1. Tóm tắt

1. **Không bao giờ push trực tiếp lên `main`.** Mọi thay đổi đi qua Pull Request.
2. **Mỗi việc = một Issue = một nhánh = một PR.**
3. Tên nhánh: `loại/số-issue-mô-tả-ngắn`, ví dụ `feature/12-stm32-ultrasonic-sensor`.
4. Commit theo dạng `loại(phạm-vi): mô tả`, ví dụ `feat(firmware): doc khoang cach tu HC-SR04`.
5. PR phải ghi `Closes #số-issue` và cần **ít nhất 1 người khác review** mới được merge.
6. Merge bằng **Squash and merge**, sau đó xóa nhánh.
7. **Không commit** mật khẩu WiFi, MQTT, API key. Dùng file `*.example`.
8. Nhánh sống ngắn (1-3 ngày), thường xuyên cập nhật từ `main`.

---

## 2. Phân công và cấu trúc repo

Dự án dùng **một repo duy nhất (monorepo)**:

```
.
├── firmware/    # Code STM32F401RE, cảm biến, kết nối MQTT
├── backend/     # Server, xử lý MQTT, API, database
├── frontend/    # Dashboard / giao diện người dùng
├── hardware/    # Sơ đồ mạch, BOM, ảnh đấu dây
├── deployments/ # Cloud & DevOps: Docker, cấu hình broker, script triển khai
├── docs/        # Báo cáo, kiến trúc, tài liệu hướng dẫn
└── .github/     # Template, CODEOWNERS, workflow CI/CD
```

Mỗi mảng có một người phụ trách chính. Người phụ trách là người **review đầu tiên** cho thay đổi trong mảng đó, nhưng ai cũng có thể làm task ở mọi mảng.

| Mảng | Phụ trách chính |
|---|---|
| firmware / hardware | _Thúy_ |
| backend | _Trang_ |
| frontend | _Phương_ |
| docs / deployments | _Trân_ |

> Khi cần sửa file dùng chung (cấu hình, README, CI, giao thức MQTT, biến môi trường, cổng và địa chỉ broker), **báo trong nhóm trước** để tránh hai người sửa cùng lúc.

---

## 3. Chiến lược nhánh

Nhóm dùng **GitHub Flow**.

- **`main`**: luôn ở trạng thái chạy được, dùng để demo và nộp bài. Được bảo vệ, không push trực tiếp.
- **Nhánh làm việc**: tạo từ `main`, gắn với một issue, sống ngắn, merge xong thì xóa.

Không dùng nhánh `develop`, `release` hay `hotfix`. Nếu `main` hỏng, sửa bằng một nhánh `fix/...` như bình thường (ưu tiên merge nhanh).

### Quy ước đặt tên nhánh

Công thức: **`<loại>/<số-issue>-<mô-tả-ngắn>`**

| Loại | Dùng khi | Ví dụ |
|---|---|---|
| `feature/` | Thêm tính năng mới | `feature/15-mqtt-publish-slot-status` |
| `fix/` | Sửa lỗi | `fix/23-sensor-false-detection` |
| `docs/` | Chỉ sửa tài liệu | `docs/30-update-wiring-diagram` |
| `refactor/` | Tái cấu trúc, không đổi hành vi | `refactor/34-split-mqtt-module` |
| `chore/` | Cấu hình, CI, công cụ, dependency | `chore/31-setup-ci` |
| `test/` | Thêm hoặc sửa test | `test/40-sensor-filter-tests` |

Quy tắc đặt tên:

- Chữ thường, ngăn cách bằng dấu gạch ngang `-`, **tiếng Anh**, không khoảng trắng.
- Mô tả ngắn gọn (2-5 từ), nói được nhánh làm gì.
- Luôn có số issue. Nếu chưa có issue, hãy tạo issue trước.
- Việc trong `deployments/` thường dùng `chore/` (Docker, CI/CD, cấu hình) hoặc `feature/` (thêm khả năng triển khai mới), ví dụ `chore/45-docker-compose-backend`, `feature/50-deploy-backend-cloud`.

---

## 4. Quy trình làm một task

### Bước 1: Có issue và nhận việc

- Việc nào cũng phải có Issue (xem [mục 7](#7-github-issues)).
- Gán chính mình (**Assignee**) vào issue, kéo thẻ sang cột **In Progress**.
- Một người không nhận quá **2 issue đang mở** cùng lúc để tránh làm dở dang.

### Bước 2: Tạo nhánh từ `main` mới nhất

```bash
git checkout main
git pull origin main
git checkout -b feature/12-stm32-ultrasonic-sensor
```

### Bước 3: Làm việc và commit thường xuyên

Commit nhỏ, mỗi commit làm một việc, theo [quy ước commit](#5-quy-ước-commit). Đẩy nhánh lên GitHub ít nhất cuối mỗi buổi làm để người khác thấy tiến độ và không mất code.

```bash
git add <file>
git commit -m "feat(firmware): doc khoang cach tu HC-SR04"
git push -u origin feature/12-stm32-ultrasonic-sensor
```

### Bước 4: Cập nhật từ `main` trước khi mở PR

```bash
git fetch origin
git rebase origin/main      # hoặc: git merge origin/main
```

Chọn **một** cách (rebase hoặc merge) và dùng thống nhất. Nếu chưa quen rebase, dùng `git merge origin/main` cho an toàn. Nếu đã push nhánh lên rồi mà rebase, cần `git push --force-with-lease` (chỉ dùng cho **nhánh của chính mình**, tuyệt đối không dùng cho `main`).

### Bước 5: Mở Pull Request

- Điền đầy đủ PR template, ghi `Closes #12`.
- Kéo issue sang **In Review**, chọn reviewer.
- Nếu chưa xong nhưng muốn nhận góp ý sớm, mở dạng **Draft PR**.

### Bước 6: Review, sửa, merge

- Sửa theo góp ý, push thêm commit vào cùng nhánh (PR tự cập nhật).
- Khi đủ approval và mọi comment đã được giải quyết, **người tạo PR** bấm **Squash and merge**.
- Xóa nhánh (đã bật tự động xóa), rồi `git checkout main && git pull`.

---

## 5. Quy ước commit

Theo chuẩn **Conventional Commits**:

```
<loại>(<phạm-vi>): <mô tả ngắn>

[nội dung chi tiết, nếu cần]
```

**Loại (type):**

| Type | Ý nghĩa |
|---|---|
| `feat` | Thêm tính năng |
| `fix` | Sửa lỗi |
| `docs` | Tài liệu |
| `refactor` | Tái cấu trúc code, không đổi hành vi |
| `test` | Thêm / sửa test |
| `chore` | Việc vặt: cấu hình, dependency, CI |
| `style` | Format code, không đổi logic |

**Phạm vi (scope)** nên là một trong: `firmware`, `backend`, `frontend`, `hardware`, `deployments`, `docs`.

**Ví dụ tốt:**

```
feat(firmware): doc khoang cach tu HC-SR04
fix(firmware): loc nhieu cam bien bang trung binh 5 mau
feat(backend): luu trang thai o do vao database
docs(hardware): them so do dau day STM32F401RE voi cam bien
chore: them .gitignore cho firmware STM32
chore(deployments): them docker-compose cho backend va MQTT broker
fix(deployments): sua cong MQTT trong cau hinh compose
```

**Ví dụ chưa tốt:**

```
update
fix bug
final
asdf
sửa nhiều thứ
```

Quy tắc:

- Dòng đầu tối đa khoảng **72 ký tự**, viết ở thể mệnh lệnh ("thêm", "sửa", "add", "fix"), không kết thúc bằng dấu chấm.
- Nhóm thống nhất dùng **một ngôn ngữ** cho phần mô tả (tiếng Việt không dấu hoặc tiếng Anh) để lịch sử gọn gàng. Phần `type` luôn viết tiếng Anh.
- Mỗi commit chỉ làm một việc. Không gộp "sửa lỗi + đổi tên file + thêm tính năng" vào một commit.
- Vì dùng Squash and merge, **tiêu đề PR** sẽ trở thành commit trên `main`, nên tiêu đề PR cũng phải theo quy ước này.

---

## 6. Pull Request và review

### Quy tắc cho người tạo PR

- PR **nhỏ và tập trung**: lý tưởng dưới ~300 dòng thay đổi, chỉ giải quyết một issue.
- Điền đủ PR template. Với firmware, **ghi rõ đã test trên board nào, cảm biến nào**, kèm log hoặc ảnh/video nếu có.
- Với thay đổi trong `deployments/`, **ghi rõ đã chạy thử thế nào** (ví dụ `docker compose up` chạy được trên máy sạch, workflow CI chạy xanh) và báo nhóm nếu đổi cổng, địa chỉ broker hoặc biến môi trường.
- Tự đọc lại diff của mình một lượt trước khi nhờ người khác review.
- Không đưa vào PR: file build, file tạm, `secrets.h`, `.env`, thay đổi format hàng loạt không liên quan.
- Không merge PR của chính mình khi chưa có approval.

### Quy tắc cho người review

- Phản hồi trong vòng **24 giờ** (trừ khi báo bận). Nếu không kịp, báo để đổi người.
- Review những thứ sau: logic đúng chưa, có ảnh hưởng chỗ khác không, có lộ bí mật không, tên biến và hàm dễ hiểu không.
- Góp ý cụ thể và lịch sự, nói rõ **vì sao**. Phân biệt rõ:
  - **Cần sửa** (chặn merge) và **gợi ý** (có thể bỏ qua), ví dụ ghi tiền tố `nit:` cho góp ý nhỏ.
- Chọn đúng trạng thái: **Approve** khi ổn, **Request changes** khi có vấn đề phải sửa, **Comment** khi chỉ trao đổi.
- Với code firmware không thể kiểm tra bằng mắt, hãy hỏi lại bằng chứng đã test trên thiết bị thật.
- Với PR trong `deployments/`, xem kỹ: có lộ bí mật không, có mở cổng hoặc cấp quyền quá rộng không, có làm phát sinh chi phí cloud không. Nếu thay đổi ảnh hưởng mảng khác (ví dụ cổng backend), thêm người phụ trách mảng đó làm reviewer.

### Điều kiện để được merge

- [ ] Có **ít nhất 1 approval** từ người khác (ưu tiên code owner của mảng đó)
- [ ] Mọi review comment đã được giải quyết (resolved)
- [ ] Nhánh đã cập nhật với `main` và không còn conflict
- [ ] Các kiểm tra tự động (nếu có) đều pass
- [ ] PR có liên kết issue (`Closes #...`)

---

## 7. GitHub Issues

**Mọi công việc đều phải có issue**, kể cả việc nhỏ như sửa tài liệu. Dùng form có sẵn (Tính năng / Báo lỗi) khi bấm *New issue*.

### Một issue tốt cần có

- **Tiêu đề** rõ ràng, bắt đầu bằng động từ, ví dụ: "Đọc khoảng cách từ HC-SR04 và xác định ô trống".
- **Mô tả**: cần làm gì và vì sao.
- **Tiêu chí hoàn thành** dạng checklist, để ai cũng biết khi nào xong.
- **Assignee**, **Label**, **Milestone**.

### Label chuẩn

| Nhóm | Label |
|---|---|
| Phạm vi | `firmware`, `backend`, `frontend`, `hardware`, `deployments`, `docs` |
| Loại | `feature`, `bug`, `chore`, `question` |
| Độ ưu tiên | `priority: high`, `priority: medium`, `priority: low` |
| Trạng thái đặc biệt | `blocked`, `help wanted`, `good first issue` |

### Quy tắc

- Issue quá lớn (ước tính hơn 3 ngày) thì **tách nhỏ** thành nhiều issue.
- Khi bị chặn bởi việc khác, gắn label `blocked` và ghi rõ chờ issue/người nào (`Blocked by #12`).
- Dùng `Closes #số` trong PR để issue tự đóng, không tự bấm đóng tay trừ khi hủy việc đó (ghi lý do).
- Thảo luận kỹ thuật ghi ngay trong issue để lưu lại lịch sử quyết định, đừng chỉ nói qua chat riêng.

---

## 8. GitHub Project (bảng công việc)

Dùng **Board** với các cột:

| Cột | Ý nghĩa |
|---|---|
| **Backlog** | Ý tưởng, việc chưa lên kế hoạch |
| **Todo** | Đã rõ yêu cầu, sẵn sàng để nhận trong sprint hiện tại |
| **In Progress** | Đang có người làm (đã có nhánh) |
| **In Review** | Đã mở PR, chờ review |
| **Done** | PR đã merge, issue đã đóng |

Quy tắc:

- Thẻ phải **phản ánh đúng thực tế**. Bắt đầu làm thì kéo sang In Progress, mở PR thì sang In Review.
- Bật workflow tự động trong Project: PR merged hoặc issue closed thì thẻ chuyển sang **Done**.

---

## 9. Quy tắc riêng cho IoT

### Test phần cứng

- PR firmware phải nêu rõ: **board** (ví dụ NUCLEO-F401RE), **cảm biến**, **module kết nối** (WiFi, Ethernet hoặc SIM, nếu có), **công cụ và phiên bản thư viện** (ví dụ STM32CubeIDE, gói STM32CubeF4), cách nạp (ví dụ ST-Link) và kết quả quan sát.
- Nếu một bản firmware chưa test được trên thiết bị thật, ghi rõ trong PR là **chưa kiểm chứng** và để Draft.
- Không merge firmware làm board treo, reset liên tục hoặc spam MQTT.

### Giao thức dữ liệu dùng chung

Firmware, backend, frontend và deployments (cấu hình broker, cổng) phải thống nhất **MQTT topic** và **định dạng payload**. Ghi lại trong `docs/` (ví dụ `docs/mqtt-protocol.md`). Ví dụ gợi ý để nhóm chốt:

```
Topic:   parking/<ma-bai>/<ma-o>/status
Payload: {"slot":"A01","occupied":true,"distance_cm":12,"ts":1760000000}
```

Khi cần đổi topic hoặc payload: **mở issue, báo cả nhóm, cập nhật tài liệu cùng PR**, vì thay đổi này làm hỏng các mảng còn lại nếu không đồng bộ.

### Quy ước code

- Tên biến, hàm, file nhất quán trong từng mảng (ví dụ firmware dùng `snake_case` hoặc `camelCase`, chọn một và giữ).
- Không để **số ma thuật**: đặt hằng số có tên cho ngưỡng khoảng cách, chân GPIO, chu kỳ gửi dữ liệu.
- Comment giải thích **vì sao**, không chỉ **cái gì**, nhất là chỗ dính đến phần cứng (chân, điện áp, thời gian chờ).
- Xóa code debug và đoạn code bị comment-out thừa trước khi mở PR.

### Firmware STM32 (CubeIDE / CubeMX)

- **Luôn commit** file `.ioc` (cấu hình chân, clock, ngoại vi của CubeMX) cùng `.project` và `.cproject`. **Không commit** thư mục build (`Debug/`, `Release/`) và file sinh ra khi biên dịch (`*.o`, `*.elf`, `*.map`).
- Khi CubeMX sinh lại code, mọi thứ nằm ngoài các khối `/* USER CODE BEGIN ... */` và `/* USER CODE END ... */` sẽ bị ghi đè. Code của nhóm chỉ viết trong các khối này hoặc trong file riêng (ví dụ `Core/Src/sensor.c`).
- File `.ioc` và `main.c` rất dễ conflict và khó gộp. **Báo trong nhóm trước** khi sửa hai file này để không ai sửa cùng lúc.
- Ghi phiên bản STM32CubeIDE, CubeMX và gói STM32CubeF4 đang dùng trong `firmware/README.md` để mọi người dùng giống nhau.

### Phần cứng

- Sơ đồ đấu dây, ảnh, danh sách linh kiện (BOM) để trong `hardware/` và **cập nhật cùng lúc** khi đổi chân hoặc linh kiện.
- Ghi rõ chân GPIO đang dùng trong README của `firmware/` để không ai đấu nhầm.

---

## 10. Triển khai (Deployments)

Thư mục `deployments/` chứa mọi thứ để chạy hệ thống ngoài máy cá nhân: Dockerfile, `docker-compose.yml`, cấu hình MQTT broker, script triển khai, cấu hình hạ tầng cloud. Người phụ trách chính: **Trân** (xem [mục 2](#2-phân-công-và-cấu-trúc-repo)).

### Nguyên tắc chung

- **Mọi thứ phải dựng lại được từ repo.** Người mới clone về, làm theo `deployments/README.md` là chạy được hệ thống. Không cấu hình "bằng tay" trên server mà không ghi lại.
- Thay đổi hạ tầng đi qua PR như code. Không sửa thẳng trên server hoặc cloud console rồi quên cập nhật vào repo. Nếu bắt buộc sửa khẩn cấp, mở PR ghi lại ngay sau đó.
- Người phụ trách review đầu tiên. Thay đổi ảnh hưởng mảng khác (cổng backend, biến môi trường, địa chỉ broker) thì thêm người phụ trách mảng đó làm reviewer.

### CI/CD

- Dùng GitHub Actions: kiểm tra (build, lint) khi mở PR, triển khai khi merge vào `main` hoặc khi tạo tag. Nhóm chọn một cách và ghi vào `deployments/README.md`.
- PR sửa workflow nên được thử trước trên nhánh (ví dụ chạy thủ công bằng `workflow_dispatch`) để không làm hỏng `main`.
- Thông tin nhạy cảm cho CI/CD dùng **GitHub Secrets**, không viết thẳng vào file workflow.

### Docker

- Ghi cố định phiên bản image (ví dụ `eclipse-mosquitto:2`), tránh dùng `latest` để mọi người chạy giống nhau.
- Không để mật khẩu trong `docker-compose.yml`, đọc từ file `.env`.
- Trước khi mở PR, kiểm tra `docker compose up` chạy được trên máy sạch và `docker compose down` dọn được.

### Cloud

- Người phụ trách deployments giữ quyền quản trị tài khoản cloud. Thành viên khác chỉ được cấp quyền cần thiết.
- **Bật cảnh báo chi phí** (budget alert) và **tắt hoặc xóa tài nguyên không dùng** (máy ảo, database, IP tĩnh) sau khi demo để không phát sinh phí.
- MQTT broker không cho truy cập ẩn danh. Chỉ mở những cổng cần thiết (ví dụ 8883 cho MQTT qua TLS; 1883 là cổng không mã hóa, chỉ mở khi thật sự cần) và ghi danh sách cổng đang mở trong `deployments/README.md`.
- Ghi lại địa chỉ (URL hoặc IP) và phiên bản đang chạy trong README hoặc ghi chú Release. Không ghi mật khẩu.

### Checklist khi sửa `deployments/`

- [ ] Đã chạy thử triển khai thành công (ghi cách thử trong PR)
- [ ] Không lộ bí mật (credential cloud, `.env`, `.pem`, `.tfstate`)
- [ ] Đã cập nhật `deployments/README.md` nếu đổi cách chạy
- [ ] Đã báo nhóm nếu đổi cổng, địa chỉ broker hoặc biến môi trường
- [ ] Không phát sinh chi phí cloud ngoài dự kiến

---

## 11. Bảo mật

**Tuyệt đối không commit:** mật khẩu WiFi, tài khoản và mật khẩu MQTT, API key, token, chuỗi kết nối database, chứng chỉ riêng tư.

- Dùng file mẫu được commit: `firmware/include/secrets.example.h` và `.env.example`.
- File thật (`secrets.h`, `.env`) mỗi người tự tạo trên máy mình và đã nằm trong `.gitignore`.
- Với `deployments/` và cloud: không commit khóa SSH, file `.pem`, credential của nhà cung cấp cloud, `*.tfstate` hoặc `*.tfvars` chứa giá trị thật (nếu dùng Terraform). Dùng **GitHub Secrets** cho CI/CD.
- Khi dán log hoặc ảnh chụp màn hình vào issue/PR, **kiểm tra xem có lộ mật khẩu hay IP nội bộ không**.

---

## 12. Phát hành và tag

- Khi có bản ổn định để demo hoặc nộp, gắn **tag** trên `main`, theo dạng `vMAJOR.MINOR.PATCH`:
  - `v0.1.0`: đọc được cảm biến, gửi MQTT
  - `v0.2.0`: có backend và lưu dữ liệu
  - `v1.0.0`: bản demo hoàn chỉnh
- Tạo **Release** trên GitHub kèm ghi chú những gì đã có, những gì còn hạn chế.
- Bản chạy trên cloud khi demo nên triển khai từ một **tag** (ví dụ `v1.0.0`), không phải từ nhánh đang sửa dở. Ghi bản đang chạy vào ghi chú Release để biết quay về đâu khi có sự cố.

```bash
git checkout main && git pull
git tag -a v1.0.0 -m "Ban demo cuoi ky"
git push origin v1.0.0
```

---

## Cam kết của cả nhóm

- PR nhỏ, mô tả rõ, review nhanh.
- Có vấn đề thì nói sớm.
- Quy tắc nào chưa phù hợp thì cùng sửa trong file này.
