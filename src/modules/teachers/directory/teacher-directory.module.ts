import { Module } from '@nestjs/common';
import { TeacherAllocationModule } from '../../academics/teacher-allocation/teacher-allocation.module';
import { LoginIdentityModule } from '../../settings/login-identity/login-identity.module';
import { UsersModule } from '../../settings/users/users.module';
import { TeacherLifecycleModule } from '../lifecycle/teacher-lifecycle.module';
import { CreateTeacherUseCase } from './application/create-teacher.use-case';
import { ChangeTeacherEmploymentStatusUseCase } from './application/change-teacher-employment-status.use-case';
import { GetTeacherUseCase } from './application/get-teacher.use-case';
import { ListTeachersUseCase } from './application/list-teachers.use-case';
import { UpdateTeacherUseCase } from './application/update-teacher.use-case';
import { TeachersController } from './controller/teachers.controller';
import { TeacherDirectoryRepository } from './infrastructure/teacher-directory.repository';

@Module({
  imports: [
    LoginIdentityModule,
    UsersModule,
    TeacherLifecycleModule,
    TeacherAllocationModule,
  ],
  controllers: [TeachersController],
  providers: [
    TeacherDirectoryRepository,
    CreateTeacherUseCase,
    ChangeTeacherEmploymentStatusUseCase,
    ListTeachersUseCase,
    GetTeacherUseCase,
    UpdateTeacherUseCase,
  ],
})
export class TeacherDirectoryModule {}
