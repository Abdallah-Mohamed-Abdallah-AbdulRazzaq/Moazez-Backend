import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
import { ApproveGradeAssessmentUseCase } from './application/approve-grade-assessment.use-case';
import { BulkUpdateGradeAssessmentQuestionPointsUseCase } from './application/bulk-update-grade-assessment-question-points.use-case';
import { BulkUpsertGradeAssessmentItemsUseCase } from './application/bulk-upsert-grade-assessment-items.use-case';
import { CreateGradeAssessmentQuestionUseCase } from './application/create-grade-assessment-question.use-case';
import { CreateGradeAssessmentUseCase } from './application/create-grade-assessment.use-case';
import { DeleteGradeAssessmentQuestionUseCase } from './application/delete-grade-assessment-question.use-case';
import { DeleteGradeAssessmentUseCase } from './application/delete-grade-assessment.use-case';
import { GetGradeAssessmentUseCase } from './application/get-grade-assessment.use-case';
import { ListGradeAssessmentItemsUseCase } from './application/list-grade-assessment-items.use-case';
import { ListGradeAssessmentQuestionsUseCase } from './application/list-grade-assessment-questions.use-case';
import { ListGradeAssessmentsUseCase } from './application/list-grade-assessments.use-case';
import { LockGradeAssessmentUseCase } from './application/lock-grade-assessment.use-case';
import { PublishGradeAssessmentUseCase } from './application/publish-grade-assessment.use-case';
import { ReorderGradeAssessmentQuestionsUseCase } from './application/reorder-grade-assessment-questions.use-case';
import { UpdateGradeAssessmentQuestionUseCase } from './application/update-grade-assessment-question.use-case';
import { UpdateGradeAssessmentUseCase } from './application/update-grade-assessment.use-case';
import { UpsertGradeAssessmentItemUseCase } from './application/upsert-grade-assessment-item.use-case';
import { GradesAssessmentQuestionsController } from './controller/grades-assessment-questions.controller';
import { GradesAssessmentsController } from './controller/grades-assessments.controller';
import { GradesAssessmentItemsRepository } from './infrastructure/grades-assessment-items.repository';
import { GradesAssessmentQuestionsRepository } from './infrastructure/grades-assessment-questions.repository';
import { GradesAssessmentsRepository } from './infrastructure/grades-assessments.repository';

@Module({
  imports: [AuthModule],
  controllers: [
    GradesAssessmentsController,
    GradesAssessmentQuestionsController,
  ],
  providers: [
    GradesAssessmentsRepository,
    GradesAssessmentItemsRepository,
    GradesAssessmentQuestionsRepository,
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
    ListGradeAssessmentQuestionsUseCase,
    CreateGradeAssessmentQuestionUseCase,
    UpdateGradeAssessmentQuestionUseCase,
    DeleteGradeAssessmentQuestionUseCase,
    ReorderGradeAssessmentQuestionsUseCase,
    BulkUpdateGradeAssessmentQuestionPointsUseCase,
  ],
})
export class AssessmentsModule {}
