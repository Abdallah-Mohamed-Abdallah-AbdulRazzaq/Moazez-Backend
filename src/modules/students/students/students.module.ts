import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
import { UsersModule } from '../../settings/users/users.module';
import { CreateOrLinkStudentAccountUseCase } from './application/create-or-link-student-account.use-case';
import { CreateStudentUseCase } from './application/create-student.use-case';
import { GetStudentTimelineUseCase } from './application/get-student-timeline.use-case';
import { GetStudentUseCase } from './application/get-student.use-case';
import { ListStudentsUseCase } from './application/list-students.use-case';
import { UpdateStudentUseCase } from './application/update-student.use-case';
import { StudentsController } from './controller/students.controller';
import { StudentTimelineRepository } from './infrastructure/student-timeline.repository';
import { StudentsRepository } from './infrastructure/students.repository';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [StudentsController],
  providers: [
    StudentsRepository,
    StudentTimelineRepository,
    ListStudentsUseCase,
    CreateStudentUseCase,
    CreateOrLinkStudentAccountUseCase,
    GetStudentUseCase,
    UpdateStudentUseCase,
    GetStudentTimelineUseCase,
  ],
  exports: [StudentsRepository],
})
export class StudentsRecordsModule {}
