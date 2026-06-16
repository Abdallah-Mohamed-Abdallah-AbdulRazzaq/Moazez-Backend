import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { BulkSaveSubjectAllocationsUseCase } from '../application/bulk-save-subject-allocations.use-case';
import { ListSubjectAllocationsUseCase } from '../application/list-subject-allocations.use-case';
import {
  BulkSaveSubjectAllocationsDto,
  ListSubjectAllocationsQueryDto,
} from '../dto/subject-allocation.dto';
import {
  SubjectAllocationsBulkResponseDto,
  SubjectAllocationsListResponseDto,
} from '../dto/subject-allocation-response.dto';

@ApiTags('academics-subject-allocations')
@ApiBearerAuth()
@Controller('academics/subject-allocations')
export class SubjectAllocationController {
  constructor(
    private readonly listSubjectAllocationsUseCase: ListSubjectAllocationsUseCase,
    private readonly bulkSaveSubjectAllocationsUseCase: BulkSaveSubjectAllocationsUseCase,
  ) {}

  @Get()
  @RequiredPermissions('academics.subjects.view')
  listSubjectAllocations(
    @Query() query: ListSubjectAllocationsQueryDto,
  ): Promise<SubjectAllocationsListResponseDto> {
    return this.listSubjectAllocationsUseCase.execute(query);
  }

  @Put('bulk')
  @RequiredPermissions('academics.subjects.manage')
  bulkSaveSubjectAllocations(
    @Body() dto: BulkSaveSubjectAllocationsDto,
  ): Promise<SubjectAllocationsBulkResponseDto> {
    return this.bulkSaveSubjectAllocationsUseCase.execute(dto);
  }
}
