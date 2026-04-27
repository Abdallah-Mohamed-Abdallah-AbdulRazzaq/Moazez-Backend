import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { ApproveGradeAssessmentUseCase } from '../application/approve-grade-assessment.use-case';
import { BulkUpsertGradeAssessmentItemsUseCase } from '../application/bulk-upsert-grade-assessment-items.use-case';
import { CreateGradeAssessmentUseCase } from '../application/create-grade-assessment.use-case';
import { DeleteGradeAssessmentUseCase } from '../application/delete-grade-assessment.use-case';
import { GetGradeAssessmentUseCase } from '../application/get-grade-assessment.use-case';
import { ListGradeAssessmentItemsUseCase } from '../application/list-grade-assessment-items.use-case';
import { ListGradeAssessmentsUseCase } from '../application/list-grade-assessments.use-case';
import { LockGradeAssessmentUseCase } from '../application/lock-grade-assessment.use-case';
import { PublishGradeAssessmentUseCase } from '../application/publish-grade-assessment.use-case';
import { UpdateGradeAssessmentUseCase } from '../application/update-grade-assessment.use-case';
import { UpsertGradeAssessmentItemUseCase } from '../application/upsert-grade-assessment-item.use-case';
import {
  BulkGradeAssessmentItemsResponseDto,
  BulkUpsertGradeAssessmentItemsDto,
  GradeAssessmentItemResponseDto,
  GradeAssessmentItemsListResponseDto,
  ListGradeAssessmentItemsQueryDto,
  UpsertGradeAssessmentItemDto,
} from '../dto/grade-assessment-items.dto';
import {
  CreateGradeAssessmentDto,
  DeleteGradeAssessmentResponseDto,
  GradeAssessmentResponseDto,
  GradeAssessmentsListResponseDto,
  ListGradeAssessmentsQueryDto,
  UpdateGradeAssessmentDto,
} from '../dto/grade-assessment.dto';

@ApiTags('grades-assessments')
@ApiBearerAuth()
@Controller('grades/assessments')
export class GradesAssessmentsController {
  constructor(
    private readonly listGradeAssessmentsUseCase: ListGradeAssessmentsUseCase,
    private readonly getGradeAssessmentUseCase: GetGradeAssessmentUseCase,
    private readonly createGradeAssessmentUseCase: CreateGradeAssessmentUseCase,
    private readonly updateGradeAssessmentUseCase: UpdateGradeAssessmentUseCase,
    private readonly deleteGradeAssessmentUseCase: DeleteGradeAssessmentUseCase,
    private readonly publishGradeAssessmentUseCase: PublishGradeAssessmentUseCase,
    private readonly approveGradeAssessmentUseCase: ApproveGradeAssessmentUseCase,
    private readonly lockGradeAssessmentUseCase: LockGradeAssessmentUseCase,
    private readonly listGradeAssessmentItemsUseCase: ListGradeAssessmentItemsUseCase,
    private readonly upsertGradeAssessmentItemUseCase: UpsertGradeAssessmentItemUseCase,
    private readonly bulkUpsertGradeAssessmentItemsUseCase: BulkUpsertGradeAssessmentItemsUseCase,
  ) {}

  @Get()
  @RequiredPermissions('grades.assessments.view')
  listAssessments(
    @Query() query: ListGradeAssessmentsQueryDto,
  ): Promise<GradeAssessmentsListResponseDto> {
    return this.listGradeAssessmentsUseCase.execute(query);
  }

  @Get(':assessmentId')
  @RequiredPermissions('grades.assessments.view')
  getAssessment(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
  ): Promise<GradeAssessmentResponseDto> {
    return this.getGradeAssessmentUseCase.execute(assessmentId);
  }

  @Get(':assessmentId/items')
  @RequiredPermissions('grades.items.view')
  listAssessmentItems(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Query() query: ListGradeAssessmentItemsQueryDto,
  ): Promise<GradeAssessmentItemsListResponseDto> {
    return this.listGradeAssessmentItemsUseCase.execute(assessmentId, query);
  }

  @Post()
  @RequiredPermissions('grades.assessments.manage')
  createAssessment(
    @Body() dto: CreateGradeAssessmentDto,
  ): Promise<GradeAssessmentResponseDto> {
    return this.createGradeAssessmentUseCase.execute(dto);
  }

  @Post(':assessmentId/publish')
  @RequiredPermissions('grades.assessments.publish')
  publishAssessment(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
  ): Promise<GradeAssessmentResponseDto> {
    return this.publishGradeAssessmentUseCase.execute(assessmentId);
  }

  @Post(':assessmentId/approve')
  @RequiredPermissions('grades.assessments.approve')
  approveAssessment(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
  ): Promise<GradeAssessmentResponseDto> {
    return this.approveGradeAssessmentUseCase.execute(assessmentId);
  }

  @Post(':assessmentId/lock')
  @RequiredPermissions('grades.assessments.lock')
  lockAssessment(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
  ): Promise<GradeAssessmentResponseDto> {
    return this.lockGradeAssessmentUseCase.execute(assessmentId);
  }

  @Put(':assessmentId/items/:studentId')
  @RequiredPermissions('grades.items.manage')
  upsertAssessmentItem(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Body() dto: UpsertGradeAssessmentItemDto,
  ): Promise<GradeAssessmentItemResponseDto> {
    return this.upsertGradeAssessmentItemUseCase.execute(
      assessmentId,
      studentId,
      dto,
    );
  }

  @Put(':assessmentId/items')
  @RequiredPermissions('grades.items.manage')
  bulkUpsertAssessmentItems(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Body() dto: BulkUpsertGradeAssessmentItemsDto,
  ): Promise<BulkGradeAssessmentItemsResponseDto> {
    return this.bulkUpsertGradeAssessmentItemsUseCase.execute(
      assessmentId,
      dto,
    );
  }

  @Patch(':assessmentId')
  @RequiredPermissions('grades.assessments.manage')
  updateAssessment(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Body() dto: UpdateGradeAssessmentDto,
  ): Promise<GradeAssessmentResponseDto> {
    return this.updateGradeAssessmentUseCase.execute(assessmentId, dto);
  }

  @Delete(':assessmentId')
  @RequiredPermissions('grades.assessments.manage')
  deleteAssessment(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
  ): Promise<DeleteGradeAssessmentResponseDto> {
    return this.deleteGradeAssessmentUseCase.execute(assessmentId);
  }
}
