import { Module } from '@nestjs/common';
import { TeacherProfileModule } from './profile/teacher-profile.module';

@Module({
  imports: [TeacherProfileModule],
  exports: [TeacherProfileModule],
})
export class TeachersModule {}
