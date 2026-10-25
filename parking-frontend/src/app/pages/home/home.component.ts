import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../../services/auth.service';
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
            <div class="eyebrow">BÃI ĐỖ XE THÔNG MINH</div>
            <h1>Tìm chỗ đỗ xe.<br>Đặt trước thật dễ dàng.</h1>
            <p class="lead">Chủ động chọn bãi xe và khung giờ phù hợp. Đến nơi, xuất trình mã QR để check-in nhanh chóng.</p>
            <div style="margin-top:26px"><button pButton type="button" icon="pi pi-arrow-right" iconPos="right" (click)="goBooking()">Đặt chỗ ngay!</button></div>
          </div>
          <div class="hero-art"><div class="circle"></div><i class="pi pi-car big-icon"></i></div>
        </section>
        <div class="section-head">
          <div><div class="eyebrow">LỰA CHỌN CỦA BẠN</div><h2>Danh sách bãi xe gần bạn</h2><p class="lead">Chọn bãi xe để xem thông tin và đăng ký slot.</p></div>
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

export class HomeComponent {
  lots: ParkingLot[] = PARKING_LOTS;
  hasBooking = false;
  isLoggedIn = false;

  constructor(
    private router: Router,
    private auth: AuthService
  ) {
    this.hasBooking = !!localStorage.getItem(
      'smart-parking-current-booking'
    );

    this.checkLoginStatus();
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

