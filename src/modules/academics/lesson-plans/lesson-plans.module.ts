import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
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
  ],
})
export class LessonPlansModule {}
