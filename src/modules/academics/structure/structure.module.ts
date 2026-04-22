import { Module } from '@nestjs/common';
import { CreateClassroomUseCase } from './application/create-classroom.use-case';
import { CreateGradeUseCase } from './application/create-grade.use-case';
import { CreateSectionUseCase } from './application/create-section.use-case';
import { CreateStageUseCase } from './application/create-stage.use-case';
import { CreateTermUseCase } from './application/create-term.use-case';
import { CreateYearUseCase } from './application/create-year.use-case';
import { DeleteClassroomUseCase } from './application/delete-classroom.use-case';
import { DeleteGradeUseCase } from './application/delete-grade.use-case';
import { DeleteSectionUseCase } from './application/delete-section.use-case';
import { DeleteStageUseCase } from './application/delete-stage.use-case';
import { GetTreeUseCase } from './application/get-tree.use-case';
import { ListTermsUseCase } from './application/list-terms.use-case';
import { ListYearsUseCase } from './application/list-years.use-case';
import { ReorderClassroomUseCase } from './application/reorder-classroom.use-case';
import { ReorderGradeUseCase } from './application/reorder-grade.use-case';
import { ReorderSectionUseCase } from './application/reorder-section.use-case';
import { ReorderStageUseCase } from './application/reorder-stage.use-case';
import { UpdateClassroomUseCase } from './application/update-classroom.use-case';
import { UpdateGradeUseCase } from './application/update-grade.use-case';
import { UpdateSectionUseCase } from './application/update-section.use-case';
import { UpdateStageUseCase } from './application/update-stage.use-case';
import { UpdateTermUseCase } from './application/update-term.use-case';
import { UpdateYearUseCase } from './application/update-year.use-case';
import { StructureController } from './controller/structure.controller';
import { AcademicYearsRepository } from './infrastructure/academic-years.repository';
import { StructureRepository } from './infrastructure/structure.repository';
import { TermsRepository } from './infrastructure/terms.repository';

@Module({
  controllers: [StructureController],
  providers: [
    AcademicYearsRepository,
    TermsRepository,
    StructureRepository,
    ListYearsUseCase,
    CreateYearUseCase,
    UpdateYearUseCase,
    ListTermsUseCase,
    CreateTermUseCase,
    UpdateTermUseCase,
    GetTreeUseCase,
    CreateStageUseCase,
    UpdateStageUseCase,
    DeleteStageUseCase,
    ReorderStageUseCase,
    CreateGradeUseCase,
    UpdateGradeUseCase,
    DeleteGradeUseCase,
    ReorderGradeUseCase,
    CreateSectionUseCase,
    UpdateSectionUseCase,
    DeleteSectionUseCase,
    ReorderSectionUseCase,
    CreateClassroomUseCase,
    UpdateClassroomUseCase,
    DeleteClassroomUseCase,
    ReorderClassroomUseCase,
  ],
})
export class StructureModule {}
