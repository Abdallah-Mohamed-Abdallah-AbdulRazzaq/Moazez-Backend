import { Module } from '@nestjs/common';
import { TeacherLifecycleModule } from './lifecycle/teacher-lifecycle.module';
import { TeacherProfileModule } from './profile/teacher-profile.module';
import { TeacherDirectoryModule } from './directory/teacher-directory.module';

@Module({
  imports: [
    TeacherDirectoryModule,
    TeacherLifecycleModule,
    TeacherProfileModule,
  ],
  exports: [TeacherLifecycleModule, TeacherProfileModule],
})
export class TeachersModule {}
