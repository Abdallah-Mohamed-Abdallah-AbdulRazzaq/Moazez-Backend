import { Module } from '@nestjs/common';
import { TeacherProfileRepository } from './infrastructure/teacher-profile.repository';

@Module({
  providers: [TeacherProfileRepository],
  exports: [TeacherProfileRepository],
})
export class TeacherProfileModule {}
