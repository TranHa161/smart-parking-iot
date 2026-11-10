import { ChangeDetectorRef, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ButtonModule],
  template: `
    <div class="auth-wrap">
      <aside class="auth-art">
        <a class="brand" routerLink="/home"><span class="brand-mark"><i class="pi pi-car"></i></span> ParkSmart</a>
        <div class="art-copy">
          <div class="eyebrow">BẮT ĐẦU NGAY HÔM NAY</div>
          <h1>Một chỗ đỗ.<br>Một hành trình nhẹ nhàng.</h1>
          <p>Tạo tài khoản khách hàng để đặt chỗ trước, xem lại lịch sử và nhận mã QR check-in thuận tiện hơn.</p>
          <div class="art-features">
            <span class="art-pill"><i class="pi pi-check-circle"></i> Đặt chỗ tiện lợi</span>
            <span class="art-pill"><i class="pi pi-clock"></i> Giữ chỗ 15 phút</span>
          </div>
        </div>
        <small>Giải pháp bãi đỗ xe thông minh (Tài khoản Bảo vệ do Admin cấp)</small>
      </aside>
      <main class="auth-side">
        <form class="auth-card" (ngSubmit)="submit()">
          <div class="eyebrow">TẠO TÀI KHOẢN KHÁCH HÀNG</div>
          <h1 style="font-size:32px">Đăng ký</h1>
          <p class="lead">Điền thông tin để tạo tài khoản đặt chỗ trên ParkSmart.</p>
          <div class="form-field">
            <label for="name">Họ và tên *</label>
            <input class="native-input" id="name" name="name" [(ngModel)]="name" placeholder="Nguyễn Văn A" autocomplete="name" required>
          </div>
          <div class="form-field">
            <label for="email">Email *</label>
            <input class="native-input" id="email" name="email" type="email" [(ngModel)]="email" placeholder="ban@example.com" autocomplete="email" required>
          </div>
          <div class="form-field">
            <label for="phone">Số điện thoại *</label>
            <input class="native-input" id="phone" name="phone" [(ngModel)]="phone" placeholder="0912345678" autocomplete="tel" required>
          </div>
          <div class="form-field">
            <label for="password">Mật khẩu *</label>
            <div style="position:relative">
              <input
                class="native-input"
                id="password"
                name="password"
                [type]="showPassword ? 'text' : 'password'"
                [(ngModel)]="password"
                placeholder="Ít nhất 6 ký tự"
                autocomplete="new-password"
                style="padding-right:40px"
                required>
              <button
                type="button"
                (click)="showPassword = !showPassword"
                style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:0;color:var(--muted);cursor:pointer">
                <i class="pi" [ngClass]="showPassword ? 'pi-eye-slash' : 'pi-eye'"></i>
              </button>
            </div>
          </div>
          <div class="form-field">
            <label for="confirmPassword">Xác nhận mật khẩu *</label>
            <div style="position:relative">
              <input
                class="native-input"
                id="confirmPassword"
                name="confirmPassword"
                [type]="showConfirmPassword ? 'text' : 'password'"
                [(ngModel)]="confirmPassword"
                placeholder="Nhập lại mật khẩu"
                autocomplete="new-password"
                style="padding-right:40px"
                required>
              <button
                type="button"
                (click)="showConfirmPassword = !showConfirmPassword"
                style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:0;color:var(--muted);cursor:pointer">
                <i class="pi" [ngClass]="showConfirmPassword ? 'pi-eye-slash' : 'pi-eye'"></i>
              </button>
            </div>
          </div>
          <button
            pButton
            type="submit"
            class="full-button"
            icon="pi pi-user-plus"
            iconPos="right"
            [disabled]="submitting">
            {{ submitting ? 'Đang tạo tài khoản...' : 'Tạo tài khoản' }}
          </button>
          <p class="error-text" *ngIf="error" style="margin-top:12px;font-weight:600">{{ error }}</p>
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
  showPassword = false;
  showConfirmPassword = false;
  error = '';
  submitting = false;

  constructor(
    private auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  async submit(): Promise<void> {
    if (this.submitting) return;
    this.error = '';
    if (!this.name.trim()) {
      this.error = 'Vui lòng nhập họ và tên.';
      this.cdr.markForCheck();
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim())) {
      this.error = 'Vui lòng nhập email hợp lệ.';
      this.cdr.markForCheck();
      return;
    }
    const cleanPhone = this.phone.trim().replace(/[\s().-]/g, '');
    if (!/^\+?[0-9]{9,15}$/.test(cleanPhone)) {
      this.error = 'Số điện thoại không hợp lệ (cần 9-15 chữ số).';
      this.cdr.markForCheck();
      return;
    }
    if (this.password.length < 6) {
      this.error = 'Mật khẩu cần có ít nhất 6 ký tự.';
      this.cdr.markForCheck();
      return;
    }
    if (this.password !== this.confirmPassword) {
      this.error = 'Mật khẩu xác nhận không khớp.';
      this.cdr.markForCheck();
      return;
    }
    this.submitting = true;
    this.cdr.markForCheck();
    try {
      const result = await this.auth.register(
        this.name.trim(),
        this.email.trim(),
        cleanPhone,
        this.password
      );
      if (!result.ok) {
        this.error = result.message;
        this.cdr.markForCheck();
        return;
      }
      this.router.navigateByUrl('/home');
    } finally {
      this.submitting = false;
      this.cdr.markForCheck();
    }
  }
}
