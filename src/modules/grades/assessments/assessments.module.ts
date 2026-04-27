import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
import { ApproveGradeAssessmentUseCase } from './application/approve-grade-assessment.use-case';
import { BulkUpsertGradeAssessmentItemsUseCase } from './application/bulk-upsert-grade-assessment-items.use-case';
import { CreateGradeAssessmentUseCase } from './application/create-grade-assessment.use-case';
import { DeleteGradeAssessmentUseCase } from './application/delete-grade-assessment.use-case';
import { GetGradeAssessmentUseCase } from './application/get-grade-assessment.use-case';
import { ListGradeAssessmentItemsUseCase } from './application/list-grade-assessment-items.use-case';
import { ListGradeAssessmentsUseCase } from './application/list-grade-assessments.use-case';
import { LockGradeAssessmentUseCase } from './application/lock-grade-assessment.use-case';
import { PublishGradeAssessmentUseCase } from './application/publish-grade-assessment.use-case';
import { UpdateGradeAssessmentUseCase } from './application/update-grade-assessment.use-case';
import { UpsertGradeAssessmentItemUseCase } from './application/upsert-grade-assessment-item.use-case';
import { GradesAssessmentsController } from './controller/grades-assessments.controller';
import { GradesAssessmentItemsRepository } from './infrastructure/grades-assessment-items.repository';
import { GradesAssessmentsRepository } from './infrastructure/grades-assessments.repository';

@Module({
  imports: [AuthModule],
  controllers: [GradesAssessmentsController],
  providers: [
    GradesAssessmentsRepository,
    GradesAssessmentItemsRepository,
    ListGradeAssessmentsUseCase,
    GetGradeAssessmentUseCase,
    CreateGradeAssessmentUseCase,
    UpdateGradeAssessmentUseCase,
    DeleteGradeAssessmentUseCase,
    PublishGradeAssessmentUseCase,
    ApproveGradeAssessmentUseCase,
    LockGradeAssessmentUseCase,
    ListGradeAssessmentItemsUseCase,
    UpsertGradeAssessmentItemUseCase,
    BulkUpsertGradeAssessmentItemsUseCase,
  ],
})
export class AssessmentsModule {}
