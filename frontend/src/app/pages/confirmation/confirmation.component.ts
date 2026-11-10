import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { Subscription } from 'rxjs';
import { Booking } from '../../models/parking.models';
import { BookingService } from '../../services/booking.service';
import { AuthService } from '../../services/auth.service';
import QRCode from 'qrcode';

@Component({
  selector: 'app-confirmation',
  standalone: true,
  imports: [CommonModule, RouterLink, ButtonModule],
  template: `
    <div class="shell">
      <header class="topbar">
        <a class="brand" routerLink="/home"><span class="brand-mark"><i class="pi pi-car"></i></span> ParkSmart</a>
        <nav class="nav">
          <a routerLink="/home">Trang chủ</a>
          <a routerLink="/booking">Đặt chỗ</a>
          <a routerLink="/login" (click)="logout()">Đăng xuất</a>
        </nav>
      </header>
      <main class="page" *ngIf="booking; else noBooking">
        <div class="eyebrow">ĐẶT CHỖ THÀNH CÔNG</div>
        <h1>Mọi thứ đã sẵn sàng!</h1>
        <p class="lead">Xuất trình mã QR này tại Trạm Bảo vệ để được cấp thẻ RFID vào bãi.</p>
        <div class="stepper">
          <div class="step done"><span class="step-num"><i class="pi pi-check"></i></span><span>Chọn thông tin</span></div><div class="step-line"></div>
          <div class="step done"><span class="step-num"><i class="pi pi-check"></i></span><span>Xác nhận</span></div><div class="step-line"></div>
          <div class="step active"><span class="step-num">3</span><span>Mã QR</span></div>
        </div>
        <div class="qr-layout">
          <section class="panel">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px">
              <span class="brand-mark"><i class="pi pi-check"></i></span>
              <div><h2 style="margin-bottom:4px">Thông tin đặt chỗ #{{ booking.bookingId || '—' }}</h2><span class="lead">Đồng bộ trực tiếp với hệ thống Backend.</span></div>
            </div>
            <div class="summary-row"><span>Trạng thái</span><strong>{{ booking.status || 'PENDING' }}</strong></div>
            <div class="summary-row"><span>Số điện thoại</span><strong>{{ booking.phoneNumber || '—' }}</strong></div>
            <div class="summary-row"><span>Bãi xe</span><strong>{{ booking.lotName }}</strong></div>
            <div class="summary-row"><span>Slot được giữ</span><strong>{{ booking.slot }}</strong></div>
            <div class="summary-row"><span>Thời hạn QR</span><strong>{{ expiryText }} ({{ remainingText }})</strong></div>
            <div class="notice"><i class="pi pi-clock"></i><span>{{ statusMessage }}</span></div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:22px">
              <button pButton type="button" icon="pi pi-plus" (click)="newBooking()">Đặt chỗ mới</button>
              <button pButton type="button" icon="pi pi-home" severity="secondary" [outlined]="true" routerLink="/home">Về trang chủ</button>
            </div>
          </section>
          <aside class="panel qr-panel">
            <div class="eyebrow">MÃ CHECK-IN</div>
            <h2>Quét mã tại cổng</h2>
            <img *ngIf="qrDataUrl" class="qr-image" [src]="qrDataUrl" alt="Mã QR đặt chỗ">
            <div *ngIf="!qrDataUrl" class="qr-image" style="display:grid;place-items:center;color:#8a99a2"><i class="pi pi-qrcode" style="font-size:80px"></i></div>
            <div class="booking-code" style="word-break:break-all;font-size:11px">{{ booking.qrCodeToken || booking.code }}</div>
            <p class="lead" style="font-size:12px;margin-top:14px">Token xác thực một lần do Backend phát hành.</p>
          </aside>
        </div>
      </main>
      <ng-template #noBooking>
        <main class="page"><section class="panel empty-state"><i class="pi pi-calendar-times" style="font-size:48px;color:var(--brand)"></i><h2 style="margin-top:18px">Chưa có đặt chỗ</h2><p class="lead">Hãy chọn bãi xe và đăng ký slot trước.</p><button pButton type="button" label="Đăng ký đặt chỗ" (click)="newBooking()" style="margin-top:18px"></button></section></main>
      </ng-template>
    </div>
  `
})
export class ConfirmationComponent implements OnInit, OnDestroy {
  booking: Booking | null = null;
  qrDataUrl = '';
  expired = false;
  expiryText = '';
  remainingText = '';
  private intervalId?: ReturnType<typeof setInterval>;
  private wsSub?: Subscription;

  constructor(
    private bookingService: BookingService,
    private router: Router,
    private auth: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  get statusMessage(): string {
    if (!this.booking) return '';
    if (this.booking.status === 'VERIFIED') {
      return 'Đã xác thực QR và nhận thẻ RFID! Hãy quẹt thẻ tại cổng vào để mở barrier.';
    }
    if (this.booking.status === 'CHECKED_IN') {
      return 'Xe đã quẹt thẻ qua cổng vào và đang gửi trong bãi.';
    }
    if (this.expired || this.booking.status === 'EXPIRED') {
      return 'Mã QR đã hết hạn 15 phút và slot đã được giải phóng. Vui lòng tạo đặt chỗ mới.';
    }
    return 'Mã QR có hiệu lực 15 phút kể từ lúc đặt chỗ. Đèn tại slot đang sáng VÀNG chờ bạn đến.';
  }

  ngOnInit(): void {
    this.booking = this.bookingService.getBooking();
    if (!this.booking) return;
    this.updateTimers();
    if (this.booking.qrCodeBase64) {
      this.qrDataUrl = this.booking.qrCodeBase64;
    } else {
      QRCode.toDataURL(this.booking.qrCodeToken || this.booking.code, { width: 260, margin: 1, errorCorrectionLevel: 'M' })
        .then(url => this.qrDataUrl = url)
        .catch(() => this.qrDataUrl = '');
    }
    if (this.booking.bookingId) {
      this.bookingService.refreshBooking(this.booking.bookingId).then(b => {
        if (b) {
          this.booking = b;
          if (b.qrCodeBase64) this.qrDataUrl = b.qrCodeBase64;
          this.updateTimers();
        }
      });
    }
    this.intervalId = setInterval(() => this.updateTimers(), 1000);
    this.wsSub = this.bookingService.events$.subscribe(msg => {
      if (this.booking?.bookingId && ['BOOKING_VERIFIED', 'BOOKING_EXPIRED', 'GATE_EVENT'].includes(msg.event)) {
        this.bookingService.refreshBooking(this.booking.bookingId).then(b => {
          if (b) {
            this.booking = b;
            this.updateTimers();
          }
        });
      }
    });
  }

  private updateTimers(): void {
    if (!this.booking) return;
    this.expired = this.bookingService.isExpired(this.booking);
    this.expiryText = new Date(this.booking.expiresAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const sec = Math.max(0, Math.floor((this.booking.expiresAt - Date.now()) / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    this.remainingText = this.booking.status && this.booking.status !== 'PENDING'
      ? this.booking.status
      : `còn ${m}p ${String(s).padStart(2, '0')}s`;
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    this.wsSub?.unsubscribe();
  }

  newBooking(): void {
    this.router.navigateByUrl('/booking');
  }

  logout(): void {
    this.auth.logout();
  }
}

