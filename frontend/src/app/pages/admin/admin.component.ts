import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AuthService, SessionUser, UserRole } from '../../services/auth.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ButtonModule],
  template: `
    <div class="shell">
      <header class="topbar">
        <a class="brand" routerLink="/admin">
          <span class="brand-mark"><i class="pi pi-cog"></i></span> ParkSmart Admin
        </a>
        <nav class="nav">
          <a class="active" routerLink="/admin">Quản lý Tài khoản</a>
          <a routerLink="/guard">Trạm Bảo vệ</a>
          <a routerLink="/home">Trang chủ</a>
          <span style="font-size:12px;color:var(--muted)">👑 {{ adminName }}</span>
          <button pButton type="button" severity="secondary" [outlined]="true" (click)="logout()">Đăng xuất</button>
        </nav>
      </header>

      <main class="page">
        <div class="eyebrow">SYSTEM ADMINISTRATION</div>
        <h1>Quản trị Tài khoản & Cấp quyền Bảo vệ</h1>
        <p class="lead">Tài khoản Bảo vệ không tự đăng ký công khai mà do Admin trực tiếp cấp và quản lý tại đây.</p>

        <div class="notice" *ngIf="bannerMessage" style="margin-bottom:20px">
          <i class="pi pi-check-circle"></i>
          <span>{{ bannerMessage }}</span>
        </div>
        <p class="error-text" *ngIf="errorMessage" style="margin-bottom:16px;font-weight:700">{{ errorMessage }}</p>

        <div class="booking-layout">
          <!-- Form cấp tài khoản Bảo vệ -->
          <section class="panel">
            <h2>1. Cấp tài khoản Bảo vệ mới</h2>
            <p class="lead" style="margin-bottom:16px">Tạo tài khoản cho nhân viên bảo vệ trực cổng (hoặc tài khoản hệ thống).</p>

            <form (ngSubmit)="createAccount()">
              <div class="form-field">
                <label>Họ và tên nhân viên *</label>
                <input class="native-input" name="name" [(ngModel)]="name" placeholder="VD: Trần Văn Bảo Vệ" required>
              </div>
              <div class="form-field">
                <label>Email đăng nhập *</label>
                <input class="native-input" type="email" name="email" [(ngModel)]="email" placeholder="VD: guard2@parking.com" required>
              </div>
              <div class="form-field">
                <label>Số điện thoại *</label>
                <input class="native-input" name="phone" [(ngModel)]="phone" placeholder="VD: 0912345678" required>
              </div>
              <div class="form-field">
                <label>Mật khẩu khởi tạo *</label>
                <input class="native-input" type="text" name="password" [(ngModel)]="password" placeholder="Ít nhất 6 ký tự" required>
              </div>
              <div class="form-field">
                <label>Vai trò (Role) *</label>
                <select class="native-input" name="role" [(ngModel)]="role">
                  <option value="guard">🛡️ Bảo vệ trực cổng (guard)</option>
                  <option value="admin">👑 Quản trị viên (admin)</option>
                  <option value="user">👤 Khách đặt chỗ (user)</option>
                </select>
              </div>

              <button pButton type="submit" icon="pi pi-user-plus" [disabled]="submitting">
                {{ submitting ? 'Đang cấp tài khoản...' : 'Cấp tài khoản' }}
              </button>
            </form>
          </section>

          <!-- Thống kê nhanh -->
          <aside class="panel">
            <h2>Thống kê Phân quyền</h2>
            <div class="summary-row">
              <span>👑 Quản trị viên (Admin)</span>
              <strong>{{ countByRole('admin') }} tài khoản</strong>
            </div>
            <div class="summary-row">
              <span>🛡️ Bảo vệ (Guard)</span>
              <strong>{{ countByRole('guard') }} tài khoản</strong>
            </div>
            <div class="summary-row">
              <span>👤 Khách hàng (User)</span>
              <strong>{{ countByRole('user') }} tài khoản</strong>
            </div>
            <div class="notice" style="margin-top:18px">
              <i class="pi pi-info-circle"></i>
              <span>Nhân viên Bảo vệ sau khi được cấp tài khoản có thể đăng nhập tại <b>/login</b> để vào thẳng <b>Trạm Bảo vệ (/guard)</b>.</span>
            </div>
          </aside>
        </div>

        <!-- Danh sách tài khoản -->
        <section class="panel" style="margin-top:22px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <h2>2. Danh sách Tài khoản Hệ thống ({{ users.length }})</h2>
            <button type="button" class="link-btn" (click)="loadUsers()"><i class="pi pi-refresh"></i> Làm mới</button>
          </div>

          <div style="overflow-x:auto">
            <table class="guard-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Họ và tên</th>
                  <th>Email</th>
                  <th>Số điện thoại</th>
                  <th>Vai trò</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let u of users">
                  <td><b>#{{ u.id }}</b></td>
                  <td>{{ u.name }}</td>
                  <td><code>{{ u.email }}</code></td>
                  <td>{{ u.phone }}</td>
                  <td>
                    <span class="session-badge">
                      {{ roleLabel(u.role) }}
                    </span>
                  </td>
                  <td>
                    <button
                      *ngIf="u.email !== currentAdminEmail"
                      type="button"
                      class="mini-btn"
                      style="color:var(--danger);border-color:#f5c2c7"
                      (click)="deleteUser(u)">
                      Thu hồi / Xóa
                    </button>
                    <small *ngIf="u.email === currentAdminEmail" style="color:var(--muted)">Đang đăng nhập</small>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  `
})
export class AdminComponent implements OnInit {
  users: SessionUser[] = [];
  name = '';
  email = '';
  phone = '';
  password = '';
  role: UserRole = 'guard';
  submitting = false;
  bannerMessage = '';
  errorMessage = '';
  adminName = 'Quản trị viên';
  currentAdminEmail = '';

