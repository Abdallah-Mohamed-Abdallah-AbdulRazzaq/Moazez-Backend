import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireAcademicsScope } from '../../academics-context';
import { DeleteRoomResponseDto } from '../dto/room-response.dto';
import { RoomsRepository } from '../infrastructure/rooms.repository';

@Injectable()
export class DeleteRoomUseCase {
  constructor(private readonly roomsRepository: RoomsRepository) {}

  async execute(roomId: string): Promise<DeleteRoomResponseDto> {
    requireAcademicsScope();

    const result = await this.roomsRepository.softDeleteRoom(roomId);
    if (result.status === 'not_found') {
      throw new NotFoundDomainException('Room not found', { roomId });
    }

    return { ok: true };
  }
}
