import { Module } from '@nestjs/common';
import { CreateStudentUseCase } from './application/create-student.use-case';
import { GetStudentTimelineUseCase } from './application/get-student-timeline.use-case';
import { GetStudentUseCase } from './application/get-student.use-case';
import { ListStudentsUseCase } from './application/list-students.use-case';
import { UpdateStudentUseCase } from './application/update-student.use-case';
import { StudentsController } from './controller/students.controller';
import { StudentTimelineRepository } from './infrastructure/student-timeline.repository';
import { StudentsRepository } from './infrastructure/students.repository';

@Module({
  controllers: [StudentsController],
  providers: [
    StudentsRepository,
    StudentTimelineRepository,
    ListStudentsUseCase,
    CreateStudentUseCase,
    GetStudentUseCase,
    UpdateStudentUseCase,
    GetStudentTimelineUseCase,
  ],
  exports: [StudentsRepository],
})
export class StudentsRecordsModule {}
