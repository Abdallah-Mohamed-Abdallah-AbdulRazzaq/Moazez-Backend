import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireAcademicsScope } from '../../academics-context';
import { UpdateRoomDto } from '../dto/room.dto';
import { RoomResponseDto } from '../dto/room-response.dto';
import {
  normalizeOptionalRoomValue,
  resolveUpdateRoomNames,
} from '../domain/room-inputs';
import { RoomsRepository } from '../infrastructure/rooms.repository';
import { presentRoom } from '../presenters/rooms.presenter';

@Injectable()
export class UpdateRoomUseCase {
  constructor(private readonly roomsRepository: RoomsRepository) {}

  async execute(roomId: string, command: UpdateRoomDto): Promise<RoomResponseDto> {
    requireAcademicsScope();

    const existing = await this.roomsRepository.findRoomById(roomId);
    if (!existing) {
      throw new NotFoundDomainException('Room not found', { roomId });
    }

    const { nameAr, nameEn } = resolveUpdateRoomNames(existing, command);

    const room = await this.roomsRepository.updateRoom(roomId, {
      nameAr,
      nameEn,
      ...(command.capacity !== undefined ? { capacity: command.capacity } : {}),
      ...(command.floor !== undefined
        ? { floor: normalizeOptionalRoomValue(command.floor) }
        : {}),
      ...(command.building !== undefined
        ? { building: normalizeOptionalRoomValue(command.building) }
        : {}),
      ...(typeof command.isActive === 'boolean'
        ? { isActive: command.isActive }
        : {}),
    });

    return presentRoom(room);
  }
}
