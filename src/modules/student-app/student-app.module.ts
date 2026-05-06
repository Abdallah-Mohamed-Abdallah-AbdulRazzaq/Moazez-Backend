import { Module } from '@nestjs/common';
import { StudentAppAccessService } from './access/student-app-access.service';
import { StudentAppStudentReadAdapter } from './access/student-app-student-read.adapter';

@Module({
  controllers: [],
  providers: [StudentAppAccessService, StudentAppStudentReadAdapter],
  exports: [StudentAppAccessService],
})
export class StudentAppModule {}
