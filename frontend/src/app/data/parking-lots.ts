import { ParkingLot } from '../models/parking.models';

export const PARKING_LOTS: ParkingLot[] = [
  {
    id: 'MAIN',
    name: 'Bãi đỗ xe Thông minh IoT',
    address: 'Khu vực cổng kiểm soát trung tâm',
    totalSlots: 0,
    availableSlots: 0,
    pricePerHour: 10000,
    description: 'Hệ thống kiểm soát tự động bằng cảm biến siêu âm HC-SR04, thẻ RFID RC522 và mã QR.'
  }
];

