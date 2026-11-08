import { ParkingLot } from '../models/parking.models';

export const PARKING_LOTS: ParkingLot[] = [
  {
    id: 'A',
    name: 'TTTM ABC',
    address: '123 Nguyễn Văn Cừ, Hà Nội',
    totalSlots: 100,
    availableSlots: 32,
    pricePerHour: 10000,
    description: 'Bãi xe có mái che, thuận tiện đi tới khu mua sắm.'
  },
  {
    id: 'B',
    name: 'Tòa nhà XYZ',
    address: '456 Lê Lợi, Hà Nội',
    totalSlots: 60,
    availableSlots: 18,
    pricePerHour: 12000,
    description: 'Bãi xe trong tòa nhà, có hệ thống kiểm soát ra vào.'
  },
  {
    id: 'C',
    name: 'Trung tâm DEF',
    address: '789 Hai Bà Trưng, Hà Nội',
    totalSlots: 80,
    availableSlots: 24,
    pricePerHour: 8000,
    description: 'Vị trí trung tâm, phù hợp cho các lượt gửi xe ngắn.'
  }
];
