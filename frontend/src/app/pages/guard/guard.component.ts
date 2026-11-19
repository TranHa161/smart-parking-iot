import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { BookingService } from '../../services/booking.service';
import { GatewayStatus, ParkingSessionItem, SessionStatus, SlotItem } from '../../models/parking.models';

@Component({
  selector: 'app-guard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ButtonModule],
  template: `
    <div class="shell">
      <header class="topbar">
        <a class="brand" routerLink="/guard"><span class="brand-mark"><i class="pi pi-shield"></i></span> ParkSmart Guard</a>
        <nav class="nav">
          <a *ngIf="isAdmin" routerLink="/admin">Dashboard Quản trị</a>
          <a class="active" routerLink="/guard">Trạm Bảo vệ</a>
          <a routerLink="/home">Trang chủ</a>
          <span style="font-size:12px;color:var(--muted)">{{ guardName }}</span>
          <button pButton type="button" severity="secondary" [outlined]="true" (click)="logout()">Đăng xuất</button>
        </nav>
      </header>

      <main class="page">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
          <div>
            <div class="eyebrow">GUARD & GATE CONTROL</div>
            <h1>Trạm Bảo vệ & Điều khiển Cổng</h1>
            <p class="lead">Quản lý cấp thẻ RFID (QR đặt trước / vãng lai), thu phí và điều khiển Barrier thời gian thực.</p>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span class="session-badge" [style.background]="gatewayStatus?.mqtt_connected ? '#dcfce7' : '#fee2e2'" [style.color]="gatewayStatus?.mqtt_connected ? '#166534' : '#991b1b'">
              MQTT: {{ gatewayStatus?.mqtt_connected ? 'Đã kết nối' : 'Offline' }}
            </span>
            <span class="session-badge" [style.background]="gatewayStatus?.gateway_online ? '#dcfce7' : '#fef3c7'" [style.color]="gatewayStatus?.gateway_online ? '#166534' : '#92400e'">
              ESP32/STM32: {{ gatewayStatus?.gateway_online ? 'Online' : 'Chờ tín hiệu' }}
            </span>
          </div>
        </div>

        <div class="notice" *ngIf="bannerMessage" style="margin-bottom:20px">
          <i class="pi pi-bell"></i>
          <span>{{ bannerMessage }}</span>
        </div>
        <p class="error-text" *ngIf="errorMessage" style="margin-bottom:16px;font-weight:700">{{ errorMessage }}</p>

        <!-- 1. Sơ đồ 3 Slot thời gian thực -->
        <section class="panel" style="margin-bottom:22px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <h2>1. Trạng thái Cảm biến & Đèn LED tại các Slot ({{ slots.length }} slot)</h2>
            <button type="button" class="link-btn" (click)="refreshAll(true)"><i class="pi pi-refresh"></i> Làm mới</button>
          </div>
          <div class="slot-grid">
            <div
              *ngFor="let s of slots"
              class="slot-button"
              [class.slot-reserved]="s.status === 'RESERVED'"
              [class.slot-occupied]="s.status === 'OCCUPIED'"
              style="cursor:default;text-align:center">
              <div style="font-size:16px">{{ s.code }}</div>
              <div class="slot-status-tag">{{ statusLabel(s.status) }}</div>
              <small style="color:var(--muted);font-weight:400">HC-SR04: {{ s.distance_cm }} cm</small>
            </div>
          </div>
        </section>

        <!-- 2. Cấp thẻ RFID & Điều khiển cổng -->
        <div class="booking-layout" style="margin-bottom:22px">
          <section class="panel">
            <h2>2. Xác thực QR Đặt trước & Cấp thẻ RFID</h2>
            <p class="lead" style="margin-bottom:16px">Quét bằng Webcam, tải ảnh QR hoặc nhập mã token của khách đặt trước để gán thẻ RFID.</p>

            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
              <button
                *ngIf="!cameraActive"
                pButton
                type="button"
                severity="secondary"
                icon="pi pi-camera"
                (click)="startQrCamera()">
                Bật Webcam quét QR
              </button>
              <button
                *ngIf="cameraActive"
                pButton
                type="button"
                severity="danger"
                [outlined]="true"
                icon="pi pi-times"
                (click)="stopQrCamera()">
                Tắt Webcam
              </button>
              <button
                pButton
                type="button"
                severity="secondary"
                [outlined]="true"
                icon="pi pi-image"
                (click)="qrFileInput.click()">
                Chọn ảnh QR từ máy
              </button>
              <input
                #qrFileInput
                type="file"
                accept="image/*"
                style="display:none"
                (change)="onQrFileSelected($event)">
            </div>

            <div
              *ngIf="cameraActive"
              style="position:relative;margin-bottom:14px;border:2px solid var(--brand);border-radius:14px;overflow:hidden;background:#0f172a;max-width:360px">
              <video
                #qrVideo
                autoplay
                playsinline
                muted
                style="width:100%;height:240px;object-fit:cover;display:block">
              </video>
              <div style="position:absolute;inset:24px;border:2px dashed rgba(16,185,129,0.85);border-radius:12px;pointer-events:none"></div>
              <div style="padding:8px 12px;background:rgba(15,23,42,0.85);color:#fff;font-size:12px;text-align:center">
                Đưa mã QR của khách vào khung hình Webcam...
              </div>
            </div>

            <div class="form-field">
              <label>Mã QR Token *</label>
              <input class="native-input" [(ngModel)]="qrTokenInput" placeholder="Nhập hoặc quét qr_code_token...">
            </div>
            <div class="form-field">
              <label>UID Thẻ RFID cấp cho khách *</label>
              <input class="native-input" [(ngModel)]="verifyCardUid" placeholder="Nhập UID thẻ RFID (VD: CARD1)...">
            </div>
            <button pButton type="button" icon="pi pi-qrcode" (click)="verifyQr()">Xác thực QR & Cấp thẻ</button>

            <hr style="border:0;border-top:1px solid var(--line);margin:18px 0">
            <div class="form-field">
              <label>Kích hoạt quẹt thẻ RFID từ Trạm Bảo vệ (Hỗ trợ kiểm thử nhanh)</label>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <input class="native-input" style="flex:1;min-width:140px" [(ngModel)]="swipeCardUid" placeholder="UID thẻ RFID...">
                <button pButton type="button" severity="secondary" (click)="triggerSwipe('IN')">Quẹt VÀO (IN)</button>
                <button pButton type="button" severity="secondary" (click)="triggerSwipe('OUT')">Quẹt RA (OUT)</button>
              </div>
            </div>
          </section>

          <section class="panel">
            <h2>3. Kho Thẻ, Khách vãng lai & Override Barrier</h2>
            <div class="form-field">
              <label>Đăng ký UID thẻ RFID mới vào kho thẻ</label>
              <div style="display:flex;gap:8px">
                <input class="native-input" [(ngModel)]="newCardUid" placeholder="Nhập UID thẻ RFID...">
                <button pButton type="button" (click)="registerCard()">Đăng ký thẻ</button>
              </div>
            </div>
            <hr style="border:0;border-top:1px solid var(--line);margin:16px 0">
            <div class="form-field">
              <label>Cấp thẻ cho Khách vãng lai (Giữ 1 slot trống)</label>
              <div style="display:flex;gap:8px">
                <input class="native-input" [(ngModel)]="walkInCardUid" placeholder="Nhập UID thẻ RFID...">
                <button pButton type="button" severity="secondary" (click)="issueWalkIn()">Cấp thẻ vãng lai</button>
              </div>
            </div>
            <hr style="border:0;border-top:1px solid var(--line);margin:16px 0">
            <div class="form-field">
              <label>Mở Barrier khẩn cấp (Bắt buộc nhập lý do — có ghi nhật ký)</label>
              <input class="native-input" [(ngModel)]="overrideReason" placeholder="VD: Xe ưu tiên / Mất điện đầu đọc..." style="margin-bottom:8px">
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button pButton type="button" severity="warn" [outlined]="true" (click)="overrideBarrier('IN')">Mở Barrier VÀO (Override)</button>
                <button pButton type="button" severity="warn" [outlined]="true" (click)="overrideBarrier('OUT')">Mở Barrier RA (Override)</button>
              </div>
            </div>
          </section>
        </div>

        <!-- 4. Danh sách phiên gửi xe & Thu phí -->
        <section class="panel">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:14px">
            <h2>4. Danh sách Lượt gửi xe & Xác nhận Thanh toán</h2>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <select class="native-input" style="width:auto;padding:6px 10px" [(ngModel)]="statusFilter" (change)="loadSessions()">
                <option value="">Tất cả trạng thái</option>
                <option value="PAYMENT_PENDING">Chờ thu phí (PAYMENT_PENDING)</option>
                <option value="PARKING">Đang đỗ (PARKING)</option>
                <option value="AUTHORIZED">Đã cấp thẻ chờ vào (AUTHORIZED)</option>
                <option value="PAID">Đã thanh toán chờ ra (PAID)</option>
                <option value="EXITED">Đã hoàn tất (EXITED)</option>
              </select>
              <span class="lead">Hiển thị: {{ sessions.length }} lượt</span>
            </div>
          </div>
          <div style="overflow-x:auto">
            <table class="guard-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Thẻ RFID</th>
                  <th>Slot</th>
                  <th>Trạng thái</th>
                  <th>Giờ vào</th>
                  <th>Phí gửi xe</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let s of sessions" [style.background]="s.status === 'PAYMENT_PENDING' ? '#fffbeb' : ''">
                  <td>#{{ s.id }}</td>
                  <td><strong>{{ s.card_uid }}</strong></td>
                  <td>Slot {{ s.slot_id || '—' }}</td>
                  <td><span class="session-badge">{{ s.status }}</span></td>
                  <td>{{ s.time_in ? (s.time_in | date:'HH:mm:ss dd/MM') : 'Chưa vào' }}</td>
                  <td><strong>{{ s.total_fee | number }}đ</strong> ({{ s.payment_status }})</td>
                  <td>
                    <div style="display:flex;gap:6px;flex-wrap:wrap">
                      <button
                        *ngIf="s.status === 'PAYMENT_PENDING'"
                        type="button"
                        class="mini-btn primary"
                        (click)="confirmPayment(s.id)">
                        Đã thu {{ s.total_fee | number }}đ & Mở cổng RA
                      </button>
                      <button
                        *ngIf="s.status === 'PAID'"
                        type="button"
                        class="mini-btn"
                        (click)="confirmExit(s.id)">
                        Xác nhận xe đã ra khỏi cổng
                      </button>
                      <span *ngIf="s.status !== 'PAYMENT_PENDING' && s.status !== 'PAID'" style="color:var(--muted);font-size:12px">—</span>
                    </div>
                  </td>
                </tr>
                <tr *ngIf="sessions.length === 0">
                  <td colspan="7" style="text-align:center;color:var(--muted);padding:24px">Chưa có lượt gửi xe nào phù hợp bộ lọc.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  `,
})
export class GuardComponent implements OnInit, OnDestroy {
  slots: SlotItem[] = [];
  sessions: ParkingSessionItem[] = [];
  gatewayStatus: GatewayStatus | null = null;
  statusFilter: SessionStatus | '' = '';
  qrTokenInput = '';
  verifyCardUid = '';
  newCardUid = '';
  walkInCardUid = '';
  swipeCardUid = '';
  overrideReason = '';
  bannerMessage = '';
  errorMessage = '';
  guardName = 'Bảo vệ trực cổng';
  isAdmin = false;
  cameraActive = false;
  @ViewChild('qrVideo') qrVideoRef?: ElementRef<HTMLVideoElement>;
  private mediaStream: MediaStream | null = null;
  private scanTimer?: ReturnType<typeof setInterval>;
  private wsSub?: Subscription;

