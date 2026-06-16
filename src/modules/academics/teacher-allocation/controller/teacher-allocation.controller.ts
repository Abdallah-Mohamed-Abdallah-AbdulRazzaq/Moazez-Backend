import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { ApplyTeacherAllocationToGradeUseCase } from '../application/apply-teacher-allocation-to-grade.use-case';
import { BulkSaveTeacherAllocationsUseCase } from '../application/bulk-save-teacher-allocations.use-case';
import { ClearTeacherAllocationsBySubjectUseCase } from '../application/clear-teacher-allocations-by-subject.use-case';
import { CreateTeacherAllocationUseCase } from '../application/create-teacher-allocation.use-case';
import { DeleteTeacherAllocationUseCase } from '../application/delete-teacher-allocation.use-case';
import { GetTeacherLoadsUseCase } from '../application/get-teacher-loads.use-case';
import { ListTeacherAllocationsUseCase } from '../application/list-teacher-allocations.use-case';
import { ValidateTeacherAllocationsUseCase } from '../application/validate-teacher-allocations.use-case';
import {
  ApplyTeacherAllocationToGradeDto,
  BulkSaveTeacherAllocationsDto,
  ClearTeacherAllocationsBySubjectDto,
  CreateTeacherAllocationDto,
  ListTeacherAllocationsQueryDto,
  TeacherLoadsQueryDto,
  ValidateTeacherAllocationsQueryDto,
} from '../dto/teacher-allocation.dto';
import {
  ApplyTeacherAllocationToGradeResponseDto,
  ClearTeacherAllocationsResponseDto,
  DeleteTeacherAllocationResponseDto,
  TeacherAllocationResponseDto,
  TeacherAllocationValidationResponseDto,
  TeacherAllocationsListResponseDto,
  TeacherAllocationsBulkResponseDto,
  TeacherLoadsResponseDto,
} from '../dto/teacher-allocation-response.dto';

@ApiTags('academics-allocations')
@ApiBearerAuth()
@Controller('academics/allocations')
export class TeacherAllocationController {
  constructor(
    private readonly listTeacherAllocationsUseCase: ListTeacherAllocationsUseCase,
    private readonly createTeacherAllocationUseCase: CreateTeacherAllocationUseCase,
    private readonly deleteTeacherAllocationUseCase: DeleteTeacherAllocationUseCase,
    private readonly bulkSaveTeacherAllocationsUseCase: BulkSaveTeacherAllocationsUseCase,
    private readonly applyTeacherAllocationToGradeUseCase: ApplyTeacherAllocationToGradeUseCase,
    private readonly clearTeacherAllocationsBySubjectUseCase: ClearTeacherAllocationsBySubjectUseCase,
    private readonly validateTeacherAllocationsUseCase: ValidateTeacherAllocationsUseCase,
    private readonly getTeacherLoadsUseCase: GetTeacherLoadsUseCase,
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

  @Put('bulk')
  @RequiredPermissions('academics.structure.manage')
  bulkSaveAllocations(
    @Body() dto: BulkSaveTeacherAllocationsDto,
  ): Promise<TeacherAllocationsBulkResponseDto> {
    return this.bulkSaveTeacherAllocationsUseCase.execute(dto);
  }

  @Post('apply-to-grade')
  @RequiredPermissions('academics.structure.manage')
  applyAllocationToGrade(
    @Body() dto: ApplyTeacherAllocationToGradeDto,
  ): Promise<ApplyTeacherAllocationToGradeResponseDto> {
    return this.applyTeacherAllocationToGradeUseCase.execute(dto);
  }

  @Post('clear-subject')
  @RequiredPermissions('academics.structure.manage')
  clearSubjectAllocations(
    @Body() dto: ClearTeacherAllocationsBySubjectDto,
  ): Promise<ClearTeacherAllocationsResponseDto> {
    return this.clearTeacherAllocationsBySubjectUseCase.execute(dto);
  }

  @Get('validation')
  @RequiredPermissions('academics.structure.view')
  validateAllocations(
    @Query() query: ValidateTeacherAllocationsQueryDto,
  ): Promise<TeacherAllocationValidationResponseDto> {
    return this.validateTeacherAllocationsUseCase.execute(query);
  }

  @Get('teacher-loads')
  @RequiredPermissions('academics.structure.view')
  getTeacherLoads(
    @Query() query: TeacherLoadsQueryDto,
  ): Promise<TeacherLoadsResponseDto> {
    return this.getTeacherLoadsUseCase.execute(query);
  }

  @Delete(':id')
  @RequiredPermissions('academics.structure.manage')
  deleteAllocation(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DeleteTeacherAllocationResponseDto> {
    return this.deleteTeacherAllocationUseCase.execute(id);
  }
}
