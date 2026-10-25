import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
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
        <nav class="nav"><a routerLink="/home">Trang chủ</a><a routerLink="/booking">Đặt chỗ</a><a routerLink="/login" (click)="logout()">Đăng xuất</a></nav>
      </header>
      <main class="page" *ngIf="booking; else noBooking">
        <div class="eyebrow">ĐẶT CHỖ THÀNH CÔNG</div>
        <h1>Mọi thứ đã sẵn sàng!</h1>
        <p class="lead">Lưu mã QR này và xuất trình tại cổng bãi xe khi đến nơi.</p>
        <div class="stepper">
          <div class="step done"><span class="step-num"><i class="pi pi-check"></i></span><span>Chọn thông tin</span></div><div class="step-line"></div>
          <div class="step done"><span class="step-num"><i class="pi pi-check"></i></span><span>Xác nhận</span></div><div class="step-line"></div>
          <div class="step active"><span class="step-num">3</span><span>Mã QR</span></div>
        </div>
        <div class="qr-layout">
          <section class="panel">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px">
              <span class="brand-mark"><i class="pi pi-check"></i></span>
              <div><h2 style="margin-bottom:4px">Thông tin đặt chỗ</h2><span class="lead">Vui lòng kiểm tra lại trước khi di chuyển.</span></div>
            </div>
            <div class="summary-row"><span>Mã đặt chỗ</span><strong>{{ booking.code }}</strong></div>
            <div class="summary-row"><span>Bãi xe</span><strong>{{ booking.lotName }}</strong></div>
            <div class="summary-row"><span>Địa chỉ</span><strong>{{ booking.address }}</strong></div>
            <div class="summary-row"><span>Slot</span><strong>{{ booking.slot }}</strong></div>
            <div class="summary-row"><span>Ngày đến</span><strong>{{ booking.date }}</strong></div>
            <div class="summary-row"><span>Giờ đến</span><strong>{{ booking.time }}</strong></div>
            <div class="summary-row"><span>Thời hạn QR</span><strong>{{ expiryText }}</strong></div>
            <div class="notice"><i class="pi pi-clock"></i><span>{{ expired ? 'Mã QR demo đã hết hạn. Bạn cần tạo đặt chỗ mới.' : 'Mã QR chỉ có hiệu lực trong 15 phút kể từ lúc đặt chỗ. Hãy đến cổng và quét mã trong thời gian này.' }}</span></div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:22px">
              <button pButton type="button" label="Đặt chỗ mới" icon="pi pi-plus" (click)="newBooking()">Đặt chỗ mới</button>
              <button pButton type="button" label="Về trang chủ" icon="pi pi-home" severity="secondary" [outlined]="true" routerLink="/home">Về trang chủ</button>
            </div>
          </section>
          <aside class="panel qr-panel">
            <div class="eyebrow">MÃ CHECK-IN</div>
            <h2>Quét mã tại cổng</h2>
            <img *ngIf="qrDataUrl" class="qr-image" [src]="qrDataUrl" alt="Mã QR đặt chỗ">
            <div *ngIf="!qrDataUrl" class="qr-image" style="display:grid;place-items:center;color:#8a99a2"><i class="pi pi-qrcode" style="font-size:80px"></i></div>
            <div class="booking-code">{{ booking.code }}</div>
            <p class="lead" style="font-size:12px;margin-top:14px">Không chia sẻ mã QR với người khác.</p>
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
  private intervalId?: ReturnType<typeof setInterval>;

  constructor(private bookingService: BookingService, private router: Router, private auth: AuthService) {}

  ngOnInit(): void {
    this.booking = this.bookingService.getBooking();
    if (!this.booking) return;
    this.expired = this.bookingService.isExpired(this.booking);
    this.expiryText = new Date(this.booking.expiresAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    // QR chứa mã đặt chỗ demo; khi triển khai thật, nên dùng token do backend phát hành.
    QRCode.toDataURL(this.booking.code, { width: 260, margin: 1, errorCorrectionLevel: 'M' })
      .then(url => this.qrDataUrl = url)
      .catch(() => this.qrDataUrl = '');
    this.intervalId = setInterval(() => {
      if (this.booking) this.expired = this.bookingService.isExpired(this.booking);
    }, 1000);
  }

  ngOnDestroy(): void {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  newBooking(): void {
    this.router.navigateByUrl('/booking');
  }

  logout(): void {
    this.auth.logout();
  }
}
