import { Module } from '@nestjs/common';
import { StudentAppAccessService } from './access/student-app-access.service';
import { StudentAppStudentReadAdapter } from './access/student-app-student-read.adapter';
import { GetStudentHomeUseCase } from './home/application/get-student-home.use-case';
import { StudentHomeController } from './home/controller/student-home.controller';
import { StudentHomeReadAdapter } from './home/infrastructure/student-home-read.adapter';
import { GetStudentProfileUseCase } from './profile/application/get-student-profile.use-case';
import { StudentProfileController } from './profile/controller/student-profile.controller';
import { StudentProfileReadAdapter } from './profile/infrastructure/student-profile-read.adapter';

@Module({
  controllers: [StudentHomeController, StudentProfileController],
  providers: [
    StudentAppAccessService,
    StudentAppStudentReadAdapter,
    StudentHomeReadAdapter,
    GetStudentHomeUseCase,
    StudentProfileReadAdapter,
    GetStudentProfileUseCase,
  ],
  exports: [StudentAppAccessService],
})
export class StudentAppModule {}
