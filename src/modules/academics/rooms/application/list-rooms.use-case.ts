import { Injectable } from '@nestjs/common';
import { requireAcademicsScope } from '../../academics-context';
import { RoomResponseDto, RoomsListResponseDto } from '../dto/room-response.dto';
import { RoomsRepository } from '../infrastructure/rooms.repository';
import { presentRooms } from '../presenters/rooms.presenter';

@Injectable()
export class ListRoomsUseCase {
  constructor(private readonly roomsRepository: RoomsRepository) {}

  async execute(): Promise<RoomsListResponseDto> {
    requireAcademicsScope();

    const rooms = await this.roomsRepository.listRooms();
    return presentRooms(rooms);
  }
}
