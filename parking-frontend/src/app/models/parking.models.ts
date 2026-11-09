export type SlotStatus = 'AVAILABLE' | 'RESERVED' | 'OCCUPIED';
export type BookingStatus = 'PENDING' | 'VERIFIED' | 'CHECKED_IN' | 'EXPIRED' | 'CANCELLED';
export type SessionStatus = 'AUTHORIZED' | 'PARKING' | 'PAYMENT_PENDING' | 'PAID' | 'EXITED' | 'CANCELLED';

export interface SlotItem {
  id: number;
  code: string;
  sensor_id?: string | null;
  status: SlotStatus;
  distance_cm: number;
  updated_at?: string | null;
}

export interface BookingApiResponse {
  id: number;
  phone_number: string;
  slot_id: number;
  slot_code?: string | null;
  qr_code_token: string;
  qr_code_base64?: string | null;
  status: BookingStatus;
  created_at: string;
  expires_at: string;
  remaining_seconds: number;
}

export interface ParkingSessionItem {
  id: number;
  card_uid: string;
  booking_id?: number | null;
  slot_id?: number | null;
  status: SessionStatus;
  authorized_until?: string | null;
  time_in?: string | null;
  exit_requested_at?: string | null;
  paid_at?: string | null;
  time_out?: string | null;
  total_fee: number;
  payment_status: 'UNPAID' | 'PAID';
  guard_confirmed: boolean;
}

export interface ParkingLot {
  id: string;
  name: string;
  address: string;
  totalSlots: number;
  availableSlots: number;
  pricePerHour: number;
  description: string;
}

export interface Booking {
  bookingId?: number;
  code: string;
  qrCodeToken?: string;
  qrCodeBase64?: string | null;
  phoneNumber?: string;
  status?: BookingStatus;
  lotId: string;
  lotName: string;
  address: string;
  slot: string;
  slotId?: number;
  date: string;
  time: string;
  expiresAt: number;
  pricePerHour: number;
}

