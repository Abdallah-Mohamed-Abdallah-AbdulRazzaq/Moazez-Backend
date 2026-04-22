import { Module } from '@nestjs/common';
import { CreateSubjectUseCase } from './application/create-subject.use-case';
import { DeleteSubjectUseCase } from './application/delete-subject.use-case';
import { ListSubjectsUseCase } from './application/list-subjects.use-case';
import { UpdateSubjectUseCase } from './application/update-subject.use-case';
import { SubjectsController } from './controller/subjects.controller';
import { SubjectsRepository } from './infrastructure/subjects.repository';

@Module({
  controllers: [SubjectsController],
  providers: [
    SubjectsRepository,
    ListSubjectsUseCase,
    CreateSubjectUseCase,
    UpdateSubjectUseCase,
    DeleteSubjectUseCase,
  ],
})
export class SubjectsModule {}
