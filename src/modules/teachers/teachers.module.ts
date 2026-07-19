import { Module } from '@nestjs/common';
import { TeacherLifecycleModule } from './lifecycle/teacher-lifecycle.module';
import { TeacherProfileModule } from './profile/teacher-profile.module';

@Module({
  imports: [TeacherLifecycleModule, TeacherProfileModule],
  exports: [TeacherLifecycleModule, TeacherProfileModule],
})
export class TeachersModule {}
