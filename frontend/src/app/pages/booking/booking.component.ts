import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { Subscription } from 'rxjs';
import { PARKING_LOTS } from '../../data/parking-lots';
import { BookingApiResponse, ParkingLot, SlotItem } from '../../models/parking.models';
import { BookingService } from '../../services/booking.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-booking',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ButtonModule, SelectModule],
  template: `
    <div class="shell">
      <header class="topbar">
        <a class="brand" routerLink="/home"><span class="brand-mark"><i class="pi pi-car"></i></span> ParkSmart</a>
        <nav class="nav">
          <a routerLink="/home">Trang chủ</a>
          <a class="active" routerLink="/booking">Đặt chỗ & Vé của tôi</a>
          <span style="font-size:12px;color:var(--muted)">👤 {{ userName }}</span>
          <a routerLink="/login" (click)="logout()">Đăng xuất</a>
        </nav>
      </header>
      <main class="page">
        <div class="eyebrow">ĐẶT CHỖ TRƯỚC</div>
        <h1>Đăng ký slot gửi xe</h1>
        <p class="lead">Trạng thái các ô đỗ bên dưới được đồng bộ thời gian thực với Backend & mạch STM32.</p>
        <div class="stepper">
          <div class="step active"><span class="step-num">1</span><span>Chọn thông tin</span></div><div class="step-line"></div>
          <div class="step"><span class="step-num">2</span><span>Xác nhận</span></div><div class="step-line"></div>
          <div class="step"><span class="step-num">3</span><span>Mã QR</span></div>
        </div>

        <div class="notice" *ngIf="bannerMessage" style="margin-bottom:18px">
          <i class="pi pi-check-circle"></i>
          <span>{{ bannerMessage }}</span>
        </div>

        <div class="booking-layout">
          <section class="panel">
            <h2>Thông tin đặt chỗ</h2>
            <p class="lead" style="margin-bottom:24px">Các trường có dấu * là bắt buộc.</p>
            <div class="form-field">
              <label for="lot">Bãi xe *</label>
              <p-select inputId="lot" [options]="lots" [(ngModel)]="selectedLot" optionLabel="name" placeholder="Chọn bãi xe" (onChange)="onLotChange()" styleClass="w-full" />
            </div>
            <div class="field-grid">
              <div class="form-field">
                <label for="phone">Số điện thoại nhận chỗ *</label>
                <input class="native-input" id="phone" type="tel" [(ngModel)]="phoneNumber" placeholder="0912345678">
              </div>
              <div class="form-field">
                <label for="plate">Biển số xe (tùy chọn)</label>
                <input class="native-input" id="plate" [(ngModel)]="plate" placeholder="Ví dụ: 30A-123.45">
              </div>
            </div>
            <div class="field-grid">
              <div class="form-field">
                <label>Thời điểm bắt đầu giữ chỗ</label>
                <input
                  class="native-input"
                  [value]="'Ngay khi xác nhận (' + displayDate + ')'"
                  readonly
                  style="background:#f8fafc;color:var(--muted);cursor:default">
              </div>
              <div class="form-field">
                <label>Khung giờ hiệu lực QR (15 phút)</label>
                <input
                  class="native-input"
                  [value]="nowTimeStr + ' → ' + holdUntilTimeStr"
                  readonly
                  style="background:#f8fafc;color:var(--brand-dark);font-weight:700;cursor:default">
              </div>
            </div>
            <div class="form-field">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <label>Chọn slot đỗ xe thực tế *</label>
                <button type="button" class="link-btn" (click)="refreshAll(true)">
                  <i class="pi pi-refresh" [class.pi-spin]="refreshing"></i>
                  {{ refreshing ? 'Đang làm mới...' : 'Làm mới' }}
                </button>
              </div>
              <p class="lead" style="font-size:12px">
                🟢 Xanh (Trống) · 🟡 Vàng (Đang giữ chỗ) · 🔴 Đỏ (Đang có xe)
              </p>
              <div class="slot-grid">
                <button
                  type="button"
                  *ngFor="let slot of liveSlots"
                  class="slot-button"
                  [class.selected]="selectedSlotItem?.id === slot.id"
                  [class.slot-reserved]="slot.status === 'RESERVED'"
                  [class.slot-occupied]="slot.status === 'OCCUPIED'"
                  [disabled]="slot.status !== 'AVAILABLE'"
                  (click)="selectSlot(slot)">
                  <div>{{ slot.code }}</div>
                  <small class="slot-status-tag">{{ statusLabel(slot.status) }}</small>
                </button>
              </div>
            </div>
            <p class="error-text" *ngIf="error">{{ error }}</p>
            <button
              pButton
              type="button"
              icon="pi pi-arrow-right"
              iconPos="right"
              (click)="confirm()"
              [disabled]="submitting || !selectedLot || !date || !time || !selectedSlotItem || !phoneNumber.trim()">
              {{ submitting ? 'Đang gửi yêu cầu...' : 'Xác nhận đặt chỗ' }}
            </button>
          </section>

          <aside class="panel">
            <h2>Tóm tắt đặt chỗ</h2>
            <p class="lead" style="margin-bottom:18px">Kiểm tra thông tin trước khi xác nhận.</p>
            <div class="summary-row"><span>Bãi xe</span><strong>{{ selectedLot?.name || 'Chưa chọn' }}</strong></div>
            <div class="summary-row"><span>Số điện thoại</span><strong>{{ phoneNumber || '—' }}</strong></div>
            <div class="summary-row"><span>Biển số xe</span><strong>{{ (plate | uppercase) || '—' }}</strong></div>
            <div class="summary-row"><span>Thời gian giữ chỗ</span><strong>15 phút (tức thời)</strong></div>
            <div class="summary-row"><span>Hạn check-in dự kiến</span><strong>{{ holdUntilTimeStr }} ({{ displayDate }})</strong></div>
            <div class="summary-row"><span>Slot</span><strong>{{ selectedSlotItem?.code || 'Chưa chọn' }}</strong></div>
            <div class="summary-row"><span>Phí gửi xe / giờ</span><strong>{{ selectedLot?.pricePerHour || 10000 | number }}đ</strong></div>
            <div class="notice"><i class="pi pi-info-circle"></i><span>Sau khi đăng ký thành công, đèn LED tại slot sẽ chuyển sang màu VÀNG và mã QR có hiệu lực trong 15 phút.</span></div>
          </aside>
        </div>

        <!-- Danh sách Vé của tôi -->
        <section class="panel" style="margin-top:24px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <h2>Vé của tôi & Lịch sử đặt chỗ</h2>
            <button type="button" class="link-btn" (click)="loadMyBookings()"><i class="pi pi-refresh"></i> Tải lại</button>
          </div>
          <div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;font-size:13px">
              <thead>
                <tr style="border-bottom:2px solid var(--line);text-align:left">
                  <th style="padding:10px 8px">Mã vé</th>
                  <th style="padding:10px 8px">Slot</th>
                  <th style="padding:10px 8px">Biển số</th>
                  <th style="padding:10px 8px">Thời gian tạo</th>
                  <th style="padding:10px 8px">Trạng thái</th>
                  <th style="padding:10px 8px">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let b of myBookings" style="border-bottom:1px solid var(--line)">
                  <td style="padding:10px 8px"><strong>#{{ b.id }}</strong></td>
                  <td style="padding:10px 8px">{{ b.slot_code || ('Slot ' + b.slot_id) }}</td>
                  <td style="padding:10px 8px">{{ b.license_plate || '—' }}</td>
                  <td style="padding:10px 8px">{{ b.created_at | date:'dd/MM/yyyy HH:mm' }}</td>
                  <td style="padding:10px 8px"><strong>{{ bookingStatusText(b) }}</strong></td>
                  <td style="padding:10px 8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                    <button
                      *ngIf="isBookingActive(b)"
                      pButton
                      type="button"
                      size="small"
                      (click)="openBookingDetail(b)">
                      Xem QR
                    </button>
                    <button
                      *ngIf="b.status === 'PENDING'"
                      pButton
                      type="button"
                      size="small"
                      severity="danger"
                      [outlined]="true"
                      (click)="cancelMyBooking(b.id)">
                      Hủy vé
                    </button>
                    <span *ngIf="b.session_status === 'EXITED' && b.total_fee" style="font-size:12px;color:var(--muted)">
                      Đã thu {{ b.total_fee | number }}đ
                    </span>
                  </td>
                </tr>
                <tr *ngIf="myBookings.length === 0">
                  <td colspan="6" style="padding:18px;text-align:center;color:var(--muted)">Bạn chưa có lượt đặt chỗ nào.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  `
})
export class BookingComponent implements OnInit, OnDestroy {
  lots: ParkingLot[] = PARKING_LOTS.map(l => ({ ...l }));
  selectedLot: ParkingLot | undefined;
  date = '';
  time = '';
  displayDate = '';
  nowTimeStr = '';
  holdUntilTimeStr = '';
  phoneNumber = '';
  plate = '';
  userName = '';
  error = '';
  bannerMessage = '';
  submitting = false;
  refreshing = false;
  today = this.localDateString();
  liveSlots: SlotItem[] = [];
  selectedSlotItem: SlotItem | null = null;
  myBookings: BookingApiResponse[] = [];
  private wsSub?: Subscription;
  private clockTimer?: ReturnType<typeof setInterval>;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private bookingService: BookingService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef
  ) {
    const lotId = this.route.snapshot.queryParamMap.get('lot');
    this.selectedLot = this.lots.find(lot => lot.id === lotId) || this.lots[0];
    const user = this.auth.getCurrentUser();
    this.phoneNumber = user?.phone || '';
    this.userName = user?.name || 'Khách hàng';
    this.updateHoldWindow();
  }

  private updateHoldWindow(): void {
    const now = new Date();
    const holdUntil = new Date(now.getTime() + 15 * 60_000);
    this.date = this.localDateString();
    this.displayDate = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    this.nowTimeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    this.holdUntilTimeStr = holdUntil.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    this.time = this.holdUntilTimeStr;
  }

  ngOnInit(): void {
    this.refreshAll();
    this.clockTimer = setInterval(() => {
      this.updateHoldWindow();
      this.cdr.markForCheck();
    }, 15000);
    this.wsSub = this.bookingService.events$.subscribe(msg => {
      if (['SLOT_UPDATED', 'BOOKING_EXPIRED', 'BOOKING_CANCELLED', 'ENTRY_EXPIRED', 'VEHICLE_EXITED'].includes(msg.event)) {
        this.refreshAll();
      }
    });
  }

  ngOnDestroy(): void {
    this.wsSub?.unsubscribe();
    if (this.clockTimer) clearInterval(this.clockTimer);
  }

  async refreshAll(manual = false): Promise<void> {
    this.refreshing = true;
    this.cdr.markForCheck();
    try {
      await Promise.all([this.loadSlots(), this.loadMyBookings()]);
      if (manual) {
        const nowStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        this.bannerMessage = `Đã cập nhật trạng thái ${this.liveSlots.length} slot mới nhất lúc ${nowStr}.`;
      }
    } finally {
      this.refreshing = false;
      this.cdr.markForCheck();
    }
  }

  async loadSlots(): Promise<void> {
    try {
      this.liveSlots = await this.bookingService.getSlots();
      if (this.selectedSlotItem) {
        const refreshed = this.liveSlots.find(s => s.id === this.selectedSlotItem?.id);
        if (!refreshed || refreshed.status !== 'AVAILABLE') {
          this.selectedSlotItem = null;
        } else {
          this.selectedSlotItem = refreshed;
        }
      }
      this.cdr.markForCheck();
    } catch {
      this.error = 'Không kết nối được Backend API (/api/slots). Hãy kiểm tra server FastAPI đang chạy.';
      this.cdr.markForCheck();
    }
  }

  async loadMyBookings(): Promise<void> {
    try {
      this.myBookings = await this.bookingService.getMyBookings();
      this.cdr.markForCheck();
    } catch {
      // ignore
    }
  }

  isBookingActive(b: BookingApiResponse): boolean {
    if (b.session_status === 'EXITED' || b.session_status === 'CANCELLED') {
      return false;
    }
    return b.status === 'PENDING' || b.status === 'VERIFIED' || b.status === 'CHECKED_IN';
  }

  bookingStatusText(b: BookingApiResponse): string {
    if (b.session_status === 'EXITED') {
      return '🏁 Đã hoàn tất (Đã ra bãi)';
    }
    if (b.session_status === 'PAID') {
      return '✅ Đã thanh toán (Chờ ra cổng)';
    }
    if (b.session_status === 'PAYMENT_PENDING') {
      return '💳 Chờ thanh toán tại cổng ra';
    }
    if (b.session_status === 'CANCELLED') {
      return '🔴 Đã hủy';
    }
    const map: Record<string, string> = {
      PENDING: '🟡 Chờ quét QR (15p)',
      VERIFIED: '🔵 Đã nhận thẻ RFID',
      CHECKED_IN: '🟢 Đang đỗ xe',
      EXPIRED: '⚪ Đã hết hạn',
      CANCELLED: '🔴 Đã hủy',
    };
    return map[b.status] || b.status;
  }

  openBookingDetail(b: BookingApiResponse): void {
    this.bookingService.setBookingFromApi(b);
    this.router.navigateByUrl('/booking/confirmation');
  }

  async cancelMyBooking(bookingId: number): Promise<void> {
    this.error = '';
    this.bannerMessage = '';
    try {
      await this.bookingService.cancelBooking(bookingId);
      this.bannerMessage = `Đã hủy lượt đặt #${bookingId} và giải phóng slot thành công.`;
      await this.refreshAll();
    } catch (err: any) {
      this.error = err?.error?.detail || 'Không thể hủy lượt đặt.';
      this.cdr.markForCheck();
    }
  }

  onLotChange(): void {
    this.selectedSlotItem = null;
  }

  selectSlot(slot: SlotItem): void {
    if (slot.status === 'AVAILABLE') {
      this.selectedSlotItem = slot;
    }
  }

  statusLabel(status: SlotItem['status']): string {
    if (status === 'AVAILABLE') return '🟢 Trống';
    if (status === 'RESERVED') return '🟡 Giữ chỗ';
    return '🔴 Có xe';
  }

  async confirm(): Promise<void> {
    this.error = '';
    this.bannerMessage = '';
    if (!this.selectedLot || !this.date || !this.time || !this.selectedSlotItem) {
      this.error = 'Vui lòng chọn đầy đủ bãi xe, ngày giờ và slot.';
      return;
    }
    const cleanPhone = this.phoneNumber.replace(/\s+/g, '');
    if (!/^\+?[0-9]{9,15}$/.test(cleanPhone)) {
      this.error = 'Số điện thoại cần từ 9–15 chữ số.';
      return;
    }
    this.submitting = true;
    try {
      await this.bookingService.createBookingApi(cleanPhone, this.selectedSlotItem.id, {
        lotId: this.selectedLot.id,
        lotName: this.selectedLot.name,
        address: this.selectedLot.address,
        date: this.date,
        time: this.time,
        pricePerHour: this.selectedLot.pricePerHour,
        licensePlate: this.plate,
      });
      this.router.navigateByUrl('/booking/confirmation');
    } catch (err: any) {
      this.error = err?.error?.detail || 'Không thể đặt slot này (có thể vừa có người đặt trước).';
      await this.refreshAll();
    } finally {
      this.submitting = false;
      this.cdr.markForCheck();
    }
  }

  logout(): void {
    this.auth.logout();
  }

  private localDateString(): string {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
  }
}
