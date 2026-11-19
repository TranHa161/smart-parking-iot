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
  user_id?: number | null;
  license_plate?: string | null;
  qr_code_token?: string | null;
  qr_code_base64?: string | null;
  status: BookingStatus;
  session_status?: SessionStatus | null;
  total_fee?: number | null;
  time_in?: string | null;
  time_out?: string | null;
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
  issued_by?: number | null;
  confirmed_by?: number | null;
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
  licensePlate?: string | null;
  status?: BookingStatus;
  sessionStatus?: SessionStatus | null;
  totalFee?: number | null;
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

export interface GatewayStatus {
  mqtt_connected: boolean;
  gateway_online: boolean;
  gateway_last_seen?: string | null;
}

export interface ReportSummary {
  total_revenue: number;
  today_revenue: number;
  paid_sessions_count: number;
  total_sessions_count: number;
  active_parking_count: number;
  total_slots: number;
  available_slots: number;
  occupied_slots: number;
  reserved_slots: number;
  total_bookings: number;
  checked_in_bookings: number;
  expired_bookings: number;
  no_show_rate: number;
  avg_parking_minutes: number;
  hourly_rate: number;
}

export interface RevenueBucket {
  period: string;
  label: string;
  revenue: number;
  sessions: number;
}

export interface TrafficHour {
  hour: number;
  label: string;
  entries: number;
}

export interface ReportSessionItem {
  id: number;
  card_uid: string;
  booking_id?: number | null;
  slot_id?: number | null;
  slot_code: string;
  phone_number?: string | null;
  license_plate?: string | null;
  status: SessionStatus;
  time_in?: string | null;
  exit_requested_at?: string | null;
  paid_at?: string | null;
  time_out?: string | null;
  total_fee: number;
  payment_status: 'UNPAID' | 'PAID';
  guard_confirmed: boolean;
  guard_note?: string | null;
  issued_by?: number | null;
  issued_by_name?: string | null;
  confirmed_by?: number | null;
  confirmed_by_name?: string | null;
}

export interface GateEventItem {
  id: number;
  created_at: string;
  actor_id?: number | null;
  actor_name?: string | null;
  source: string;
  event_type: string;
  gate?: string | null;
  card_uid?: string | null;
  session_id?: number | null;
  detail?: string | null;
}
