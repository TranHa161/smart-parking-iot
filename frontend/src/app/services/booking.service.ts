import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, firstValueFrom } from 'rxjs';
import {
  Booking,
  BookingApiResponse,
  ParkingSessionItem,
  SlotItem,
} from '../models/parking.models';

export interface WsParkingMessage {
  event: string;
  data: any;
}

@Injectable({ providedIn: 'root' })
export class BookingService {
  private readonly key = 'smart-parking-current-booking';
  private readonly apiBaseKey = 'smart-parking-api-base';
  private resolvedBaseUrl: string | null = null;
  private socket: WebSocket | null = null;
  private readonly eventsSubject = new Subject<WsParkingMessage>();
  readonly events$: Observable<WsParkingMessage> = this.eventsSubject.asObservable();

  constructor(private http: HttpClient) {
    this.connectWebSocket();
  }

  private getCandidateBaseUrls(): string[] {
    const saved = localStorage.getItem(this.apiBaseKey);
    const candidates: string[] = [];
    if (saved) candidates.push(saved);
    if (typeof window !== 'undefined' && window.location.port === '4200') {
      candidates.push('http://127.0.0.1:8001', 'http://127.0.0.1:8000', '');
    } else {
      candidates.push('', 'http://127.0.0.1:8000', 'http://127.0.0.1:8001');
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
        localStorage.setItem(this.apiBaseKey, base);
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

  async createBookingApi(
    phoneNumber: string,
    slotId: number,
    lotMeta: { lotId: string; lotName: string; address: string; date: string; time: string; pricePerHour: number }
  ): Promise<Booking> {
    const base = await this.resolveApiBase();
    const res = await firstValueFrom(
      this.http.post<BookingApiResponse>(`${base}/api/bookings`, {
        phone_number: phoneNumber,
        slot_id: slotId,
      })
    );
    const expiresAtMs = this.parseUtcDate(res.expires_at);
    const result: Booking = {
      bookingId: res.id,
      code: res.qr_code_token,
      qrCodeToken: res.qr_code_token,
      qrCodeBase64: res.qr_code_base64,
      phoneNumber: res.phone_number,
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

  async refreshBooking(bookingId: number): Promise<Booking | null> {
    const current = this.getBooking();
    if (!current) return null;
    try {
      const base = await this.resolveApiBase();
      const res = await firstValueFrom(
        this.http.get<BookingApiResponse>(`${base}/api/bookings/${bookingId}`)
      );
      const updated: Booking = {
        ...current,
        bookingId: res.id,
        code: res.qr_code_token,
        qrCodeToken: res.qr_code_token,
        qrCodeBase64: res.qr_code_base64 || current.qrCodeBase64,
        status: res.status,
        slot: res.slot_code || current.slot,
        slotId: res.slot_id,
        expiresAt: this.parseUtcDate(res.expires_at),
      };
      localStorage.setItem(this.key, JSON.stringify(updated));
      return updated;
    } catch {
      return current;
    }
  }

  // --- API dành cho Trạm Bảo vệ (Guard) ---
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

  async createWalkIn(cardUid: string, slotId?: number | null): Promise<any> {
    const base = await this.resolveApiBase();
    const payload: Record<string, any> = { card_uid: cardUid };
    if (slotId) payload['slot_id'] = slotId;
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

  async overrideBarrier(gate: 'IN' | 'OUT', action: 'OPEN' | 'CLOSE' = 'OPEN'): Promise<any> {
    const base = await this.resolveApiBase();
    return firstValueFrom(
      this.http.post(`${base}/api/gate/barrier/override`, {
        gate,
        action,
        duration_seconds: 5,
      })
    );
  }

  async getSessions(limit = 30): Promise<ParkingSessionItem[]> {
    const base = await this.resolveApiBase();
    return firstValueFrom(
      this.http.get<ParkingSessionItem[]>(`${base}/api/gate/sessions?limit=${limit}`)
    );
  }

  async connectWebSocket(): Promise<void> {
    if (typeof window === 'undefined' || this.socket) return;
    const base = await this.resolveApiBase();
    let wsUrl: string;
    if (base.startsWith('http://') || base.startsWith('https://')) {
      wsUrl = base.replace(/^http/, 'ws') + '/ws/parking';
    } else {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${proto}//${window.location.host}/ws/parking`;
    }
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

  createBooking(booking: Omit<Booking, 'code' | 'expiresAt'>): Booking {
    const result: Booking = {
      ...booking,
      code: `BK${Date.now().toString().slice(-8)}`,
      expiresAt: Date.now() + 15 * 60 * 1000,
    };
    localStorage.setItem(this.key, JSON.stringify(result));
    return result;
  }

  getBooking(): Booking | null {
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

