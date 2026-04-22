export class RoomResponseDto {
  id!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
  capacity!: number | null;
  floor!: string | null;
  building!: string | null;
  isActive!: boolean;
}

export class RoomsListResponseDto {
  items!: RoomResponseDto[];
}

export class DeleteRoomResponseDto {
  ok!: boolean;
}
