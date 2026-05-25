import { Module } from '@nestjs/common';
import { HomeworkModule } from '../../homework/homework.module';
import { StudentAppAccessService } from '../access/student-app-access.service';
import { StudentAppStudentReadAdapter } from '../access/student-app-student-read.adapter';
import {
  GetStudentHomeworkUseCase,
  GetStudentHomeworkSubmissionUseCase,
  ListStudentHomeworksUseCase,
  SaveStudentHomeworkSubmissionUseCase,
  SubmitStudentHomeworkSubmissionUseCase,
} from './application/student-homeworks.use-cases';
import { StudentHomeworksController } from './controller/student-homeworks.controller';
import { StudentHomeworksReadAdapter } from './infrastructure/student-homeworks-read.adapter';

@Module({
  imports: [HomeworkModule],
  controllers: [StudentHomeworksController],
  providers: [
    StudentAppAccessService,
    StudentAppStudentReadAdapter,
    StudentHomeworksReadAdapter,
    ListStudentHomeworksUseCase,
    GetStudentHomeworkUseCase,
    GetStudentHomeworkSubmissionUseCase,
    SaveStudentHomeworkSubmissionUseCase,
    SubmitStudentHomeworkSubmissionUseCase,
  ],
})
export class StudentHomeworksModule {}
