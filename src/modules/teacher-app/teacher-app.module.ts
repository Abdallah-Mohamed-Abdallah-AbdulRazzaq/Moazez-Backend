import { Module } from '@nestjs/common';
import { RollCallModule } from '../attendance/roll-call/roll-call.module';
import { TeacherAppAccessService } from './access/teacher-app-access.service';
import { TeacherAppAllocationReadAdapter } from './access/teacher-app-allocation-read.adapter';
import { GetTeacherClassroomAttendanceRosterUseCase } from './classroom/attendance/application/get-teacher-classroom-attendance-roster.use-case';
import { GetTeacherClassroomAttendanceSessionUseCase } from './classroom/attendance/application/get-teacher-classroom-attendance-session.use-case';
import { ResolveTeacherClassroomAttendanceSessionUseCase } from './classroom/attendance/application/resolve-teacher-classroom-attendance-session.use-case';
import { SubmitTeacherClassroomAttendanceSessionUseCase } from './classroom/attendance/application/submit-teacher-classroom-attendance-session.use-case';
import { UpdateTeacherClassroomAttendanceEntriesUseCase } from './classroom/attendance/application/update-teacher-classroom-attendance-entries.use-case';
import { TeacherClassroomAttendanceController } from './classroom/attendance/controller/teacher-classroom-attendance.controller';
import { TeacherClassroomAttendanceAdapter } from './classroom/attendance/infrastructure/teacher-classroom-attendance.adapter';
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
  imports: [RollCallModule],
  controllers: [
    TeacherHomeController,
    TeacherMyClassesController,
    TeacherClassroomController,
    TeacherClassroomAttendanceController,
  ],
  providers: [
    TeacherAppAccessService,
    TeacherAppAllocationReadAdapter,
    TeacherAppCompositionReadAdapter,
    TeacherClassroomReadAdapter,
    TeacherClassroomAttendanceAdapter,
    GetTeacherHomeUseCase,
    ListTeacherClassesUseCase,
    GetTeacherClassDetailUseCase,
    GetTeacherClassroomUseCase,
    ListTeacherClassroomRosterUseCase,
    GetTeacherClassroomAttendanceRosterUseCase,
    ResolveTeacherClassroomAttendanceSessionUseCase,
    GetTeacherClassroomAttendanceSessionUseCase,
    UpdateTeacherClassroomAttendanceEntriesUseCase,
    SubmitTeacherClassroomAttendanceSessionUseCase,
  ],
  exports: [TeacherAppAccessService],
})
export class TeacherAppModule {}
