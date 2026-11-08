import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { PARKING_LOTS } from '../../data/parking-lots';
import { ParkingLot } from '../../models/parking.models';
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
        <nav class="nav"><a routerLink="/home">Trang chủ</a><a class="active" routerLink="/booking">Đặt chỗ</a><a routerLink="/login" (click)="logout()">Đăng xuất</a></nav>
      </header>
      <main class="page">
        <div class="eyebrow">ĐẶT CHỖ TRƯỚC</div>
        <h1>Đăng ký slot gửi xe</h1>
        <p class="lead">Chọn bãi xe, ngày giờ đến và slot còn trống phù hợp với bạn.</p>
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
                <label for="date">Ngày đến *</label>
                <input class="native-input" id="date" type="date" [(ngModel)]="date" [min]="today">
              </div>
              <div class="form-field">
                <label for="time">Giờ đến *</label>
                <input class="native-input" id="time" type="time" [(ngModel)]="time">
              </div>
            </div>
            <div class="form-field">
              <label>Chọn slot *</label>
              <p class="lead" style="font-size:12px">Các slot màu xám đang không khả dụng trong dữ liệu demo.</p>
              <div class="slot-grid">
                <button type="button" *ngFor="let slot of slots" class="slot-button" [class.selected]="selectedSlot === slot" [disabled]="!isAvailable(slot)" (click)="selectedSlot = slot">{{ slot }}</button>
              </div>
            </div>
            <div class="form-field">
              <label for="plate">Biển số xe (không bắt buộc)</label>
              <input class="native-input" id="plate" [(ngModel)]="plate" placeholder="Ví dụ: 30A-123.45">
            </div>
            <p class="error-text" *ngIf="error">{{ error }}</p>
            <button pButton type="button" label="Xác nhận đặt chỗ" icon="pi pi-arrow-right" iconPos="right" (click)="confirm()" [disabled]="!selectedLot || !date || !time || !selectedSlot">Xác nhận đặt </button>
          </section>

          <aside class="panel">
            <h2>Tóm tắt đặt chỗ</h2>
            <p class="lead" style="margin-bottom:18px">Kiểm tra thông tin trước khi xác nhận.</p>
            <div class="summary-row"><span>Bãi xe</span><strong>{{ selectedLot?.name || 'Chưa chọn' }}</strong></div>
            <div class="summary-row"><span>Ngày đến</span><strong>{{ date || '—' }}</strong></div>
            <div class="summary-row"><span>Giờ đến</span><strong>{{ time || '—' }}</strong></div>
            <div class="summary-row"><span>Slot</span><strong>{{ selectedSlot || 'Chưa chọn' }}</strong></div>
            <div class="summary-row"><span>Phí tham khảo / giờ</span><strong>{{ selectedLot?.pricePerHour || 0 | number }}đ</strong></div>
            <div class="notice"><i class="pi pi-info-circle"></i><span>Sau khi đăng ký thành công, mã QR có hiệu lực trong 15 phút. Hãy xuất trình mã tại cổng bãi xe trong thời hạn này.</span></div>
          </aside>
        </div>
      </main>
    </div>
  `
})
export class BookingComponent {
  lots: ParkingLot[] = PARKING_LOTS;
  selectedLot: ParkingLot | undefined;
  date = '';
  time = '';
  selectedSlot = '';
  plate = '';
  error = '';
  today = this.localDateString();
  slots: string[] = ['A01','A02','A03','A04','A05','A06','A07','A08','A09','A10','A11','A12'];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private bookingService: BookingService,
    private auth: AuthService
  ) {
    const lotId = this.route.snapshot.queryParamMap.get('lot');
    this.selectedLot = this.lots.find(lot => lot.id === lotId) || this.lots[0];
    const now = new Date();
    now.setSeconds(0, 0);
    now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15);
    this.date = this.localDateString();
    this.time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  onLotChange(): void {
    this.selectedSlot = '';
  }

  isAvailable(slot: string): boolean {
    // Mô phỏng vài slot đã được giữ chỗ; backend thật phải quyết định trạng thái này.
    const unavailable: Record<string, string[]> = {
      A: ['A02', 'A05', 'A09'],
      B: ['A01', 'A04', 'A10'],
      C: ['A03', 'A06']
    };
    return !unavailable[this.selectedLot?.id || 'A']?.includes(slot);
  }

  confirm(): void {
    this.error = '';
    if (!this.auth.getCurrentUser()) {
      this.router.navigateByUrl('/login');
      return;
    }
    if (!this.selectedLot || !this.date || !this.time || !this.selectedSlot) {
      this.error = 'Vui lòng chọn đầy đủ bãi xe, ngày giờ và slot.';
      return;
    }
    const chosen = new Date(`${this.date}T${this.time}:00`);
    if (Number.isNaN(chosen.getTime()) || chosen.getTime() < Date.now() - 60_000) {
      this.error = 'Ngày giờ đến không được nằm trong quá khứ.';
      return;
    }
    const booking = this.bookingService.createBooking({
      lotId: this.selectedLot.id,
      lotName: this.selectedLot.name,
      address: this.selectedLot.address,
      slot: this.selectedSlot,
      date: this.date,
      time: this.time,
      pricePerHour: this.selectedLot.pricePerHour
    });
    this.router.navigateByUrl('/booking/confirmation');
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
