import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, InputTextModule, PasswordModule, ButtonModule],
  providers: [MessageService],
  template: `
    <div class="auth-wrap">
      <aside class="auth-art">
        <a class="brand" routerLink="/home"><span class="brand-mark"><i class="pi pi-car"></i></span> ParkSmart</a>
        <div class="art-copy">
          <div class="eyebrow">SMART PARKING</div>
          <h1>Đỗ xe dễ dàng.<br>Di chuyển thảnh thơi.</h1>
          <p>Tìm bãi xe phù hợp, giữ chỗ trước và sử dụng mã QR để check-in nhanh chóng.</p>
          <div class="art-features"><span class="art-pill"><i class="pi pi-map-marker"></i> Tìm bãi xe</span><span class="art-pill"><i class="pi pi-calendar"></i> Giữ chỗ trước</span><span class="art-pill"><i class="pi pi-qrcode"></i> QR check-in</span></div>
        </div>
        <small>Giải pháp bãi đỗ xe thông minh</small>
      </aside>
      <main class="auth-side">
        <form class="auth-card" (ngSubmit)="submit()">
          <div class="eyebrow">CHÀO MỪNG TRỞ LẠI</div>
          <h1 style="font-size:32px">Đăng nhập</h1>
          <p class="lead">Đăng nhập để quản lý và theo dõi lượt đặt chỗ của bạn.</p>

          <div class="form-field">
            <label for="email">Email</label>
            <input pInputText id="email" type="email" name="email" [(ngModel)]="email" placeholder="ban@example.com" autocomplete="email" required>
          </div>
          <div class="form-field">
            <label for="password">Mật khẩu</label>
            <p-password inputId="password" name="password" [(ngModel)]="password" [feedback]="false" [toggleMask]="true" placeholder="Nhập mật khẩu" autocomplete="current-password" />
          </div>
          <div class="form-foot"><span><i class="pi pi-lock"></i> Tài khoản của bạn được bảo vệ</span><a routerLink="/register">Quên mật khẩu?</a></div>
          <p-button type="submit" label="Đăng nhập" icon="pi pi-arrow-right" iconPos="right" styleClass="full-button" [disabled]="!email.trim() || !password"></p-button>
          <p class="error-text" *ngIf="error">{{ error }}</p>
          <div class="auth-bottom">Chưa có tài khoản? <a routerLink="/register"><b>Tạo tài khoản</b></a></div>
        </form>
      </main>
    </div>
  `
})
export class LoginComponent {
  email = '';
  password = '';
  error = '';

  constructor(private auth: AuthService, private router: Router) {}

  submit(): void {
    const result = this.auth.login(this.email.trim(), this.password);
    if (!result.ok) {
      this.error = result.message;
      return;
    }
    this.router.navigateByUrl('/home');
  }
}
