import { Module } from '@nestjs/common';
import { HomeworkModule } from '../../homework/homework.module';
import { TeacherAppAccessService } from '../access/teacher-app-access.service';
import { TeacherAppAllocationReadAdapter } from '../access/teacher-app-allocation-read.adapter';
import { TeacherHomeworkOwnershipService } from './application/teacher-homework-ownership.service';
import {
  CancelTeacherHomeworkAssignmentUseCase,
  CloseTeacherHomeworkAssignmentUseCase,
  CreateTeacherHomeworkAssignmentUseCase,
  GetTeacherHomeworkAssignmentUseCase,
  GetTeacherHomeworkSubmissionUseCase,
  GetTeacherHomeworksDashboardUseCase,
  ListTeacherHomeworkAssignmentsUseCase,
  ListTeacherHomeworkSubmissionsUseCase,
  ListTeacherHomeworkTargetsUseCase,
  PublishTeacherHomeworkAssignmentUseCase,
  ReviewTeacherHomeworkSubmissionUseCase,
  ResolveTeacherHomeworkTargetsUseCase,
  UpdateTeacherHomeworkAssignmentUseCase,
} from './application/teacher-homeworks.use-cases';
import { TeacherHomeworksController } from './controller/teacher-homeworks.controller';
import { TeacherHomeworksReadAdapter } from './infrastructure/teacher-homeworks-read.adapter';

@Module({
  imports: [HomeworkModule],
  controllers: [TeacherHomeworksController],
  providers: [
    TeacherAppAccessService,
    TeacherAppAllocationReadAdapter,
    TeacherHomeworksReadAdapter,
    TeacherHomeworkOwnershipService,
    GetTeacherHomeworksDashboardUseCase,
    ListTeacherHomeworkAssignmentsUseCase,
    CreateTeacherHomeworkAssignmentUseCase,
    GetTeacherHomeworkAssignmentUseCase,
    UpdateTeacherHomeworkAssignmentUseCase,
    PublishTeacherHomeworkAssignmentUseCase,
    CloseTeacherHomeworkAssignmentUseCase,
    CancelTeacherHomeworkAssignmentUseCase,
    ListTeacherHomeworkTargetsUseCase,
    ResolveTeacherHomeworkTargetsUseCase,
    ListTeacherHomeworkSubmissionsUseCase,
    GetTeacherHomeworkSubmissionUseCase,
    ReviewTeacherHomeworkSubmissionUseCase,
  ],
})
export class TeacherHomeworksModule {}
