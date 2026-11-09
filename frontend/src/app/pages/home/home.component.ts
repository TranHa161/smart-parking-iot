import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { BookingService } from '../../services/booking.service';
import { PARKING_LOTS } from '../../data/parking-lots';
import { ParkingLot } from '../../models/parking.models';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink, ButtonModule, RouterLinkActive],
  template: `
    <div class="shell">
      <header class="topbar">
        <a class="brand" routerLink="/home"><span class="brand-mark"><i class="pi pi-car"></i></span> ParkSmart</a>
        
      <nav class="nav">
        <a routerLink="/home" routerLinkActive="active"
          [routerLinkActiveOptions]="{ exact: true }">
          Trang chủ
        </a>

        <a routerLink="/booking" routerLinkActive="active">
          Đặt slot
        </a>

        <a routerLink="/guard" routerLinkActive="active">
          Trạm Bảo vệ
        </a>

        <ng-container *ngIf="isLoggedIn; else loginButton">
          <button
            pButton
            type="button"
            severity="secondary"
            [outlined]="true"
            (click)="logout()">
          Đăng xuất</button>
        </ng-container>

        <ng-template #loginButton>
          <button
            pButton
            type="button"
            (click)="goLogin()">
          Đăng nhập</button>
        </ng-template>
      </nav>

      </header>
      <main class="page">
        <section class="hero">
          <div>
            <div class="eyebrow">BÃI ĐỖ XE THÔNG MINH IOT</div>
            <h1>Tìm chỗ đỗ xe.<br>Đặt trước thật dễ dàng.</h1>
            <p class="lead">Chủ động chọn bãi xe và vị trí đỗ theo thời gian thực từ cảm biến. Đến nơi, xuất trình mã QR để nhận thẻ RFID check-in.</p>
            <div style="margin-top:26px;display:flex;gap:12px;flex-wrap:wrap">
              <button pButton type="button" icon="pi pi-arrow-right" iconPos="right" (click)="goBooking()">Đặt chỗ ngay!</button>
              <button pButton type="button" severity="secondary" [outlined]="true" icon="pi pi-shield" routerLink="/guard">Mở Trạm Bảo vệ</button>
            </div>
          </div>
          <div class="hero-art"><div class="circle"></div><i class="pi pi-car big-icon"></i></div>
        </section>
        <div class="section-head">
          <div><div class="eyebrow">LỰA CHỌN CỦA BẠN</div><h2>Danh sách bãi xe gần bạn</h2><p class="lead">Chọn bãi xe để xem trạng thái cảm biến thời gian thực và đăng ký slot.</p></div>
        </div>
        <section class="parking-grid">
          <article class="parking-card" *ngFor="let lot of lots">
            <div class="parking-visual"><i class="pi pi-building"></i></div>
            <div class="parking-content">
              <h3>{{ lot.name }}</h3>
              <div class="address"><i class="pi pi-map-marker"></i><span>{{ lot.address }}</span></div>
              <div class="availability"><span>Còn trống</span><strong>{{ lot.availableSlots }}/{{ lot.totalSlots }} slot</strong></div>
              <p class="lead" style="font-size:12px;margin-bottom:16px">{{ lot.description }}</p>
              <button pButton type="button" icon="pi pi-arrow-right" iconPos="right" (click)="goBooking(lot)">Đặt chỗ</button>
            </div>
          </article>
        </section>
      </main>
    </div>
  `
})
export class HomeComponent implements OnInit, OnDestroy {
  lots: ParkingLot[] = PARKING_LOTS.map(l => ({ ...l }));
  hasBooking = false;
  isLoggedIn = false;
  private wsSub?: Subscription;

  constructor(
    private router: Router,
    private auth: AuthService,
    private bookingService: BookingService
  ) {
    this.hasBooking = !!localStorage.getItem('smart-parking-current-booking');
    this.checkLoginStatus();
  }

  ngOnInit(): void {
    this.loadLiveSlotSummary();
    this.wsSub = this.bookingService.events$.subscribe(msg => {
      if (['SLOT_UPDATED', 'BOOKING_EXPIRED', 'ENTRY_EXPIRED', 'VEHICLE_EXITED'].includes(msg.event)) {
        this.loadLiveSlotSummary();
      }
    });
  }

  ngOnDestroy(): void {
    this.wsSub?.unsubscribe();
  }

  async loadLiveSlotSummary(): Promise<void> {
    try {
      const slots = await this.bookingService.getSlots();
      if (slots && slots.length > 0 && this.lots.length > 0) {
        const available = slots.filter(s => s.status === 'AVAILABLE').length;
        this.lots[0] = {
          ...this.lots[0],
          name: 'Bãi xe Thông minh IoT (Mô hình STM32)',
          totalSlots: slots.length,
          availableSlots: available,
        };
      }
    } catch {
      // Giữ dữ liệu mặc định nếu chưa bật Backend
    }
  }

  checkLoginStatus(): void {
    this.isLoggedIn = !!this.auth.getCurrentUser();
  }

  goLogin(): void {
    this.router.navigateByUrl('/login');
  }

  goBooking(lot?: ParkingLot): void {
    if (!this.isLoggedIn) {
      this.router.navigateByUrl('/login');
      return;
    }

    this.router.navigate(['/booking'], {
      queryParams: lot ? { lot: lot.id } : {}
    });
  }

  logout(): void {
    this.auth.logout();
    this.isLoggedIn = false;
    this.router.navigateByUrl('/home');
  }
}


