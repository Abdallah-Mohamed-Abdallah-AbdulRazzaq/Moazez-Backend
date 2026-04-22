import { Injectable } from '@nestjs/common';
import { requireAcademicsScope } from '../../academics-context';
import { CreateRoomDto } from '../dto/room.dto';
import { RoomResponseDto } from '../dto/room-response.dto';
import {
  normalizeOptionalRoomValue,
  resolveCreateRoomNames,
} from '../domain/room-inputs';
import { RoomsRepository } from '../infrastructure/rooms.repository';
import { presentRoom } from '../presenters/rooms.presenter';

@Injectable()
export class CreateRoomUseCase {
  constructor(private readonly roomsRepository: RoomsRepository) {}

  async execute(command: CreateRoomDto): Promise<RoomResponseDto> {
    const scope = requireAcademicsScope();
    const { nameAr, nameEn } = resolveCreateRoomNames(command);

    const room = await this.roomsRepository.createRoom({
      schoolId: scope.schoolId,
      nameAr,
      nameEn,
      capacity: command.capacity ?? null,
      floor: normalizeOptionalRoomValue(command.floor),
      building: normalizeOptionalRoomValue(command.building),
      isActive: command.isActive ?? true,
    });

    return presentRoom(room);
  }
}
