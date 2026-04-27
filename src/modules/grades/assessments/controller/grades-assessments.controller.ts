import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { ApproveGradeAssessmentUseCase } from '../application/approve-grade-assessment.use-case';
import { CreateGradeAssessmentUseCase } from '../application/create-grade-assessment.use-case';
import { DeleteGradeAssessmentUseCase } from '../application/delete-grade-assessment.use-case';
import { GetGradeAssessmentUseCase } from '../application/get-grade-assessment.use-case';
import { ListGradeAssessmentsUseCase } from '../application/list-grade-assessments.use-case';
import { LockGradeAssessmentUseCase } from '../application/lock-grade-assessment.use-case';
import { PublishGradeAssessmentUseCase } from '../application/publish-grade-assessment.use-case';
import { UpdateGradeAssessmentUseCase } from '../application/update-grade-assessment.use-case';
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
