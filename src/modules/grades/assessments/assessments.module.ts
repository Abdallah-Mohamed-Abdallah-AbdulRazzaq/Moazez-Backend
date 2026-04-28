import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
import { ApproveGradeAssessmentUseCase } from './application/approve-grade-assessment.use-case';
import { BulkReviewGradeSubmissionAnswersUseCase } from './application/bulk-review-grade-submission-answers.use-case';
import { BulkSaveGradeSubmissionAnswersUseCase } from './application/bulk-save-grade-submission-answers.use-case';
import { BulkUpdateGradeAssessmentQuestionPointsUseCase } from './application/bulk-update-grade-assessment-question-points.use-case';
import { BulkUpsertGradeAssessmentItemsUseCase } from './application/bulk-upsert-grade-assessment-items.use-case';
import { CreateGradeAssessmentQuestionUseCase } from './application/create-grade-assessment-question.use-case';
import { CreateGradeAssessmentUseCase } from './application/create-grade-assessment.use-case';
import { CreateQuestionBasedGradeAssessmentUseCase } from './application/create-question-based-grade-assessment.use-case';
import { DeleteGradeAssessmentQuestionUseCase } from './application/delete-grade-assessment-question.use-case';
import { DeleteGradeAssessmentUseCase } from './application/delete-grade-assessment.use-case';
import { GetGradeAssessmentUseCase } from './application/get-grade-assessment.use-case';
import { GetGradeSubmissionUseCase } from './application/get-grade-submission.use-case';
import { FinalizeGradeSubmissionReviewUseCase } from './application/finalize-grade-submission-review.use-case';
import { ListGradeAssessmentItemsUseCase } from './application/list-grade-assessment-items.use-case';
import { ListGradeAssessmentQuestionsUseCase } from './application/list-grade-assessment-questions.use-case';
import { ListGradeAssessmentsUseCase } from './application/list-grade-assessments.use-case';
import { ListGradeSubmissionsUseCase } from './application/list-grade-submissions.use-case';
import { LockGradeAssessmentUseCase } from './application/lock-grade-assessment.use-case';
import { PublishGradeAssessmentUseCase } from './application/publish-grade-assessment.use-case';
import { ReorderGradeAssessmentQuestionsUseCase } from './application/reorder-grade-assessment-questions.use-case';
import { ResolveGradeSubmissionUseCase } from './application/resolve-grade-submission.use-case';
import { ReviewGradeSubmissionAnswerUseCase } from './application/review-grade-submission-answer.use-case';
import { SaveGradeSubmissionAnswerUseCase } from './application/save-grade-submission-answer.use-case';
import { SubmitGradeSubmissionUseCase } from './application/submit-grade-submission.use-case';
import { SyncGradeSubmissionToGradeItemUseCase } from './application/sync-grade-submission-to-grade-item.use-case';
import { UpdateGradeAssessmentQuestionUseCase } from './application/update-grade-assessment-question.use-case';
import { UpdateGradeAssessmentUseCase } from './application/update-grade-assessment.use-case';
import { UpsertGradeAssessmentItemUseCase } from './application/upsert-grade-assessment-item.use-case';
import { GradesAssessmentQuestionsController } from './controller/grades-assessment-questions.controller';
import { GradesAssessmentsController } from './controller/grades-assessments.controller';
import { GradesSubmissionReviewController } from './controller/grades-submission-review.controller';
import { GradesSubmissionsController } from './controller/grades-submissions.controller';
import { GradesAssessmentItemsRepository } from './infrastructure/grades-assessment-items.repository';
import { GradesAssessmentQuestionsRepository } from './infrastructure/grades-assessment-questions.repository';
import { GradesAssessmentsRepository } from './infrastructure/grades-assessments.repository';
import { GradesSubmissionGradeItemSyncRepository } from './infrastructure/grades-submission-grade-item-sync.repository';
import { GradesSubmissionsRepository } from './infrastructure/grades-submissions.repository';

@Module({
  imports: [AuthModule],
  controllers: [
    GradesAssessmentsController,
    GradesAssessmentQuestionsController,
    GradesSubmissionReviewController,
    GradesSubmissionsController,
  ],
  providers: [
    GradesAssessmentsRepository,
    GradesAssessmentItemsRepository,
    GradesAssessmentQuestionsRepository,
    GradesSubmissionsRepository,
    GradesSubmissionGradeItemSyncRepository,
    ListGradeAssessmentsUseCase,
    GetGradeAssessmentUseCase,
    CreateGradeAssessmentUseCase,
    CreateQuestionBasedGradeAssessmentUseCase,
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
    ListGradeSubmissionsUseCase,
    ResolveGradeSubmissionUseCase,
    GetGradeSubmissionUseCase,
    SaveGradeSubmissionAnswerUseCase,
    BulkSaveGradeSubmissionAnswersUseCase,
    SubmitGradeSubmissionUseCase,
    ReviewGradeSubmissionAnswerUseCase,
    BulkReviewGradeSubmissionAnswersUseCase,
    FinalizeGradeSubmissionReviewUseCase,
    SyncGradeSubmissionToGradeItemUseCase,
  ],
})
export class AssessmentsModule {}
