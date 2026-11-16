import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, firstValueFrom } from 'rxjs';
import {
  Booking,
  BookingApiResponse,
  GateEventItem,
  GatewayStatus,
  ParkingSessionItem,
  ReportSessionItem,
  ReportSummary,
  RevenueBucket,
  SessionStatus,
  SlotItem,
  TrafficHour,
} from '../models/parking.models';

export interface WsParkingMessage {
  event: string;
  data: any;
}

@Injectable({ providedIn: 'root' })
export class BookingService {
  private readonly key = 'smart-parking-current-booking';
  private readonly apiBaseKey = 'smart-parking-api-base';
  private readonly tokenKey = 'smart-parking-access-token';
  private resolvedBaseUrl: string | null = null;
  private socket: WebSocket | null = null;
  private staffSocket: WebSocket | null = null;
  private readonly eventsSubject = new Subject<WsParkingMessage>();
  readonly events$: Observable<WsParkingMessage> = this.eventsSubject.asObservable();

  constructor(private http: HttpClient) {
    this.connectWebSocket();
  }

  private getCandidateBaseUrls(): string[] {
    if (typeof window === 'undefined') return [''];
    const candidates: string[] = [''];
    const saved = localStorage.getItem(this.apiBaseKey);
    if (saved) candidates.push(saved);
    if (window.location.port === '4200') {
      candidates.push('http://127.0.0.1:8000', 'http://127.0.0.1:8001');
    }
    return Array.from(new Set(candidates));
  }

  async resolveApiBase(): Promise<string> {
    if (this.resolvedBaseUrl !== null) {
      return this.resolvedBaseUrl;
    }
    for (const base of this.getCandidateBaseUrls()) {
      try {
        await firstValueFrom(this.http.get(`${base}/api/slots`));
        this.resolvedBaseUrl = base;
        if (typeof window !== 'undefined') {
          localStorage.setItem(this.apiBaseKey, base);
        }
        return base;
      } catch {
        // Thử ứng viên tiếp theo
      }
    }
    this.resolvedBaseUrl = '';
    return '';
  }

  async getSlots(): Promise<SlotItem[]> {
    const base = await this.resolveApiBase();
    return firstValueFrom(this.http.get<SlotItem[]>(`${base}/api/slots`));
  }

  // ---------------- USER BOOKINGS ----------------
  async createBookingApi(
    phoneNumber: string,
    slotId: number,
    lotMeta: {
      lotId: string;
      lotName: string;
      address: string;
      date: string;
      time: string;
      pricePerHour: number;
      licensePlate?: string;
    }
  ): Promise<Booking> {
    const base = await this.resolveApiBase();
    const res = await firstValueFrom(
      this.http.post<BookingApiResponse>(`${base}/api/bookings`, {
        phone_number: phoneNumber,
        slot_id: slotId,
        license_plate: lotMeta.licensePlate?.trim() || null,
      })
    );
    const expiresAtMs = this.parseUtcDate(res.expires_at);
    const result: Booking = {
      bookingId: res.id,
      code: res.qr_code_token || '',
      qrCodeToken: res.qr_code_token || '',
      qrCodeBase64: res.qr_code_base64,
      phoneNumber: res.phone_number,
      licensePlate: res.license_plate,
      status: res.status,
      lotId: lotMeta.lotId,
      lotName: lotMeta.lotName,
      address: lotMeta.address,
      slot: res.slot_code || `Slot ${res.slot_id}`,
      slotId: res.slot_id,
      date: lotMeta.date,
      time: lotMeta.time,
      expiresAt: expiresAtMs,
      pricePerHour: lotMeta.pricePerHour,
    };
    localStorage.setItem(this.key, JSON.stringify(result));
    return result;
  }

  async getMyBookings(): Promise<BookingApiResponse[]> {
    const base = await this.resolveApiBase();
    return firstValueFrom(this.http.get<BookingApiResponse[]>(`${base}/api/bookings/me`));
  }

  async cancelBooking(bookingId: number): Promise<BookingApiResponse> {
    const base = await this.resolveApiBase();
    const res = await firstValueFrom(
      this.http.post<BookingApiResponse>(`${base}/api/bookings/${bookingId}/cancel`, {})
    );
    const current = this.getBooking();
    if (current && current.bookingId === bookingId) {
      current.status = res.status;
      localStorage.setItem(this.key, JSON.stringify(current));
    }
    return res;
  }

