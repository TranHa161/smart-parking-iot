import { ChangeDetectorRef, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ButtonModule],
  template: `
    <div class="auth-wrap">
      <aside class="auth-art">
        <a class="brand" routerLink="/home"><span class="brand-mark"><i class="pi pi-car"></i></span> ParkSmart</a>
        <div class="art-copy">
          <div class="eyebrow">SMART PARKING</div>
          <h1>Đỗ xe dễ dàng.<br>Di chuyển thảnh thơi.</h1>
          <p>Tìm bãi xe phù hợp, giữ chỗ trước và sử dụng mã QR để check-in nhanh chóng.</p>
          <div class="art-features">
            <span class="art-pill"><i class="pi pi-map-marker"></i> Tìm bãi xe</span>
            <span class="art-pill"><i class="pi pi-calendar"></i> Giữ chỗ trước</span>
            <span class="art-pill"><i class="pi pi-qrcode"></i> QR check-in</span>
          </div>
        </div>
        <small>Giải pháp bãi đỗ xe thông minh</small>
      </aside>
      <main class="auth-side">
        <form class="auth-card" (ngSubmit)="submit(emailInput.value, passwordInput.value)">
          <div class="eyebrow">CHÀO MỪNG TRỞ LẠI</div>
          <h1 style="font-size:32px">Đăng nhập</h1>
          <p class="lead">Đăng nhập bằng tài khoản Khách hàng, Bảo vệ hoặc Quản trị viên (Admin).</p>

          <div class="form-field">
            <label for="email">Email</label>
            <input
              #emailInput
              class="native-input"
              id="email"
              type="email"
              name="email"
              [(ngModel)]="email"
              (input)="email = emailInput.value"
              (change)="email = emailInput.value"
              placeholder="ban@example.com"
              autocomplete="email"
              required>
          </div>
          <div class="form-field">
            <label for="password">Mật khẩu</label>
            <div style="position:relative">
              <input
                #passwordInput
                class="native-input"
                id="password"
                name="password"
                [type]="showPassword ? 'text' : 'password'"
                [(ngModel)]="password"
                (input)="password = passwordInput.value"
                (change)="password = passwordInput.value"
                placeholder="Nhập mật khẩu"
                autocomplete="current-password"
                style="padding-right:40px"
                required>
              <button
                type="button"
                (click)="togglePassword(emailInput.value, passwordInput.value)"
                style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:0;color:var(--muted);cursor:pointer">
                <i class="pi" [ngClass]="showPassword ? 'pi-eye-slash' : 'pi-eye'"></i>
              </button>
            </div>
          </div>
          <div class="form-foot">
            <span><i class="pi pi-lock"></i> Phân quyền tự động: Khách / Bảo vệ / Admin</span>
            <a routerLink="/register">Đăng ký khách mới</a>
          </div>
          <button
            pButton
            type="submit"
            class="full-button"
            icon="pi pi-arrow-right"
            iconPos="right"
            (click)="submit(emailInput.value, passwordInput.value)"
            [disabled]="submitting">
            {{ submitting ? 'Đang đăng nhập...' : 'Đăng nhập' }}
          </button>
          <p class="error-text" *ngIf="error" style="margin-top:12px;font-weight:600">{{ error }}</p>
          <div class="auth-bottom">Khách hàng chưa có tài khoản? <a routerLink="/register"><b>Tạo tài khoản</b></a></div>
        </form>
      </main>
    </div>
  `
})
export class LoginComponent {
  email = '';
  password = '';
  showPassword = false;
  error = '';
  submitting = false;

  constructor(
    private auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  togglePassword(domEmail: string, domPassword: string): void {
    this.email = domEmail || this.email;
    this.password = domPassword || this.password;
    this.showPassword = !this.showPassword;
  }

  async submit(domEmail?: string, domPassword?: string): Promise<void> {
    if (this.submitting) return;
    this.error = '';
    const emailVal = (domEmail ?? this.email ?? '').trim();
    const passVal = domPassword ?? this.password ?? '';
    this.email = emailVal;
    this.password = passVal;

    if (!emailVal || !passVal) {
      this.error = 'Vui lòng nhập đầy đủ email và mật khẩu.';
      this.cdr.markForCheck();
      return;
    }
    this.submitting = true;
    this.cdr.markForCheck();
    try {
      const result = await this.auth.login(emailVal, passVal);
      if (!result.ok) {
        this.error = result.message;
        this.cdr.markForCheck();
        return;
      }
      if (result.role === 'admin') {
        this.router.navigateByUrl('/admin');
      } else if (result.role === 'guard') {
        this.router.navigateByUrl('/guard');
      } else {
        this.router.navigateByUrl('/home');
      }
    } finally {
      this.submitting = false;
      this.cdr.markForCheck();
    }
  }
}
