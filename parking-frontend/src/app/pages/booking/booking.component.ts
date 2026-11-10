import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { Subscription } from 'rxjs';
import { PARKING_LOTS } from '../../data/parking-lots';
import { ParkingLot, SlotItem } from '../../models/parking.models';
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
          <a class="active" routerLink="/booking">Đặt chỗ</a>
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
                <label for="plate">Biển số xe (không bắt buộc)</label>
                <input class="native-input" id="plate" [(ngModel)]="plate" placeholder="Ví dụ: 30A-123.45">
              </div>
            </div>
            <div class="field-grid">
              <div class="form-field">
                <label for="date">Ngày đến *</label>
                <input class="native-input" id="date" type="date" [(ngModel)]="date" [min]="today">
              </div>
              <div class="form-field">
                <label for="time">Giờ đến *</label>
                <input class="native-input" id="time" type="time" [(ngModel)]="time">
              </div>
            </div>
            <div class="form-field">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <label>Chọn slot đỗ xe thực tế *</label>
                <button type="button" class="link-btn" (click)="loadSlots()"><i class="pi pi-refresh"></i> Làm mới</button>
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
            <div class="summary-row"><span>Ngày đến</span><strong>{{ date || '—' }}</strong></div>
            <div class="summary-row"><span>Giờ đến</span><strong>{{ time || '—' }}</strong></div>
            <div class="summary-row"><span>Slot</span><strong>{{ selectedSlotItem?.code || 'Chưa chọn' }}</strong></div>
            <div class="summary-row"><span>Phí gửi xe / giờ</span><strong>{{ selectedLot?.pricePerHour || 10000 | number }}đ</strong></div>
            <div class="notice"><i class="pi pi-info-circle"></i><span>Sau khi đăng ký thành công, đèn LED tại slot sẽ chuyển sang màu VÀNG và mã QR có hiệu lực trong 15 phút.</span></div>
          </aside>
        </div>
      </main>
    </div>
  `
})
export class BookingComponent implements OnInit, OnDestroy {
  lots: ParkingLot[] = PARKING_LOTS.map(l => ({ ...l }));
  selectedLot: ParkingLot | undefined;
  date = '';
  time = '';
  phoneNumber = '';
  plate = '';
  error = '';
  submitting = false;
  today = this.localDateString();
  liveSlots: SlotItem[] = [];
  selectedSlotItem: SlotItem | null = null;
  private wsSub?: Subscription;

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
    const now = new Date();
    now.setSeconds(0, 0);
    now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15);
    this.date = this.localDateString();
    this.time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  ngOnInit(): void {
    const user = this.auth.getCurrentUser();
    if (!user) {
      this.router.navigateByUrl('/login');
      return;
    }
    if (user.role === 'guard') {
      this.router.navigateByUrl('/guard');
      return;
    }
    this.loadSlots();
    this.wsSub = this.bookingService.events$.subscribe(msg => {
      if (['SLOT_UPDATED', 'BOOKING_EXPIRED', 'ENTRY_EXPIRED', 'VEHICLE_EXITED'].includes(msg.event)) {
        this.loadSlots();
      }
    });
  }

  ngOnDestroy(): void {
    this.wsSub?.unsubscribe();
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
    if (!this.auth.getCurrentUser()) {
      this.router.navigateByUrl('/login');
      return;
    }
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
      });
      this.router.navigateByUrl('/booking/confirmation');
    } catch (err: any) {
      this.error = err?.error?.detail || 'Không thể đặt slot này (có thể vừa có người đặt trước).';
      await this.loadSlots();
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

