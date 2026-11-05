import { Injectable } from '@angular/core';
import { Booking } from '../models/parking.models';

@Injectable({ providedIn: 'root' })
export class BookingService {
  private readonly key = 'smart-parking-current-booking';

  createBooking(booking: Omit<Booking, 'code' | 'expiresAt'>): Booking {
    const result: Booking = {
      ...booking,
      code: `BK${Date.now().toString().slice(-8)}`,
      expiresAt: Date.now() + 15 * 60 * 1000
    };
    localStorage.setItem(this.key, JSON.stringify(result));
    return result;
  }

  getBooking(): Booking | null {
    const raw = localStorage.getItem(this.key);
    return raw ? JSON.parse(raw) as Booking : null;
  }

  isExpired(booking: Booking): boolean {
    return Date.now() >= booking.expiresAt;
  }
}
