import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { Subscription } from 'rxjs';
import { AuthService, SessionUser, UserRole } from '../../services/auth.service';
import { BookingService } from '../../services/booking.service';
import {
  GateEventItem,
  ReportSessionItem,
  ReportSummary,
  RevenueBucket,
  SessionStatus,
  TrafficHour,
} from '../../models/parking.models';

type AdminTab = 'overview' | 'sessions' | 'events' | 'users';

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
          <a class="active" routerLink="/admin">Dashboard Quản trị</a>
          <a routerLink="/guard">Trạm Bảo vệ</a>
          <a routerLink="/home">Trang chủ</a>
          <span style="font-size:12px;color:var(--muted)"> {{ adminName }}</span>
          <button pButton type="button" severity="secondary" [outlined]="true" (click)="logout()">Đăng xuất</button>
        </nav>
      </header>

      <main class="page">
        <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:12px;margin-bottom:20px">
          <div>
            <div class="eyebrow">SYSTEM ADMINISTRATION & ANALYTICS</div>
            <h1>Quản trị Hệ thống, Doanh thu & Lịch sử Ra vào</h1>
            <p class="lead">Theo dõi doanh thu thời gian thực, đối soát nhật ký cổng và quản lý tài khoản nhân viên Bảo vệ.</p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button
              type="button"
              class="mini-btn"
              [class.primary]="activeTab === 'overview'"
              (click)="switchTab('overview')">
              Tổng quan & Biểu đồ
            </button>
            <button
              type="button"
              class="mini-btn"
              [class.primary]="activeTab === 'sessions'"
              (click)="switchTab('sessions')">
              Lịch sử Ra vào
            </button>
            <button
              type="button"
              class="mini-btn"
              [class.primary]="activeTab === 'events'"
              (click)="switchTab('events')">
              Nhật ký Cổng (Audit)
            </button>
            <button
              type="button"
              class="mini-btn"
              [class.primary]="activeTab === 'users'"
              (click)="switchTab('users')">
              👥 Tài khoản Bảo vệ
            </button>
          </div>
        </div>

        <div class="notice" *ngIf="bannerMessage" style="margin-bottom:18px">
          <i class="pi pi-check-circle"></i>
          <span>{{ bannerMessage }}</span>
        </div>
        <p class="error-text" *ngIf="errorMessage" style="margin-bottom:16px;font-weight:700">{{ errorMessage }}</p>

        <!-- ======================= TAB 1: TỔNG QUAN & BIỂU ĐỒ ======================= -->
        <ng-container *ngIf="activeTab === 'overview'">
          <!-- KPI Cards -->
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:22px">
            <section class="panel" style="padding:18px">
              <div style="font-size:12px;color:var(--muted);font-weight:600">TỔNG DOANH THU ĐÃ THU</div>
              <div style="font-size:26px;font-weight:800;color:var(--brand);margin:6px 0">
                {{ summary?.total_revenue || 0 | number }}đ
              </div>
              <small style="color:var(--muted)">{{ summary?.paid_sessions_count || 0 }} lượt thanh toán hoàn tất</small>
            </section>

            <section class="panel" style="padding:18px">
              <div style="font-size:12px;color:var(--muted);font-weight:600">DOANH THU HÔM NAY</div>
              <div style="font-size:26px;font-weight:800;color:#0284c7;margin:6px 0">
                {{ summary?.today_revenue || 0 | number }}đ
              </div>
              <small style="color:var(--muted)">Giá: {{ summary?.hourly_rate || 10000 | number }}đ / giờ</small>
            </section>

            <section class="panel" style="padding:18px">
              <div style="font-size:12px;color:var(--muted);font-weight:600">CÔNG SUẤT BÃI XE HIỆN TẠI</div>
              <div style="font-size:26px;font-weight:800;margin:6px 0">
                {{ summary?.available_slots || 0 }}/{{ summary?.total_slots || 3 }} trống
              </div>
              <small style="color:var(--muted)">
                Đang đỗ: {{ summary?.active_parking_count || 0 }} xe · Giữ chỗ: {{ summary?.reserved_slots || 0 }}
              </small>
            </section>

            <section class="panel" style="padding:18px">
              <div style="font-size:12px;color:var(--muted);font-weight:600">HIỆU SUẤT ĐẶT TRƯỚC</div>
              <div style="font-size:26px;font-weight:800;margin:6px 0">
                {{ summary?.total_bookings || 0 }} vé
              </div>
              <small style="color:var(--muted)">
                No-show: {{ summary?.no_show_rate || 0 }}% · Đỗ TB: {{ summary?.avg_parking_minutes || 0 }} phút
              </small>
            </section>
          </div>

          <div class="booking-layout">
            <!-- Biểu đồ doanh thu -->
            <section class="panel">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:16px">
                <div>
                  <h2>Biểu đồ Doanh thu theo Thời gian</h2>
                  <p class="lead" style="font-size:12px">Tính theo múi giờ Việt Nam (UTC+7)</p>
                </div>
                <div style="display:flex;gap:6px">
                  <select class="native-input" style="width:auto;padding:6px 10px" [(ngModel)]="chartDays" (change)="loadCharts()">
                    <option [ngValue]="7">7 ngày qua</option>
                    <option [ngValue]="14">14 ngày qua</option>
                    <option [ngValue]="30">30 ngày qua</option>
                  </select>
                  <button type="button" class="link-btn" (click)="loadOverview()"><i class="pi pi-refresh"></i></button>
                </div>
              </div>

              <div style="display:flex;align-items:flex-end;gap:10px;height:210px;padding:20px 8px 8px;border-bottom:1px solid var(--line);overflow-x:auto">
                <div
                  *ngFor="let b of revenueSeries"
                  style="flex:1;min-width:44px;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end">
                  <small style="font-size:10px;font-weight:700;color:var(--brand)">
                    {{ b.revenue > 0 ? (b.revenue / 1000 + 'k') : '' }}
                  </small>
                  <div
                    [style.height.%]="barHeightPct(b.revenue, maxRevenue)"
                    style="width:100%;max-width:36px;min-height:4px;background:linear-gradient(180deg,#10b981,#059669);border-radius:6px 6px 2px 2px;transition:height .25s"
                    [title]="b.period + ': ' + (b.revenue | number) + 'đ (' + b.sessions + ' lượt)'">
                  </div>
                  <span style="font-size:11px;color:var(--muted)">{{ b.label }}</span>
                </div>
              </div>
            </section>

            <!-- Biểu đồ khung giờ cao điểm -->
            <aside class="panel">
              <h2>Khung giờ Xe vào Bãi (00h–23h)</h2>
              <p class="lead" style="font-size:12px;margin-bottom:14px">Phân bố lưu lượng xe quẹt thẻ IN theo giờ.</p>
              <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px">
                <div
                  *ngFor="let h of activeTrafficHours"
                  style="padding:8px;border:1px solid var(--line);border-radius:8px;text-align:center"
                  [style.background]="h.entries > 0 ? '#ecfdf5' : ''">
                  <div style="font-size:11px;color:var(--muted)">{{ h.label }}</div>
                  <strong style="font-size:15px;color:var(--brand)">{{ h.entries }}</strong>
                  <div style="font-size:10px;color:var(--muted)">lượt</div>
                </div>
              </div>
            </aside>
          </div>
        </ng-container>

        <!-- ======================= TAB 2: LỊCH SỬ RA VÀO ======================= -->
        <ng-container *ngIf="activeTab === 'sessions'">
          <section class="panel">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:16px">
              <div>
                <h2>Lịch sử Phiên Gửi xe & Thu phí</h2>
                <p class="lead" style="font-size:12px">Tra cứu chi tiết từng lượt xe, nhân viên cấp thẻ, nhân viên thu tiền và xuất báo cáo CSV.</p>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                <input
                  class="native-input"
                  style="width:160px;padding:6px 10px"
                  [(ngModel)]="sessionCardFilter"
                  placeholder="Tìm theo UID thẻ..."
                  (keyup.enter)="loadReportSessions()">
                <select class="native-input" style="width:auto;padding:6px 10px" [(ngModel)]="sessionStatusFilter" (change)="loadReportSessions()">
                  <option value="">Tất cả trạng thái</option>
                  <option value="EXITED">EXITED (Đã ra)</option>
                  <option value="PAID">PAID (Đã thu tiền)</option>
                  <option value="PAYMENT_PENDING">PAYMENT_PENDING (Chờ thu)</option>
                  <option value="PARKING">PARKING (Đang đỗ)</option>
                  <option value="AUTHORIZED">AUTHORIZED (Chờ vào)</option>
                  <option value="CANCELLED">CANCELLED (Đã hủy)</option>
                </select>
                <button pButton type="button" size="small" severity="secondary" (click)="loadReportSessions()">Lọc</button>
                <button pButton type="button" size="small" icon="pi pi-download" (click)="exportSessionsCsv()">Xuất CSV</button>
              </div>
            </div>

            <div style="overflow-x:auto">
              <table class="guard-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Thẻ RFID</th>
                    <th>Slot</th>
                    <th>Biển số / SĐT</th>
                    <th>Giờ vào</th>
                    <th>Giờ ra</th>
                    <th>Phí thu</th>
                    <th>NV Cấp / Thu</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let s of reportSessions">
                    <td>#{{ s.id }}</td>
                    <td><strong>{{ s.card_uid }}</strong></td>
                    <td>{{ s.slot_code }}</td>
                    <td>
                      <div>{{ s.license_plate || '—' }}</div>
                      <small style="color:var(--muted)">{{ s.phone_number || 'Vãng lai' }}</small>
                    </td>
                    <td>{{ s.time_in ? (s.time_in | date:'dd/MM HH:mm') : '—' }}</td>
                    <td>{{ s.time_out ? (s.time_out | date:'dd/MM HH:mm') : '—' }}</td>
                    <td><strong>{{ s.total_fee | number }}đ</strong> ({{ s.payment_status }})</td>
                    <td>
                      <div style="font-size:12px">Cấp: {{ s.issued_by_name || '—' }}</div>
                      <div style="font-size:12px;color:var(--muted)">Thu: {{ s.confirmed_by_name || '—' }}</div>
                    </td>
                    <td><span class="session-badge">{{ s.status }}</span></td>
                  </tr>
                  <tr *ngIf="reportSessions.length === 0">
                    <td colspan="9" style="text-align:center;color:var(--muted);padding:24px">Không có phiên gửi xe nào.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </ng-container>

        <!-- ======================= TAB 3: NHẬT KÝ CỔNG (AUDIT) ======================= -->
        <ng-container *ngIf="activeTab === 'events'">
          <section class="panel">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:16px">
              <div>
                <h2>Nhật ký Thao tác Cổng & Đối soát Override</h2>
                <p class="lead" style="font-size:12px">Mọi thao tác mở barrier khẩn cấp, từ chối thẻ hoặc xác nhận thu tiền đều được lưu vết tại đây.</p>
              </div>
              <div style="display:flex;gap:8px;align-items:center">
                <select class="native-input" style="width:auto;padding:6px 10px" [(ngModel)]="eventTypeFilter" (change)="loadGateEvents()">
                  <option value="">Tất cả sự kiện</option>
                  <option value="BARRIER_OVERRIDE">BARRIER_OVERRIDE (Mở cổng khẩn cấp)</option>
                  <option value="DENIED">DENIED (Thẻ bị từ chối)</option>
                  <option value="PAYMENT_CONFIRMED">PAYMENT_CONFIRMED (Thu tiền)</option>
                  <option value="CARD_ISSUED">CARD_ISSUED (Cấp thẻ QR)</option>
                  <option value="WALK_IN_ISSUED">WALK_IN_ISSUED (Khách vãng lai)</option>
                  <option value="ENTRY">ENTRY (Xe vào bãi)</option>
                  <option value="EXIT_REQUESTED">EXIT_REQUESTED (Yêu cầu ra)</option>
                  <option value="VEHICLE_EXITED">VEHICLE_EXITED (Xe đã ra)</option>
                </select>
                <button type="button" class="link-btn" (click)="loadGateEvents()"><i class="pi pi-refresh"></i> Tải lại</button>
              </div>
            </div>

            <div style="overflow-x:auto">
              <table class="guard-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Thời gian</th>
                    <th>Sự kiện</th>
                    <th>Người thực hiện</th>
                    <th>Nguồn</th>
                    <th>Cổng / Thẻ</th>
                    <th>Chi tiết / Lý do</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    *ngFor="let ev of gateEvents"
                    [style.background]="ev.event_type === 'BARRIER_OVERRIDE' ? '#fef3c7' : ev.event_type === 'DENIED' ? '#fee2e2' : ''">
                    <td>#{{ ev.id }}</td>
                    <td>{{ ev.created_at | date:'dd/MM/yyyy HH:mm:ss' }}</td>
                    <td><strong>{{ ev.event_type }}</strong></td>
                    <td>{{ ev.actor_name || 'Thiết bị / Tự động' }}</td>
                    <td><span class="session-badge">{{ ev.source }}</span></td>
                    <td>
                      <span *ngIf="ev.gate">Cổng {{ ev.gate }} </span>
                      <strong *ngIf="ev.card_uid">({{ ev.card_uid }})</strong>
                    </td>
                    <td>{{ ev.detail || '—' }}</td>
                  </tr>
                  <tr *ngIf="gateEvents.length === 0">
                    <td colspan="7" style="text-align:center;color:var(--muted);padding:24px">Chưa có sự kiện nào được ghi nhận.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </ng-container>

        <!-- ======================= TAB 4: QUẢN LÝ TÀI KHOẢN ======================= -->
        <ng-container *ngIf="activeTab === 'users'">
          <div class="booking-layout">
            <!-- Form cấp tài khoản Bảo vệ -->
            <section class="panel">
              <h2>1. Cấp tài khoản Bảo vệ mới</h2>
              <p class="lead" style="margin-bottom:16px">
                Tài khoản Bảo vệ chỉ do Admin cấp tại đây. Tài khoản Admin hệ thống được khởi tạo qua biến môi trường.
              </p>

              <form (ngSubmit)="createGuardAccount()">
                <div class="form-field">
                  <label>Họ và tên nhân viên bảo vệ *</label>
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

                <button pButton type="submit" icon="pi pi-user-plus" [disabled]="submitting">
                  {{ submitting ? 'Đang cấp tài khoản...' : 'Cấp tài khoản Bảo vệ (guard)' }}
                </button>
              </form>
            </section>

            <!-- Thống kê phân quyền -->
            <aside class="panel">
              <h2>Thống kê Phân quyền</h2>
              <div class="summary-row">
                <span>Quản trị viên (Admin)</span>
                <strong>{{ countByRole('admin') }} tài khoản</strong>
              </div>
              <div class="summary-row">
                <span>Bảo vệ trực cổng (Guard)</span>
                <strong>{{ countByRole('guard') }} tài khoản</strong>
              </div>
              <div class="summary-row">
                <span>Khách đặt chỗ (User)</span>
                <strong>{{ countByRole('user') }} tài khoản</strong>
              </div>
              <div class="notice" style="margin-top:18px">
                <i class="pi pi-info-circle"></i>
                <span>
                  Khi nhân viên nghỉ việc, hãy bấm <b>Khóa tài khoản</b> thay vì xóa để bảo toàn lịch sử thu tiền và nhật ký cổng.
                </span>
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
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let u of users" [style.opacity]="u.is_active === false ? '0.6' : '1'">
                    <td>#{{ u.id }}</td>
                    <td><strong>{{ u.name }}</strong></td>
                    <td>{{ u.email }}</td>
                    <td>{{ u.phone }}</td>
                    <td>
                      <span class="session-badge">{{ roleLabel(u.role) }}</span>
                    </td>
                    <td>
                      <span
                        class="session-badge"
                        [style.background]="u.is_active !== false ? '#dcfce7' : '#fee2e2'"
                        [style.color]="u.is_active !== false ? '#166534' : '#991b1b'">
                        {{ u.is_active !== false ? 'Hoạt động' : 'Đã khóa' }}
                      </span>
                    </td>
                    <td>
                      <div style="display:flex;gap:6px;flex-wrap:wrap" *ngIf="u.email !== currentAdminEmail; else currentAccountBadge">
                        <button
                          type="button"
                          class="mini-btn"
                          (click)="toggleUserStatus(u)">
                          {{ u.is_active !== false ? 'Khóa' : 'Mở khóa' }}
                        </button>
                        <button
                          type="button"
                          class="mini-btn"
                          (click)="promptResetPassword(u)">
                          Đặt lại MK
                        </button>
                      </div>
                      <ng-template #currentAccountBadge>
                        <small style="color:var(--muted)">Đang đăng nhập</small>
                      </ng-template>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </ng-container>
      </main>
    </div>
  `,
})
export class AdminComponent implements OnInit, OnDestroy {
  activeTab: AdminTab = 'overview';
  adminName = 'Quản trị viên';
  currentAdminEmail = '';
  bannerMessage = '';
  errorMessage = '';

  // Overview & Charts
  summary: ReportSummary | null = null;
  revenueSeries: RevenueBucket[] = [];
  trafficSeries: TrafficHour[] = [];
  chartDays = 7;

  // Sessions History
  reportSessions: ReportSessionItem[] = [];
  sessionStatusFilter: SessionStatus | '' = '';
  sessionCardFilter = '';

  // Audit Gate Events
  gateEvents: GateEventItem[] = [];
  eventTypeFilter = '';

  // Users Management
  users: SessionUser[] = [];
  name = '';
  email = '';
  phone = '';
  password = '';
  submitting = false;

  private wsSub?: Subscription;

  constructor(
    private auth: AuthService,
    private bookingService: BookingService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const current = this.auth.getCurrentUser();
    this.adminName = current?.name || 'Quản trị viên';
    this.currentAdminEmail = current?.email || '';
    this.bookingService.connectStaffWebSocket();
    this.loadOverview();
    this.loadUsers();
    this.wsSub = this.bookingService.events$.subscribe(() => {
      if (this.activeTab === 'overview') {
        this.loadOverview();
      } else if (this.activeTab === 'sessions') {
        this.loadReportSessions();
      } else if (this.activeTab === 'events') {
        this.loadGateEvents();
      }
    });
  }

  ngOnDestroy(): void {
    this.wsSub?.unsubscribe();
  }

  get maxRevenue(): number {
    const m = Math.max(0, ...this.revenueSeries.map((r) => r.revenue));
    return m > 0 ? m : 10000;
  }

  get activeTrafficHours(): TrafficHour[] {
    return this.trafficSeries;
  }

  barHeightPct(value: number, max: number): number {
    if (!value || max <= 0) return 4;
    return Math.max(8, Math.min(100, Math.round((value / max) * 100)));
  }

  switchTab(tab: AdminTab): void {
    this.activeTab = tab;
    this.bannerMessage = '';
    this.errorMessage = '';
    if (tab === 'overview') {
      this.loadOverview();
    } else if (tab === 'sessions') {
      this.loadReportSessions();
    } else if (tab === 'events') {
      this.loadGateEvents();
    } else if (tab === 'users') {
      this.loadUsers();
    }
  }

  async loadOverview(): Promise<void> {
    try {
      const [summary, rev, traffic] = await Promise.all([
        this.bookingService.getReportSummary(),
        this.bookingService.getRevenueSeries(this.chartDays, 'day'),
        this.bookingService.getTrafficSeries(this.chartDays),
      ]);
      this.summary = summary;
      this.revenueSeries = rev;
      this.trafficSeries = traffic;
      this.cdr.markForCheck();
    } catch {
      this.errorMessage = 'Không tải được dữ liệu báo cáo từ Backend.';
      this.cdr.markForCheck();
    }
  }

  async loadCharts(): Promise<void> {
    try {
      const [rev, traffic] = await Promise.all([
        this.bookingService.getRevenueSeries(this.chartDays, 'day'),
        this.bookingService.getTrafficSeries(this.chartDays),
      ]);
      this.revenueSeries = rev;
      this.trafficSeries = traffic;
      this.cdr.markForCheck();
    } catch {
      // ignore
    }
  }

  async loadReportSessions(): Promise<void> {
    try {
      this.reportSessions = await this.bookingService.getReportSessions(
        80,
        this.sessionStatusFilter,
        this.sessionCardFilter
      );
      this.cdr.markForCheck();
    } catch {
      this.errorMessage = 'Không tải được lịch sử phiên gửi xe.';
      this.cdr.markForCheck();
    }
  }

  exportSessionsCsv(): void {
    const headers = [
      'ID',
      'Card_UID',
      'Slot',
      'License_Plate',
      'Phone',
      'Time_In',
      'Time_Out',
      'Total_Fee_VND',
      'Payment_Status',
      'Status',
      'Issued_By',
      'Confirmed_By',
    ];
    const rows = this.reportSessions.map((s) => [
      s.id,
      s.card_uid,
      s.slot_code,
      s.license_plate || '',
      s.phone_number || '',
      s.time_in || '',
      s.time_out || '',
      s.total_fee,
      s.payment_status,
      s.status,
      s.issued_by_name || '',
      s.confirmed_by_name || '',
    ]);
    const csvContent =
      '\uFEFF' +
      [headers, ...rows]
        .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lich-su-gui-xe-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async loadGateEvents(): Promise<void> {
    try {
      this.gateEvents = await this.bookingService.getGateEvents(80, this.eventTypeFilter);
      this.cdr.markForCheck();
    } catch {
      this.errorMessage = 'Không tải được nhật ký thao tác cổng.';
      this.cdr.markForCheck();
    }
  }

  async loadUsers(): Promise<void> {
    try {
      this.users = await this.auth.adminListUsers();
      this.cdr.markForCheck();
    } catch {
      this.errorMessage = 'Không tải được danh sách tài khoản từ Backend.';
      this.cdr.markForCheck();
    }
  }

  countByRole(role: UserRole): number {
    return this.users.filter((u) => u.role === role).length;
  }

  roleLabel(role: UserRole): string {
    if (role === 'admin') return '👑 Admin';
    if (role === 'guard') return '🛡️ Bảo vệ';
    return '👤 Khách hàng';
  }

  async createGuardAccount(): Promise<void> {
    this.bannerMessage = '';
    this.errorMessage = '';
    if (!this.name.trim() || !this.email.trim() || !this.phone.trim() || !this.password.trim()) {
      this.errorMessage = 'Vui lòng điền đầy đủ họ tên, email, số điện thoại và mật khẩu.';
      return;
    }
    this.submitting = true;
    const res = await this.auth.adminCreateUser({
      name: this.name,
      email: this.email,
      phone: this.phone,
      password: this.password,
    });
    this.submitting = false;

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
    await this.loadUsers();
  }

  async toggleUserStatus(user: SessionUser): Promise<void> {
    if (!user.id) return;
    this.bannerMessage = '';
    this.errorMessage = '';
    const nextActive = user.is_active === false;
    const res = await this.auth.adminSetUserStatus(user.id, nextActive);
    if (!res.ok) {
      this.errorMessage = res.message;
    } else {
      this.bannerMessage = res.message;
      await this.loadUsers();
    }
    this.cdr.markForCheck();
  }

  async promptResetPassword(user: SessionUser): Promise<void> {
    if (!user.id) return;
    const newPass = window.prompt(`Nhập mật khẩu mới cho tài khoản ${user.email} (ít nhất 6 ký tự):`, '');
    if (!newPass) return;
    this.bannerMessage = '';
    this.errorMessage = '';
    const res = await this.auth.adminResetPassword(user.id, newPass.trim());
    if (!res.ok) {
      this.errorMessage = res.message;
    } else {
      this.bannerMessage = `Đã đặt lại mật khẩu cho ${user.email}.`;
    }
    this.cdr.markForCheck();
  }

  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
