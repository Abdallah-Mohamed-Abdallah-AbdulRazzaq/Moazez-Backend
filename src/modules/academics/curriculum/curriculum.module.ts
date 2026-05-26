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
  CreateLessonContentUseCase,
  DeleteLessonContentUseCase,
  GetLessonContentUseCase,
  ListLessonContentUseCase,
  ReorderLessonContentUseCase,
  UpdateLessonContentUseCase,
} from './application/lesson-content.use-cases';
import { CurriculumController } from './controller/curriculum.controller';
import { CurriculumRepository } from './infrastructure/curriculum.repository';
import { LessonContentRepository } from './infrastructure/lesson-content.repository';

@Module({
  imports: [AuthModule],
  controllers: [CurriculumController],
  providers: [
    CurriculumRepository,
    LessonContentRepository,
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
