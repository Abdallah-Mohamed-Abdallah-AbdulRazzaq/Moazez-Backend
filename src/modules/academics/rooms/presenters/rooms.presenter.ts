import { Room } from '@prisma/client';
import { RoomResponseDto, RoomsListResponseDto } from '../dto/room-response.dto';

function deriveName(nameAr: string, nameEn: string): string {
  return nameEn.trim().length > 0 ? nameEn : nameAr;
}

export function presentRoom(room: Room): RoomResponseDto {
  return {
    id: room.id,
    name: deriveName(room.nameAr, room.nameEn),
    nameAr: room.nameAr,
    nameEn: room.nameEn,
    capacity: room.capacity ?? null,
    floor: room.floor ?? null,
    building: room.building ?? null,
    isActive: room.isActive,
  };
}

export function presentRooms(rooms: Room[]): RoomsListResponseDto {
  return {
    items: rooms.map((room) => presentRoom(room)),
  };
}
