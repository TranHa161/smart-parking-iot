import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, InputTextModule, PasswordModule, ButtonModule],
  template: `
    <div class="auth-wrap">
      <aside class="auth-art">
        <a class="brand" routerLink="/home"><span class="brand-mark"><i class="pi pi-car"></i></span> ParkSmart</a>
        <div class="art-copy">
          <div class="eyebrow">BẮT ĐẦU NGAY HÔM NAY</div>
          <h1>Một chỗ đỗ.<br>Một hành trình nhẹ nhàng.</h1>
          <p>Tạo tài khoản để đặt chỗ trước, xem lại lịch sử và check-in thuận tiện hơn.</p>
          <div class="art-features"><span class="art-pill"><i class="pi pi-check-circle"></i> Đặt chỗ tiện lợi</span><span class="art-pill"><i class="pi pi-clock"></i> Tiết kiệm thời gian</span></div>
        </div>
        <small>Giải pháp bãi đỗ xe thông minh</small>
      </aside>
      <main class="auth-side">
        <form class="auth-card" (ngSubmit)="submit()">
          <div class="eyebrow">TẠO TÀI KHOẢN</div>
          <h1 style="font-size:32px">Đăng ký</h1>
          <p class="lead">Điền thông tin để bắt đầu sử dụng ParkSmart.</p>
          <div class="form-field">
            <label for="name">Họ và tên</label>
            <input pInputText id="name" name="name" [(ngModel)]="name" placeholder="Nguyễn Văn A" autocomplete="name" required>
          </div>
          <div class="form-field">
            <label for="email">Email</label>
            <input pInputText id="email" name="email" type="email" [(ngModel)]="email" placeholder="ban@example.com" autocomplete="email" required>
          </div>
          <div class="form-field">
            <label for="phone">Số điện thoại</label>
            <input pInputText id="phone" name="phone" [(ngModel)]="phone" placeholder="09xx xxx xxx" autocomplete="tel" required>
          </div>
          <div class="form-field">
            <label for="password">Mật khẩu</label>
            <p-password inputId="password" name="password" [(ngModel)]="password" [feedback]="true" [toggleMask]="true" placeholder="Ít nhất 6 ký tự" autocomplete="new-password" />
          </div>
          <div class="form-field">
            <label for="confirmPassword">Xác nhận mật khẩu</label>
            <p-password inputId="confirmPassword" name="confirmPassword" [(ngModel)]="confirmPassword" [feedback]="false" [toggleMask]="true" placeholder="Nhập lại mật khẩu" autocomplete="new-password" />
          </div>
          <p-button type="submit" label="Tạo tài khoản" icon="pi pi-user-plus" iconPos="right" styleClass="full-button" [disabled]="!name.trim() || !email.trim() || !phone.trim() || password.length < 6 || !confirmPassword"></p-button>
          <p class="error-text" *ngIf="error">{{ error }}</p>
          <p class="auth-bottom">Đã có tài khoản? <a routerLink="/login"><b>Đăng nhập</b></a></p>
        </form>
      </main>
    </div>
  `
})
export class RegisterComponent {
  name = '';
  email = '';
  phone = '';
  password = '';
  confirmPassword = '';
  error = '';

  constructor(private auth: AuthService, private router: Router) {}

  submit(): void {
    this.error = '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim())) {
      this.error = 'Vui lòng nhập email hợp lệ.';
      return;
    }
    if (!/^[0-9+\s()-]{9,15}$/.test(this.phone.trim())) {
      this.error = 'Vui lòng nhập số điện thoại hợp lệ.';
      return;
    }
    if (this.password.length < 6) {
      this.error = 'Mật khẩu cần có ít nhất 6 ký tự.';
      return;
    }
    if (this.password !== this.confirmPassword) {
      this.error = 'Mật khẩu xác nhận không khớp.';
      return;
    }
    const result = this.auth.register(this.name.trim(), this.email.trim(), this.phone.trim(), this.password);
    if (!result.ok) {
      this.error = result.message;
      return;
    }
    this.router.navigateByUrl('/login');
  }
}
