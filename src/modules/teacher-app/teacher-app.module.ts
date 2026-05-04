import { Module } from '@nestjs/common';
import { TeacherAppAccessService } from './access/teacher-app-access.service';
import { TeacherAppAllocationReadAdapter } from './access/teacher-app-allocation-read.adapter';
import { GetTeacherClassroomUseCase } from './classroom/application/get-teacher-classroom.use-case';
import { ListTeacherClassroomRosterUseCase } from './classroom/application/list-teacher-classroom-roster.use-case';
import { TeacherClassroomController } from './classroom/controller/teacher-classroom.controller';
import { TeacherClassroomReadAdapter } from './classroom/infrastructure/teacher-classroom-read.adapter';
import { GetTeacherHomeUseCase } from './home/application/get-teacher-home.use-case';
import { TeacherHomeController } from './home/controller/teacher-home.controller';
import { GetTeacherClassDetailUseCase } from './my-classes/application/get-teacher-class-detail.use-case';
import { ListTeacherClassesUseCase } from './my-classes/application/list-teacher-classes.use-case';
import { TeacherMyClassesController } from './my-classes/controller/teacher-my-classes.controller';
import { TeacherAppCompositionReadAdapter } from './shared/infrastructure/teacher-app-composition-read.adapter';

@Module({
  controllers: [
    TeacherHomeController,
    TeacherMyClassesController,
    TeacherClassroomController,
  ],
  providers: [
    TeacherAppAccessService,
    TeacherAppAllocationReadAdapter,
    TeacherAppCompositionReadAdapter,
    TeacherClassroomReadAdapter,
    GetTeacherHomeUseCase,
    ListTeacherClassesUseCase,
    GetTeacherClassDetailUseCase,
    GetTeacherClassroomUseCase,
    ListTeacherClassroomRosterUseCase,
  ],
  exports: [TeacherAppAccessService],
})
export class TeacherAppModule {}
