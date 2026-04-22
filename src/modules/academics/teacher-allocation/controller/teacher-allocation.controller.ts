import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { CreateTeacherAllocationUseCase } from '../application/create-teacher-allocation.use-case';
import { DeleteTeacherAllocationUseCase } from '../application/delete-teacher-allocation.use-case';
import { ListTeacherAllocationsUseCase } from '../application/list-teacher-allocations.use-case';
import {
  CreateTeacherAllocationDto,
  ListTeacherAllocationsQueryDto,
} from '../dto/teacher-allocation.dto';
import {
  DeleteTeacherAllocationResponseDto,
  TeacherAllocationResponseDto,
  TeacherAllocationsListResponseDto,
} from '../dto/teacher-allocation-response.dto';

@ApiTags('academics-allocations')
@ApiBearerAuth()
@Controller('academics/allocations')
export class TeacherAllocationController {
  constructor(
    private readonly listTeacherAllocationsUseCase: ListTeacherAllocationsUseCase,
    private readonly createTeacherAllocationUseCase: CreateTeacherAllocationUseCase,
    private readonly deleteTeacherAllocationUseCase: DeleteTeacherAllocationUseCase,
  ) {}

  @Get()
  @RequiredPermissions('academics.structure.view')
  listAllocations(
    @Query() query: ListTeacherAllocationsQueryDto,
  ): Promise<TeacherAllocationsListResponseDto> {
    return this.listTeacherAllocationsUseCase.execute(query);
  }

  @Post()
  @RequiredPermissions('academics.structure.manage')
  createAllocation(
    @Body() dto: CreateTeacherAllocationDto,
  ): Promise<TeacherAllocationResponseDto> {
    return this.createTeacherAllocationUseCase.execute(dto);
  }

  @Delete(':id')
  @RequiredPermissions('academics.structure.manage')
  deleteAllocation(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DeleteTeacherAllocationResponseDto> {
    return this.deleteTeacherAllocationUseCase.execute(id);
  }
}
