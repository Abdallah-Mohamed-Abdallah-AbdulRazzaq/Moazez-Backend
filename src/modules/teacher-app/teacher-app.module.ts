import { Module } from '@nestjs/common';
import { TeacherAppAccessService } from './access/teacher-app-access.service';
import { TeacherAppAllocationReadAdapter } from './access/teacher-app-allocation-read.adapter';

@Module({
  providers: [TeacherAppAccessService, TeacherAppAllocationReadAdapter],
  exports: [TeacherAppAccessService],
})
export class TeacherAppModule {}