  async refreshBooking(bookingId: number): Promise<Booking | null> {
    const current = this.getBooking();
    try {
      const base = await this.resolveApiBase();
      const res = await firstValueFrom(
        this.http.get<BookingApiResponse>(`${base}/api/bookings/${bookingId}`)
      );
      const updated: Booking = {
        bookingId: res.id,
        code: res.qr_code_token || current?.code || '',
        qrCodeToken: res.qr_code_token || current?.qrCodeToken || '',
        qrCodeBase64: res.qr_code_base64 || current?.qrCodeBase64,
        phoneNumber: res.phone_number,
        licensePlate: res.license_plate,
        status: res.status,
        lotId: current?.lotId || 'MAIN',
        lotName: current?.lotName || 'Bãi đỗ xe Thông minh IoT',
        address: current?.address || 'Khu vực cổng kiểm soát trung tâm',
        slot: res.slot_code || current?.slot || `Slot ${res.slot_id}`,
        slotId: res.slot_id,
        date: current?.date || new Date(res.created_at).toISOString().slice(0, 10),
        time: current?.time || new Date(res.created_at).toTimeString().slice(0, 5),
        expiresAt: this.parseUtcDate(res.expires_at),
        pricePerHour: current?.pricePerHour || 10000,
      };
      localStorage.setItem(this.key, JSON.stringify(updated));
      return updated;
    } catch {
      return current;
    }
  }

  setBookingFromApi(res: BookingApiResponse): Booking {
    const booking: Booking = {
      bookingId: res.id,
      code: res.qr_code_token || '',
      qrCodeToken: res.qr_code_token || '',
      qrCodeBase64: res.qr_code_base64,
      phoneNumber: res.phone_number,
      licensePlate: res.license_plate,
      status: res.status,
      lotId: 'MAIN',
      lotName: 'Bãi đỗ xe Thông minh IoT',
      address: 'Khu vực cổng kiểm soát trung tâm',
      slot: res.slot_code || `Slot ${res.slot_id}`,
      slotId: res.slot_id,
      date: new Date(res.created_at).toISOString().slice(0, 10),
      time: new Date(res.created_at).toTimeString().slice(0, 5),
      expiresAt: this.parseUtcDate(res.expires_at),
      pricePerHour: 10000,
    };
    localStorage.setItem(this.key, JSON.stringify(booking));
    return booking;
  }

  // ---------------- GUARD / GATE ----------------
  async getGatewayStatus(): Promise<GatewayStatus> {
    const base = await this.resolveApiBase();
    return firstValueFrom(this.http.get<GatewayStatus>(`${base}/api/gate/status`));
  }

  async registerCard(cardUid: string): Promise<{ card_uid: string; status: string }> {
    const base = await this.resolveApiBase();
    return firstValueFrom(
      this.http.post<{ card_uid: string; status: string }>(`${base}/api/gate/cards`, {
        card_uid: cardUid,
      })
    );
  }

  async verifyQrAndAssignCard(qrCodeToken: string, rfidCardUid: string): Promise<any> {
    const base = await this.resolveApiBase();
    return firstValueFrom(
      this.http.post(`${base}/api/bookings/verify`, {
        qr_code_token: qrCodeToken,
        rfid_card_uid: rfidCardUid,
      })
    );
  }

  async createWalkIn(cardUid: string, slotId?: number): Promise<any> {
    const base = await this.resolveApiBase();
    const payload: any = { card_uid: cardUid };
    if (slotId) payload.slot_id = slotId;
    return firstValueFrom(this.http.post(`${base}/api/gate/walk-ins`, payload));
  }

  async swipeRfid(gate: 'IN' | 'OUT', cardUid: string): Promise<any> {
    const base = await this.resolveApiBase();
    return firstValueFrom(
      this.http.post(`${base}/api/gate/rfid-swipe`, {
        gate,
        card_uid: cardUid,
      })
    );
  }

  async confirmPayment(sessionId: number, guardNote = 'Thanh toán tiền mặt tại quầy'): Promise<any> {
    const base = await this.resolveApiBase();
    return firstValueFrom(
      this.http.post(`${base}/api/gate/payment/confirm`, {
        session_id: sessionId,
        guard_note: guardNote,
      })
    );
  }

  async confirmExit(sessionId: number): Promise<any> {
    const base = await this.resolveApiBase();
    return firstValueFrom(
      this.http.post(`${base}/api/gate/exit/confirm`, {
        session_id: sessionId,
      })
    );
  }

  async overrideBarrier(
    gate: 'IN' | 'OUT',
    action: 'OPEN' | 'CLOSE' = 'OPEN',
    reason = 'Mở cổng khẩn cấp tại trạm bảo vệ',
    durationSeconds = 5
  ): Promise<any> {
    const base = await this.resolveApiBase();
    return firstValueFrom(
      this.http.post(`${base}/api/gate/barrier/override`, {
        gate,
        action,
        duration_seconds: durationSeconds,
        reason,
      })
    );
  }

