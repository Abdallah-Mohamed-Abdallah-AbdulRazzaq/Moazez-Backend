import { Module } from '@nestjs/common';
import { TeacherAppAccessService } from './access/teacher-app-access.service';
import { TeacherAppAllocationReadAdapter } from './access/teacher-app-allocation-read.adapter';
import { GetTeacherHomeUseCase } from './home/application/get-teacher-home.use-case';
import { TeacherHomeController } from './home/controller/teacher-home.controller';
import { GetTeacherClassDetailUseCase } from './my-classes/application/get-teacher-class-detail.use-case';
import { ListTeacherClassesUseCase } from './my-classes/application/list-teacher-classes.use-case';
import { TeacherMyClassesController } from './my-classes/controller/teacher-my-classes.controller';
import { TeacherAppCompositionReadAdapter } from './shared/infrastructure/teacher-app-composition-read.adapter';

@Module({
  controllers: [TeacherHomeController, TeacherMyClassesController],
  providers: [
    TeacherAppAccessService,
    TeacherAppAllocationReadAdapter,
    TeacherAppCompositionReadAdapter,
    GetTeacherHomeUseCase,
    ListTeacherClassesUseCase,
    GetTeacherClassDetailUseCase,
  ],
  exports: [TeacherAppAccessService],
})
export class TeacherAppModule {}
