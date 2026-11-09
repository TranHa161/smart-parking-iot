import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { Subscription } from 'rxjs';
import { BookingService } from '../../services/booking.service';
import { ParkingSessionItem, SlotItem } from '../../models/parking.models';

@Component({
  selector: 'app-guard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ButtonModule],
  template: `
    <div class="shell">
      <header class="topbar">
        <a class="brand" routerLink="/home"><span class="brand-mark"><i class="pi pi-car"></i></span> ParkSmart</a>
        <nav class="nav">
          <a routerLink="/home">Trang chủ</a>
          <a routerLink="/booking">Đặt chỗ</a>
          <a class="active" routerLink="/guard">Trạm Bảo vệ</a>
        </nav>
      </header>

      <main class="page">
        <div class="eyebrow">GUARD & GATE CONTROL</div>
        <h1>Trạm Bảo vệ & Điều khiển Cổng</h1>
        <p class="lead">Quản lý cấp thẻ RFID (QR đặt trước / vãng lai), thu phí và điều khiển Barrier thời gian thực.</p>

        <div class="notice" *ngIf="bannerMessage" style="margin-bottom:20px">
          <i class="pi pi-bell"></i>
          <span>{{ bannerMessage }}</span>
        </div>
        <p class="error-text" *ngIf="errorMessage" style="margin-bottom:16px;font-weight:700">{{ errorMessage }}</p>

        <!-- 1. Sơ đồ 4 Slot thời gian thực -->
        <section class="panel" style="margin-bottom:22px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <h2>1. Trạng thái Cảm biến & Đèn LED tại các Slot</h2>
            <button type="button" class="link-btn" (click)="refreshAll()"><i class="pi pi-refresh"></i> Làm mới</button>
          </div>
          <div class="slot-grid">
            <div
              *ngFor="let s of slots"
              class="slot-button"
              [class.slot-reserved]="s.status === 'RESERVED'"
              [class.slot-occupied]="s.status === 'OCCUPIED'"
              style="cursor:default;text-align:center">
              <div style="font-size:16px">{{ s.code }}</div>
              <div class="slot-status-tag">{{ statusLabel(s.status) }}</div>
              <small style="color:var(--muted);font-weight:400">HC-SR04: {{ s.distance_cm }} cm</small>
            </div>
          </div>
        </section>

        <!-- 2. Cấp thẻ RFID & Điều khiển cổng -->
        <div class="booking-layout" style="margin-bottom:22px">
          <section class="panel">
            <h2>2. Xác thực QR Đặt trước & Cấp thẻ RFID</h2>
            <p class="lead" style="margin-bottom:16px">Quét hoặc dán token QR của khách đặt trước để gán thẻ RFID.</p>
            <div class="form-field">
              <div style="display:flex;justify-content:space-between">
                <label>Mã QR Token *</label>
                <button type="button" class="link-btn" (click)="fillLatestCustomerQr()">Lấy mã QR vừa đặt trên máy này</button>
              </div>
              <input class="native-input" [(ngModel)]="qrTokenInput" placeholder="Dán qr_code_token của khách...">
            </div>
            <div class="form-field">
              <label>UID Thẻ RFID cấp cho khách *</label>
              <input class="native-input" [(ngModel)]="verifyCardUid" placeholder="Ví dụ: TEST_CARD_01 hoặc A1B2C3D4">
            </div>
            <button pButton type="button" icon="pi pi-qrcode" (click)="verifyQr()">Xác thực QR & Cấp thẻ</button>
          </section>

          <section class="panel">
            <h2>3. Đăng ký Thẻ & Cấp thẻ Khách vãng lai</h2>
            <div class="form-field">
              <label>Đăng ký UID thẻ RFID mới vào kho thẻ</label>
              <div style="display:flex;gap:8px">
                <input class="native-input" [(ngModel)]="newCardUid" placeholder="Ví dụ: TEST_CARD_01">
                <button pButton type="button" (click)="registerCard()">Đăng ký thẻ</button>
              </div>
            </div>
            <hr style="border:0;border-top:1px solid var(--line);margin:16px 0">
            <div class="form-field">
              <label>Cấp thẻ nhanh cho Khách vãng lai (Giữ 1 slot trống)</label>
              <div style="display:flex;gap:8px">
                <input class="native-input" [(ngModel)]="walkInCardUid" placeholder="UID thẻ (vd: TEST_CARD_01)">
                <button pButton type="button" severity="secondary" (click)="issueWalkIn()">Cấp thẻ vãng lai</button>
              </div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
              <button pButton type="button" severity="secondary" [outlined]="true" (click)="overrideBarrier('IN')">Mở Barrier VÀO (Override)</button>
              <button pButton type="button" severity="secondary" [outlined]="true" (click)="overrideBarrier('OUT')">Mở Barrier RA (Override)</button>
            </div>
          </section>
        </div>

        <!-- 3. Danh sách phiên gửi xe & Thu phí -->
        <section class="panel">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <h2>4. Danh sách Lượt gửi xe & Xác nhận Thanh toán</h2>
            <span class="lead">Tổng: {{ sessions.length }} lượt gần nhất</span>
          </div>
          <div style="overflow-x:auto">
            <table class="guard-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Thẻ RFID</th>
                  <th>Slot</th>
                  <th>Trạng thái</th>
                  <th>Giờ vào</th>
                  <th>Phí tạm tính / chốt</th>
                  <th>Thao tác (Mô phỏng quẹt thẻ / Thu tiền / Xe ra)</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let s of sessions">
                  <td>#{{ s.id }}</td>
                  <td><strong>{{ s.card_uid }}</strong></td>
                  <td>Slot {{ s.slot_id || '—' }}</td>
                  <td><span class="session-badge">{{ s.status }}</span></td>
                  <td>{{ s.time_in ? (s.time_in | date:'HH:mm:ss dd/MM') : 'Chưa vào' }}</td>
                  <td><strong>{{ s.total_fee | number }}đ</strong> ({{ s.payment_status }})</td>
                  <td>
                    <div style="display:flex;gap:6px;flex-wrap:wrap">
                      <button
                        *ngIf="s.status === 'AUTHORIZED'"
                        type="button"
                        class="mini-btn"
                        (click)="simulateSwipe('IN', s.card_uid)">
                        Quẹt IN (Mở cổng vào)
                      </button>
                      <button
                        *ngIf="s.status === 'PARKING'"
                        type="button"
                        class="mini-btn"
                        (click)="simulateSwipe('OUT', s.card_uid)">
                        Quẹt OUT (Báo phí)
                      </button>
                      <button
                        *ngIf="s.status === 'PAYMENT_PENDING'"
                        type="button"
                        class="mini-btn primary"
                        (click)="confirmPayment(s.id)">
                        Đã thu {{ s.total_fee | number }}đ & Mở cổng RA
                      </button>
                      <button
                        *ngIf="s.status === 'PAID'"
                        type="button"
                        class="mini-btn"
                        (click)="confirmExit(s.id)">
                        Xác nhận xe đã ra khỏi cổng
                      </button>
                    </div>
                  </td>
                </tr>
                <tr *ngIf="sessions.length === 0">
                  <td colspan="7" style="text-align:center;color:var(--muted);padding:24px">Chưa có lượt gửi xe nào.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  `,
})
export class GuardComponent implements OnInit, OnDestroy {
  slots: SlotItem[] = [];
  sessions: ParkingSessionItem[] = [];
  qrTokenInput = '';
  verifyCardUid = 'TEST_CARD_01';
  newCardUid = 'TEST_CARD_01';
  walkInCardUid = 'TEST_CARD_01';
  bannerMessage = '';
  errorMessage = '';
  private wsSub?: Subscription;