  constructor(
    private bookingService: BookingService,
    private auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const user = this.auth.getCurrentUser();
    this.isAdmin = user?.role === 'admin';
    this.guardName = user?.name || 'Bảo vệ trực cổng';
    this.bookingService.connectStaffWebSocket();
    this.refreshAll();
    this.wsSub = this.bookingService.events$.subscribe((msg) => {
      if (msg.event === 'RFID_SCANNED') {
        const scannedUid = msg.data?.card_uid || '';
        if (scannedUid) {
          this.verifyCardUid = scannedUid;
          this.newCardUid = scannedUid;
          this.walkInCardUid = scannedUid;
          this.swipeCardUid = scannedUid;
          this.bannerMessage = `🪪 Đã nhận thẻ RFID từ đầu đọc RC522: ${scannedUid} (Đã tự động điền vào ô UID!)`;
        }
      } else if (msg.event === 'PAYMENT_REQUIRED') {
        this.bannerMessage = `🔔 Yêu cầu thanh toán phiên #${msg.data?.session_id} (Thẻ ${msg.data?.card_uid}): ${msg.data?.total_fee?.toLocaleString()}đ`;
      } else if (msg.event === 'GATE_DENIED') {
        const scannedUid = msg.data?.card_uid || '';
        if (scannedUid) {
          this.verifyCardUid = scannedUid;
          this.newCardUid = scannedUid;
          this.walkInCardUid = scannedUid;
          this.swipeCardUid = scannedUid;
        }
        this.errorMessage = `⛔ Thẻ ${scannedUid} chưa được cấp quyền vào (${msg.data?.reason}) -> Đã tự động điền mã "${scannedUid}" vào các ô bên dưới để bạn cấp thẻ!`;
      } else if (msg.event === 'GATEWAY_STATUS') {
        if (this.gatewayStatus) {
          this.gatewayStatus.gateway_online = !!msg.data?.online;
          this.gatewayStatus.gateway_last_seen = msg.data?.last_seen;
        }
      }
      this.cdr.markForCheck();
      this.refreshAll();
    });
  }