  async getSessions(limit = 40, status?: SessionStatus | ''): Promise<ParkingSessionItem[]> {
    const base = await this.resolveApiBase();
    const statusParam = status ? `&status=${status}` : '';
    return firstValueFrom(
      this.http.get<ParkingSessionItem[]>(`${base}/api/gate/sessions?limit=${limit}${statusParam}`)
    );
  }

  // ---------------- ADMIN REPORTS ----------------
  async getReportSummary(): Promise<ReportSummary> {
    const base = await this.resolveApiBase();
    return firstValueFrom(this.http.get<ReportSummary>(`${base}/api/reports/summary`));
  }

  async getRevenueSeries(days = 7, group: 'day' | 'week' | 'month' = 'day'): Promise<RevenueBucket[]> {
    const base = await this.resolveApiBase();
    return firstValueFrom(
      this.http.get<RevenueBucket[]>(`${base}/api/reports/revenue?days=${days}&group=${group}`)
    );
  }

  async getTrafficSeries(days = 7): Promise<TrafficHour[]> {
    const base = await this.resolveApiBase();
    return firstValueFrom(this.http.get<TrafficHour[]>(`${base}/api/reports/traffic?days=${days}`));
  }

  async getReportSessions(
    limit = 60,
    status?: SessionStatus | '',
    cardUid?: string
  ): Promise<ReportSessionItem[]> {
    const base = await this.resolveApiBase();
    const params: string[] = [`limit=${limit}`];
    if (status) params.push(`status=${encodeURIComponent(status)}`);
    if (cardUid?.trim()) params.push(`card_uid=${encodeURIComponent(cardUid.trim())}`);
    return firstValueFrom(
      this.http.get<ReportSessionItem[]>(`${base}/api/reports/sessions?${params.join('&')}`)
    );
  }

  async getGateEvents(limit = 60, eventType?: string): Promise<GateEventItem[]> {
    const base = await this.resolveApiBase();
    const params: string[] = [`limit=${limit}`];
    if (eventType) params.push(`event_type=${encodeURIComponent(eventType)}`);
    return firstValueFrom(
      this.http.get<GateEventItem[]>(`${base}/api/reports/gate-events?${params.join('&')}`)
    );
  }

  // ---------------- WEBSOCKETS ----------------
  private buildWsBase(base: string): string {
    if (base.startsWith('http://') || base.startsWith('https://')) {
      return base.replace(/^http/, 'ws');
    }
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}`;
  }

  async connectWebSocket(): Promise<void> {
    if (typeof window === 'undefined' || this.socket) return;
    const base = await this.resolveApiBase();
    const wsUrl = `${this.buildWsBase(base)}/ws/parking`;
    try {
      this.socket = new WebSocket(wsUrl);
      this.socket.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(ev.data) as WsParkingMessage;
          this.eventsSubject.next(parsed);
        } catch {
          // ignore malformed message
        }
      };
      this.socket.onclose = () => {
        this.socket = null;
        setTimeout(() => this.connectWebSocket(), 4000);
      };
    } catch {
      this.socket = null;
    }
  }

  async connectStaffWebSocket(): Promise<void> {
    if (typeof window === 'undefined' || this.staffSocket) return;
    const token = localStorage.getItem(this.tokenKey);
    if (!token) return;
    const base = await this.resolveApiBase();
    const wsUrl = `${this.buildWsBase(base)}/ws/staff?token=${encodeURIComponent(token)}`;
    try {
      this.staffSocket = new WebSocket(wsUrl);
      this.staffSocket.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(ev.data) as WsParkingMessage;
          this.eventsSubject.next(parsed);
        } catch {
          // ignore
        }
      };
      this.staffSocket.onclose = () => {
        this.staffSocket = null;
      };
    } catch {
      this.staffSocket = null;
    }
  }

  disconnectStaffWebSocket(): void {
    if (this.staffSocket) {
      try {
        this.staffSocket.close();
      } catch {
        // ignore
      }
      this.staffSocket = null;
    }
  }

  getBooking(): Booking | null {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(this.key);
    return raw ? (JSON.parse(raw) as Booking) : null;
  }

  isExpired(booking: Booking): boolean {
    if (booking.status === 'EXPIRED' || booking.status === 'CANCELLED') return true;
    if (booking.status === 'VERIFIED' || booking.status === 'CHECKED_IN') return false;
    return Date.now() >= booking.expiresAt;
  }

  private parseUtcDate(iso: string): number {
    if (!iso) return Date.now() + 15 * 60 * 1000;
    const normalized = iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`;
    const ms = Date.parse(normalized);
    return Number.isNaN(ms) ? Date.now() + 15 * 60 * 1000 : ms;
  }
}