  constructor(private bookingService: BookingService) {}

  ngOnInit(): void {
    this.fillLatestCustomerQr();
    this.refreshAll();
    this.wsSub = this.bookingService.events$.subscribe((msg) => {
      if (msg.event === 'PAYMENT_REQUIRED') {
        this.bannerMessage = `Yêu cầu thanh toán phiên #${msg.data?.session_id} (Thẻ ${msg.data?.card_uid}): ${msg.data?.total_fee?.toLocaleString()}đ`;
      } else if (msg.event === 'GATE_DENIED') {
        this.errorMessage = `Từ chối thẻ ${msg.data?.card_uid}: ${msg.data?.reason}`;
      }
      this.refreshAll();
    });
  }

  ngOnDestroy(): void {
    this.wsSub?.unsubscribe();
  }

  async refreshAll(): Promise<void> {
    try {
      const [slots, sessions] = await Promise.all([
        this.bookingService.getSlots(),
        this.bookingService.getSessions(30),
      ]);
      this.slots = slots;
      this.sessions = sessions;
    } catch {
      this.errorMessage = 'Chưa kết nối được với Backend FastAPI.';
    }
  }

  fillLatestCustomerQr(): void {
    const current = this.bookingService.getBooking();
    if (current?.qrCodeToken || current?.code) {
      this.qrTokenInput = current.qrCodeToken || current.code;
    }
  }

  statusLabel(status: SlotItem['status']): string {
    if (status === 'AVAILABLE') return '🟢 Đèn Xanh (Trống)';
    if (status === 'RESERVED') return '🟡 Đèn Vàng (Giữ chỗ)';
    return '🔴 Đèn Đỏ (Có xe)';
  }

  private clearMessages(): void {
    this.errorMessage = '';
    this.bannerMessage = '';
  }

