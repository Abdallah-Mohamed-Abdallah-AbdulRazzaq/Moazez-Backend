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
import { CurriculumController } from './controller/curriculum.controller';
import { CurriculumRepository } from './infrastructure/curriculum.repository';

@Module({
  imports: [AuthModule],
  controllers: [CurriculumController],
  providers: [
    CurriculumRepository,
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
  ],
  exports: [CurriculumRepository, ListCurriculaUseCase, GetCurriculumUseCase],
})
export class CurriculumModule {}
