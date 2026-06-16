import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
import {
  AutoPlanLessonPlanUseCase,
  GetLessonPlanSummaryUseCase,
  ListLessonPlanWeeksUseCase,
  MoveLessonPlanItemUseCase,
  ValidateLessonPlansUseCase,
} from './application/lesson-plan-workflows.use-cases';
import {
  ActivateLessonPlanUseCase,
  ArchiveLessonPlanUseCase,
  CancelLessonPlanItemUseCase,
  CompleteLessonPlanItemUseCase,
  CreateLessonPlanItemUseCase,
  CreateLessonPlanUseCase,
  DeleteLessonPlanItemUseCase,
  DeleteLessonPlanUseCase,
  GetLessonPlanUseCase,
  ListLessonPlansUseCase,
  ReorderLessonPlanItemUseCase,
  SkipLessonPlanItemUseCase,
  StartLessonPlanItemUseCase,
  UpdateLessonPlanItemUseCase,
  UpdateLessonPlanUseCase,
} from './application/lesson-plans.use-cases';
import { LessonPlansController } from './controller/lesson-plans.controller';
import { LessonPlansRepository } from './infrastructure/lesson-plans.repository';

@Module({
  imports: [AuthModule],
  controllers: [LessonPlansController],
  providers: [
    LessonPlansRepository,
    ListLessonPlanWeeksUseCase,
    GetLessonPlanSummaryUseCase,
    AutoPlanLessonPlanUseCase,
    MoveLessonPlanItemUseCase,
    ValidateLessonPlansUseCase,
    ListLessonPlansUseCase,
    CreateLessonPlanUseCase,
    GetLessonPlanUseCase,
    UpdateLessonPlanUseCase,
    ActivateLessonPlanUseCase,
    ArchiveLessonPlanUseCase,
    DeleteLessonPlanUseCase,
    CreateLessonPlanItemUseCase,
    UpdateLessonPlanItemUseCase,
    ReorderLessonPlanItemUseCase,
    StartLessonPlanItemUseCase,
    CompleteLessonPlanItemUseCase,
    SkipLessonPlanItemUseCase,
    CancelLessonPlanItemUseCase,
    DeleteLessonPlanItemUseCase,
  ],
  exports: [
    LessonPlansRepository,
    ListLessonPlansUseCase,
    GetLessonPlanUseCase,
    ListLessonPlanWeeksUseCase,
    GetLessonPlanSummaryUseCase,
    ValidateLessonPlansUseCase,
  ],
})
export class LessonPlansModule {}
