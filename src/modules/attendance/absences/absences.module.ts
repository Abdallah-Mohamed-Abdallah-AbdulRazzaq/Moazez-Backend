import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
import { GetAttendanceAbsenceSummaryUseCase } from './application/get-attendance-absence-summary.use-case';
import { ListAttendanceAbsencesUseCase } from './application/list-attendance-absences.use-case';
import { AttendanceAbsencesController } from './controller/attendance-absences.controller';
import { AttendanceAbsencesRepository } from './infrastructure/attendance-absences.repository';

@Module({
  imports: [AuthModule],
  controllers: [AttendanceAbsencesController],
  providers: [
    AttendanceAbsencesRepository,
    ListAttendanceAbsencesUseCase,
    GetAttendanceAbsenceSummaryUseCase,
  ],
})
export class AbsencesModule {}
