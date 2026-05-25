import { Module } from '@nestjs/common';
import { AuthModule } from '../iam/auth/auth.module';
import {
  CancelHomeworkAssignmentUseCase,
  CloseHomeworkAssignmentUseCase,
  CreateHomeworkAssignmentUseCase,
  GetHomeworkAssignmentUseCase,
  ListHomeworkAssignmentsUseCase,
  ListHomeworkTargetsUseCase,
  PublishHomeworkAssignmentUseCase,
  ResolveHomeworkTargetsUseCase,
  UpdateHomeworkAssignmentUseCase,
} from './application/homework-assignments.use-cases';
import {
  GetHomeworkSubmissionUseCase,
  SaveHomeworkSubmissionDraftUseCase,
  SubmitHomeworkSubmissionUseCase,
} from './application/homework-submissions.use-cases';
import { HomeworkAssignmentsController } from './controller/homework-assignments.controller';
import { HomeworkRepository } from './infrastructure/homework.repository';

@Module({
  imports: [AuthModule],
  controllers: [HomeworkAssignmentsController],
  providers: [
    HomeworkRepository,
    ListHomeworkAssignmentsUseCase,
    GetHomeworkAssignmentUseCase,
    CreateHomeworkAssignmentUseCase,
    UpdateHomeworkAssignmentUseCase,
    PublishHomeworkAssignmentUseCase,
    CloseHomeworkAssignmentUseCase,
    CancelHomeworkAssignmentUseCase,
    ListHomeworkTargetsUseCase,
    ResolveHomeworkTargetsUseCase,
    GetHomeworkSubmissionUseCase,
    SaveHomeworkSubmissionDraftUseCase,
    SubmitHomeworkSubmissionUseCase,
  ],
  exports: [
    HomeworkRepository,
    ListHomeworkAssignmentsUseCase,
    GetHomeworkAssignmentUseCase,
    CreateHomeworkAssignmentUseCase,
    UpdateHomeworkAssignmentUseCase,
    PublishHomeworkAssignmentUseCase,
    CloseHomeworkAssignmentUseCase,
    CancelHomeworkAssignmentUseCase,
    ListHomeworkTargetsUseCase,
    ResolveHomeworkTargetsUseCase,
    GetHomeworkSubmissionUseCase,
    SaveHomeworkSubmissionDraftUseCase,
    SubmitHomeworkSubmissionUseCase,
  ],
})
export class HomeworkModule {}
