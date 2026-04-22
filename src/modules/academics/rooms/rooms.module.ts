import { Module } from '@nestjs/common';
import { CreateRoomUseCase } from './application/create-room.use-case';
import { DeleteRoomUseCase } from './application/delete-room.use-case';
import { ListRoomsUseCase } from './application/list-rooms.use-case';
import { UpdateRoomUseCase } from './application/update-room.use-case';
import { RoomsController } from './controller/rooms.controller';
import { RoomsRepository } from './infrastructure/rooms.repository';

@Module({
  controllers: [RoomsController],
  providers: [
    RoomsRepository,
    ListRoomsUseCase,
    CreateRoomUseCase,
    UpdateRoomUseCase,
    DeleteRoomUseCase,
  ],
})
export class RoomsModule {}