  async registerCard(): Promise<void> {
    if (!this.newCardUid.trim()) return;
    this.clearMessages();
    try {
      const res = await this.bookingService.registerCard(this.newCardUid.trim());
      this.bannerMessage = `Đã đăng ký thẻ ${res.card_uid} (${res.status}).`;
      this.verifyCardUid = res.card_uid;
      this.walkInCardUid = res.card_uid;
    } catch (err: any) {
      if (err?.status === 409) {
        this.bannerMessage = `Thẻ ${this.newCardUid.trim().toUpperCase()} đã có sẵn trong hệ thống và sẵn sàng sử dụng.`;
      } else {
        this.errorMessage = err?.error?.detail || 'Không thể đăng ký thẻ.';
      }
    }
  }

  async verifyQr(): Promise<void> {
    if (!this.qrTokenInput.trim() || !this.verifyCardUid.trim()) return;
    this.clearMessages();
    try {
      // Đảm bảo thẻ đã được đăng ký trước khi gán
      try {
        await this.bookingService.registerCard(this.verifyCardUid.trim());
      } catch {
        // Bỏ qua nếu thẻ đã tồn tại
      }
      const res = await this.bookingService.verifyQrAndAssignCard(
        this.qrTokenInput.trim(),
        this.verifyCardUid.trim()
      );
      this.bannerMessage = `Đã xác thực QR (#${res.booking_id}) và cấp thẻ ${this.verifyCardUid.toUpperCase()} cho Slot ${res.slot_id}. Mời khách quẹt thẻ tại cổng VÀO!`;
      await this.refreshAll();
    } catch (err: any) {
      this.errorMessage = err?.error?.detail || 'Xác thực QR thất bại.';
    }
  }

  async issueWalkIn(): Promise<void> {
    if (!this.walkInCardUid.trim()) return;
    this.clearMessages();
    try {
      try {
        await this.bookingService.registerCard(this.walkInCardUid.trim());
      } catch {
        // Bỏ qua nếu thẻ đã tồn tại
      }
      const res = await this.bookingService.createWalkIn(this.walkInCardUid.trim());
      this.bannerMessage = `Đã cấp thẻ vãng lai ${res.card_uid} giữ Slot ${res.slot_id} (Phiên #${res.session_id}). Mời khách quẹt thẻ tại cổng VÀO!`;
      await this.refreshAll();
    } catch (err: any) {
      this.errorMessage = err?.error?.detail || 'Không thể cấp thẻ vãng lai.';
    }
  }

  async simulateSwipe(gate: 'IN' | 'OUT', cardUid: string): Promise<void> {
    this.clearMessages();
    try {
      const res = await this.bookingService.swipeRfid(gate, cardUid);
      if (gate === 'IN') {
        this.bannerMessage = `Thẻ ${cardUid} đã quẹt cổng VÀO -> Đã phát lệnh OPEN_GATE mở Barrier!`;
      } else {
        this.bannerMessage = `Thẻ ${cardUid} quẹt cổng RA -> Phí cần thu: ${res.total_fee?.toLocaleString()}đ.`;
      }
      await this.refreshAll();
    } catch (err: any) {
      this.errorMessage = err?.error?.detail || `Lỗi quẹt thẻ cổng ${gate}.`;
    }
  }

  async confirmPayment(sessionId: number): Promise<void> {
    this.clearMessages();
    try {
      const res = await this.bookingService.confirmPayment(sessionId);
      this.bannerMessage = `Đã xác nhận thu ${res.total_fee?.toLocaleString()}đ cho phiên #${sessionId} -> Đã phát lệnh OPEN_GATE mở Barrier cổng RA!`;
      await this.refreshAll();
    } catch (err: any) {
      this.errorMessage = err?.error?.detail || 'Xác nhận thanh toán thất bại.';
    }
  }

  async confirmExit(sessionId: number): Promise<void> {
    this.clearMessages();
    try {
      await this.bookingService.confirmExit(sessionId);
      this.bannerMessage = `Đã xác nhận xe phiên #${sessionId} qua cổng RA, thu hồi thẻ RFID và giải phóng Slot!`;
      await this.refreshAll();
    } catch (err: any) {
      this.errorMessage = err?.error?.detail || 'Xác nhận xe ra thất bại.';
    }
  }

  async overrideBarrier(gate: 'IN' | 'OUT'): Promise<void> {
    this.clearMessages();
    try {
      await this.bookingService.overrideBarrier(gate, 'OPEN');
      this.bannerMessage = `Đã gửi lệnh mở khẩn cấp Barrier cổng ${gate}.`;
    } catch (err: any) {
      this.errorMessage = err?.error?.detail || 'Không thể gửi lệnh điều khiển Barrier.';
    }
  }
}