  constructor(
    private auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const current = this.auth.getCurrentUser();
    if (!current) {
      this.router.navigateByUrl('/login');
      return;
    }
    if (current.role !== 'admin') {
      this.router.navigateByUrl(current.role === 'guard' ? '/guard' : '/home');
      return;
    }
    this.adminName = current.name || 'Quản trị viên';
    this.currentAdminEmail = current.email;
    this.loadUsers();
  }

  async loadUsers(): Promise<void> {
    try {
      this.users = await this.auth.adminListUsers();
      this.cdr.markForCheck();
    } catch (err: any) {
      this.errorMessage = err?.error?.detail || 'Không thể tải danh sách tài khoản.';
      this.cdr.markForCheck();
    }
  }

  countByRole(role: UserRole): number {
    return this.users.filter(u => u.role === role).length;
  }

  roleLabel(role: UserRole): string {
    if (role === 'admin') return '👑 Admin';
    if (role === 'guard') return '🛡️ Bảo vệ';
    return '👤 Khách hàng';
  }

  async createAccount(): Promise<void> {
    if (this.submitting) return;
    this.bannerMessage = '';
    this.errorMessage = '';
    if (!this.name.trim() || !this.email.trim() || !this.phone.trim() || !this.password) {
      this.errorMessage = 'Vui lòng điền đầy đủ thông tin tài khoản.';
      this.cdr.markForCheck();
      return;
    }
    this.submitting = true;
    this.cdr.markForCheck();
    try {
      const res = await this.auth.adminCreateUser({
        name: this.name.trim(),
        email: this.email.trim(),
        phone: this.phone.trim(),
        password: this.password,
        role: this.role,
      });
      if (!res.ok) {
        this.errorMessage = res.message;
        this.cdr.markForCheck();
        return;
      }
      this.bannerMessage = res.message;
      this.name = '';
      this.email = '';
      this.phone = '';
      this.password = '';
      this.role = 'guard';
      await this.loadUsers();
    } finally {
      this.submitting = false;
      this.cdr.markForCheck();
    }
  }

  async deleteUser(user: SessionUser): Promise<void> {
    if (!user.id) return;
    this.bannerMessage = '';
    this.errorMessage = '';
    const res = await this.auth.adminDeleteUser(user.id);
    if (!res.ok) {
      this.errorMessage = res.message;
      this.cdr.markForCheck();
      return;
    }
    this.bannerMessage = `Đã thu hồi tài khoản ${user.email}.`;
    await this.loadUsers();
  }

  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