  ngOnDestroy(): void {
    this.stopQrCamera();
    this.wsSub?.unsubscribe();
  }

  async startQrCamera(): Promise<void> {
    this.clearMessages();
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.errorMessage = 'Trình duyệt không hỗ trợ truy cập Webcam.';
      this.cdr.markForCheck();
      return;
    }
    const BarcodeDetectorCtor = (window as any).BarcodeDetector;
    if (!BarcodeDetectorCtor) {
      this.errorMessage = 'Trình duyệt hiện tại không hỗ trợ BarcodeDetector. Hãy dùng Google Chrome / Edge hoặc nhập mã trực tiếp.';
      this.cdr.markForCheck();
      return;
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      this.cameraActive = true;
      this.cdr.markForCheck();

      setTimeout(() => {
        const videoEl = this.qrVideoRef?.nativeElement;
        if (!videoEl || !this.mediaStream) return;
        videoEl.srcObject = this.mediaStream;
        videoEl.play().catch(() => {});

        const detector = new BarcodeDetectorCtor({ formats: ['qr_code'] });
        this.scanTimer = setInterval(async () => {
          if (!this.cameraActive || !videoEl || videoEl.readyState < 2) return;
          try {
            const codes = await detector.detect(videoEl);
            if (codes && codes.length > 0 && codes[0].rawValue) {
              const token = String(codes[0].rawValue).trim();
              this.qrTokenInput = token;
              this.stopQrCamera();
              this.bannerMessage = `📷 Đã quét thành công mã QR từ Webcam! Hãy nhập UID thẻ RFID rồi bấm "Xác thực QR & Cấp thẻ".`;
              this.cdr.markForCheck();
            }
          } catch {
            // tiếp tục quét ở khung hình tiếp theo
          }
        }, 250);
      }, 100);
    } catch {
      this.cameraActive = false;
      this.errorMessage = 'Không thể mở Webcam. Vui lòng cấp quyền Camera cho trình duyệt (localhost).';
      this.cdr.markForCheck();
    }
  }

  stopQrCamera(): void {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = undefined;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    this.cameraActive = false;
    this.cdr.markForCheck();
  }

  async onQrFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) return;
    this.clearMessages();

    const BarcodeDetectorCtor = (window as any).BarcodeDetector;
    if (!BarcodeDetectorCtor) {
      this.errorMessage = 'Trình duyệt không hỗ trợ đọc QR từ ảnh. Hãy mở bằng Google Chrome.';
      input.value = '';
      this.cdr.markForCheck();
      return;
    }

    try {
      const bitmap = await createImageBitmap(file);
      const detector = new BarcodeDetectorCtor({ formats: ['qr_code'] });
      const codes = await detector.detect(bitmap);
      if (codes && codes.length > 0 && codes[0].rawValue) {
        this.qrTokenInput = String(codes[0].rawValue).trim();
        this.bannerMessage = `🖼️ Đã đọc thành công mã QR từ ảnh! Hãy nhập UID thẻ RFID rồi bấm "Xác thực QR & Cấp thẻ".`;
      } else {
        this.errorMessage = 'Không tìm thấy mã QR hợp lệ trong bức ảnh đã chọn.';
      }
    } catch {
      this.errorMessage = 'Không thể phân tích bức ảnh này.';
    } finally {
      input.value = '';
      this.cdr.markForCheck();
    }
  }

  async refreshAll(manual = false): Promise<void> {
    try {
      const [slots, sessions, gw] = await Promise.all([
        this.bookingService.getSlots(),
        this.bookingService.getSessions(40, this.statusFilter),
        this.bookingService.getGatewayStatus().catch(() => null),
      ]);
      this.slots = slots;
      this.sessions = sessions;
      if (gw) this.gatewayStatus = gw;
      if (manual) {
        const nowStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        this.bannerMessage = `Đã cập nhật dữ liệu mới nhất lúc ${nowStr}.`;
      }
      this.cdr.markForCheck();
    } catch {
      this.errorMessage = 'Chưa kết nối được với Backend FastAPI.';
      this.cdr.markForCheck();
    }
  }

  async loadSessions(): Promise<void> {
    try {
      this.sessions = await this.bookingService.getSessions(40, this.statusFilter);
      this.cdr.markForCheck();
    } catch {
      // ignore
    }
  }

  statusLabel(status: SlotItem['status']): string {
    if (status === 'AVAILABLE') return '🟢 Đèn Xanh (Trống)';
    if (status === 'RESERVED') return '🟡 Đèn Vàng (Giữ chỗ)';
    return '🔴 Đèn Đỏ (Có xe)';
  }

  private clearMessages(): void {
    this.errorMessage = '';
    this.bannerMessage = '';
  }

  async registerCard(): Promise<void> {
    if (!this.newCardUid.trim()) return;
    this.clearMessages();
    try {
      const res = await this.bookingService.registerCard(this.newCardUid.trim());
      this.bannerMessage = `Đã đăng ký thẻ ${res.card_uid} (${res.status}).`;
      this.verifyCardUid = res.card_uid;
      this.walkInCardUid = res.card_uid;
      this.swipeCardUid = res.card_uid;
    } catch (err: any) {
      if (err?.status === 409) {
        this.bannerMessage = `Thẻ ${this.newCardUid.trim().toUpperCase()} đã có sẵn trong hệ thống và sẵn sàng sử dụng.`;
      } else {
        this.errorMessage = err?.error?.detail || 'Không thể đăng ký thẻ.';
      }
    }
    this.cdr.markForCheck();
  }

  async verifyQr(): Promise<void> {
    if (!this.qrTokenInput.trim() || !this.verifyCardUid.trim()) return;
    this.clearMessages();
    const token = this.qrTokenInput.trim();
    const uid = this.verifyCardUid.trim();
    try {
      let res: any;
      try {
        res = await this.bookingService.verifyQrAndAssignCard(token, uid);
      } catch (firstErr: any) {
        if (firstErr?.status === 404 && String(firstErr?.error?.detail || '').includes('Thẻ')) {
          await this.bookingService.registerCard(uid);
          res = await this.bookingService.verifyQrAndAssignCard(token, uid);
        } else {
          throw firstErr;
        }
      }
      this.bannerMessage = `✅ Đã xác thực QR (#${res.booking_id}) và cấp thẻ ${uid.toUpperCase()} cho Slot ${res.slot_id} (Phiên #${res.session_id}).`;
      this.qrTokenInput = '';
      this.swipeCardUid = uid.toUpperCase();
      await this.refreshAll();
    } catch (err: any) {
      this.errorMessage = err?.error?.detail || 'Xác thực QR thất bại.';
    }
    this.cdr.markForCheck();
  }

  async issueWalkIn(): Promise<void> {
    if (!this.walkInCardUid.trim()) return;
    this.clearMessages();
    const uid = this.walkInCardUid.trim();
    try {
      let res: any;
      try {
        res = await this.bookingService.createWalkIn(uid);
      } catch (firstErr: any) {
        if (firstErr?.status === 404 && String(firstErr?.error?.detail || '').includes('Thẻ')) {
          await this.bookingService.registerCard(uid);
          res = await this.bookingService.createWalkIn(uid);
        } else {
          throw firstErr;
        }
      }
      this.bannerMessage = `✅ Đã cấp thẻ vãng lai ${res.card_uid} giữ Slot ${res.slot_id} (Phiên #${res.session_id}).`;
      this.swipeCardUid = res.card_uid;
      await this.refreshAll();
    } catch (err: any) {
      this.errorMessage = err?.error?.detail || 'Không thể cấp thẻ vãng lai.';
    }
    this.cdr.markForCheck();
  }

  async triggerSwipe(gate: 'IN' | 'OUT'): Promise<void> {
    if (!this.swipeCardUid.trim()) {
      this.errorMessage = 'Vui lòng nhập UID thẻ RFID cần quẹt.';
      return;
    }
    this.clearMessages();
    try {
      const res = await this.bookingService.swipeRfid(gate, this.swipeCardUid.trim());
      if (gate === 'IN') {
        this.bannerMessage = `🚗 Đã quẹt thẻ ${res.card_uid} tại cổng VÀO -> Mở Barrier IN!`;
      } else {
        this.bannerMessage = `💳 Đã quẹt thẻ ${res.card_uid} tại cổng RA -> Phí cần thu: ${res.total_fee?.toLocaleString()}đ.`;
      }
      await this.refreshAll();
    } catch (err: any) {
      this.errorMessage = err?.error?.detail || 'Quẹt thẻ thất bại.';
    }
    this.cdr.markForCheck();
  }

  async confirmPayment(sessionId: number): Promise<void> {
    this.clearMessages();
    try {
      const res = await this.bookingService.confirmPayment(sessionId);
      this.bannerMessage = `Đã xác nhận thu ${res.total_fee?.toLocaleString()}đ cho phiên #${sessionId} -> Đã phát lệnh OPEN_GATE mở Barrier cổng RA!`;
      await this.refreshAll();
    } catch (err: any) {
      this.errorMessage = err?.error?.detail || 'Xác nhận thanh toán thất bại.';
    }
    this.cdr.markForCheck();
  }

  async confirmExit(sessionId: number): Promise<void> {
    this.clearMessages();
    try {
      await this.bookingService.confirmExit(sessionId);
      this.bannerMessage = `Đã xác nhận xe phiên #${sessionId} qua cổng RA, thu hồi thẻ RFID và giải phóng Slot!`;
      await this.refreshAll();
    } catch (err: any) {
      this.errorMessage = err?.error?.detail || 'Xác nhận xe ra thất bại.';
    }
    this.cdr.markForCheck();
  }

  async overrideBarrier(gate: 'IN' | 'OUT'): Promise<void> {
    this.clearMessages();
    const reason = this.overrideReason.trim();
    if (reason.length < 3) {
      this.errorMessage = 'Vui lòng nhập lý do mở cổng khẩn cấp (ít nhất 3 ký tự) để ghi nhật ký đối soát.';
      this.cdr.markForCheck();
      return;
    }
    try {
      await this.bookingService.overrideBarrier(gate, 'OPEN', reason);
      this.bannerMessage = `Đã gửi lệnh mở khẩn cấp Barrier cổng ${gate} (Lý do: ${reason}).`;
      this.overrideReason = '';
    } catch (err: any) {
      this.errorMessage = err?.error?.detail || 'Không thể gửi lệnh điều khiển Barrier.';
    }
    this.cdr.markForCheck();
  }

  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
