import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
import {
  ActivateCurriculumUseCase,
  ArchiveCurriculumUseCase,
  CreateCurriculumLessonUseCase,
  CreateCurriculumUnitUseCase,
  CreateCurriculumUseCase,
  DeleteCurriculumLessonUseCase,
  DeleteCurriculumUnitUseCase,
  DeleteCurriculumUseCase,
  GetCurriculumUseCase,
  ListCurriculaUseCase,
  ReorderCurriculumLessonUseCase,
  ReorderCurriculumUnitUseCase,
  UpdateCurriculumLessonUseCase,
  UpdateCurriculumUnitUseCase,
  UpdateCurriculumUseCase,
} from './application/curriculum.use-cases';
import {
  ArchiveLessonContentUseCase,
  CreateLessonContentUseCase,
  DeleteLessonContentUseCase,
  GetLessonContentUseCase,
  ListLessonContentUseCase,
  PublishLessonContentUseCase,
  ReorderLessonContentUseCase,
  UnpublishLessonContentUseCase,
  UpdateLessonContentUseCase,
} from './application/lesson-content.use-cases';
import { LessonContentUnitOfWork } from './application/lesson-content.unit-of-work';
import { CurriculumController } from './controller/curriculum.controller';
import { CurriculumRepository } from './infrastructure/curriculum.repository';
import { LessonContentRepository } from './infrastructure/lesson-content.repository';
import { PrismaLessonContentUnitOfWork } from './infrastructure/prisma-lesson-content.unit-of-work';

@Module({
  imports: [AuthModule],
  controllers: [CurriculumController],
  providers: [
    CurriculumRepository,
    LessonContentRepository,
    {
      provide: LessonContentUnitOfWork,
      useClass: PrismaLessonContentUnitOfWork,
    },
    ListCurriculaUseCase,
    CreateCurriculumUseCase,
    GetCurriculumUseCase,
    UpdateCurriculumUseCase,
    ActivateCurriculumUseCase,
    ArchiveCurriculumUseCase,
    DeleteCurriculumUseCase,
    CreateCurriculumUnitUseCase,
    UpdateCurriculumUnitUseCase,
    ReorderCurriculumUnitUseCase,
    DeleteCurriculumUnitUseCase,
    CreateCurriculumLessonUseCase,
    UpdateCurriculumLessonUseCase,
    ReorderCurriculumLessonUseCase,
    DeleteCurriculumLessonUseCase,
    ListLessonContentUseCase,
    CreateLessonContentUseCase,
    GetLessonContentUseCase,
    UpdateLessonContentUseCase,
    ReorderLessonContentUseCase,
    DeleteLessonContentUseCase,
    PublishLessonContentUseCase,
    UnpublishLessonContentUseCase,
    ArchiveLessonContentUseCase,
  ],
  exports: [
    CurriculumRepository,
    LessonContentRepository,
    ListCurriculaUseCase,
    GetCurriculumUseCase,
    ListLessonContentUseCase,
    GetLessonContentUseCase,
  ],
})
export class CurriculumModule {}
