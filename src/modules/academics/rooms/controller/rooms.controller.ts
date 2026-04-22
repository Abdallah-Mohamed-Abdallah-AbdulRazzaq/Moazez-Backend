import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { CreateRoomUseCase } from '../application/create-room.use-case';
import { DeleteRoomUseCase } from '../application/delete-room.use-case';
import { ListRoomsUseCase } from '../application/list-rooms.use-case';
import { UpdateRoomUseCase } from '../application/update-room.use-case';
import { CreateRoomDto, UpdateRoomDto } from '../dto/room.dto';
import {
  DeleteRoomResponseDto,
  RoomResponseDto,
  RoomsListResponseDto,
} from '../dto/room-response.dto';

@ApiTags('academics-rooms')
@ApiBearerAuth()
@Controller('academics/rooms')
export class RoomsController {
  constructor(
    private readonly listRoomsUseCase: ListRoomsUseCase,
    private readonly createRoomUseCase: CreateRoomUseCase,
    private readonly updateRoomUseCase: UpdateRoomUseCase,
    private readonly deleteRoomUseCase: DeleteRoomUseCase,
  ) {}

  @Get()
  @RequiredPermissions('academics.structure.view')
  listRooms(): Promise<RoomsListResponseDto> {
    return this.listRoomsUseCase.execute();
  }

  @Post()
  @RequiredPermissions('academics.structure.manage')
  createRoom(@Body() dto: CreateRoomDto): Promise<RoomResponseDto> {
    return this.createRoomUseCase.execute(dto);
  }

  @Patch(':id')
  @RequiredPermissions('academics.structure.manage')
  updateRoom(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateRoomDto,
  ): Promise<RoomResponseDto> {
    return this.updateRoomUseCase.execute(id, dto);
  }

  @Delete(':id')
  @RequiredPermissions('academics.structure.manage')
  deleteRoom(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DeleteRoomResponseDto> {
    return this.deleteRoomUseCase.execute(id);
  }
}
