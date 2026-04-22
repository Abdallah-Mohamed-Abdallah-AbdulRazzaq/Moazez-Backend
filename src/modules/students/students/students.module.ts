import { Module } from '@nestjs/common';
import { CreateStudentUseCase } from './application/create-student.use-case';
import { GetStudentUseCase } from './application/get-student.use-case';
import { ListStudentsUseCase } from './application/list-students.use-case';
import { UpdateStudentUseCase } from './application/update-student.use-case';
import { StudentsController } from './controller/students.controller';
import { StudentsRepository } from './infrastructure/students.repository';

@Module({
  controllers: [StudentsController],
  providers: [
    StudentsRepository,
    ListStudentsUseCase,
    CreateStudentUseCase,
    GetStudentUseCase,
    UpdateStudentUseCase,
  ],
  exports: [StudentsRepository],
})
export class StudentsRecordsModule {}
