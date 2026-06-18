import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
import { CorrectAttendanceAbsenceEarlyLeaveUseCase } from './application/correct-attendance-absence-early-leave.use-case';
import { GetAttendanceAbsenceSummaryUseCase } from './application/get-attendance-absence-summary.use-case';
import { ListAttendanceAbsencesUseCase } from './application/list-attendance-absences.use-case';
import { MarkAttendanceAbsenceExcusedUseCase } from './application/mark-attendance-absence-excused.use-case';
import { AttendanceAbsencesController } from './controller/attendance-absences.controller';
import { AttendanceAbsencesRepository } from './infrastructure/attendance-absences.repository';

@Module({
  imports: [AuthModule],
  controllers: [AttendanceAbsencesController],
  providers: [
    AttendanceAbsencesRepository,
    ListAttendanceAbsencesUseCase,
    GetAttendanceAbsenceSummaryUseCase,
    MarkAttendanceAbsenceExcusedUseCase,
    CorrectAttendanceAbsenceEarlyLeaveUseCase,
  ],
})
export class AbsencesModule {}
