import { Module } from '@nestjs/common';
import { StudentAppAccessService } from '../access/student-app-access.service';
import { StudentAppStudentReadAdapter } from '../access/student-app-student-read.adapter';
import {
  GetStudentHomeworkUseCase,
  ListStudentHomeworksUseCase,
} from './application/student-homeworks.use-cases';
import { StudentHomeworksController } from './controller/student-homeworks.controller';
import { StudentHomeworksReadAdapter } from './infrastructure/student-homeworks-read.adapter';

@Module({
  controllers: [StudentHomeworksController],
  providers: [
    StudentAppAccessService,
    StudentAppStudentReadAdapter,
    StudentHomeworksReadAdapter,
    ListStudentHomeworksUseCase,
    GetStudentHomeworkUseCase,
  ],
})
export class StudentHomeworksModule {}
