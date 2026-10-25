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
  code: string;
  lotId: string;
  lotName: string;
  address: string;
  slot: string;
  date: string;
  time: string;
  expiresAt: number;
  pricePerHour: number;
}
