import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
import { CorrectAttendanceEntryUseCase } from './application/correct-attendance-entry.use-case';
import { GetRollCallRosterUseCase } from './application/get-roll-call-roster.use-case';
import { GetRollCallSessionDetailUseCase } from './application/get-roll-call-session-detail.use-case';
import { ListRollCallSessionsUseCase } from './application/list-roll-call-sessions.use-case';
import { ResolveRollCallSessionUseCase } from './application/resolve-roll-call-session.use-case';
import { SaveRollCallEntriesUseCase } from './application/save-roll-call-entries.use-case';
import { SubmitRollCallSessionUseCase } from './application/submit-roll-call-session.use-case';
import { UnsubmitRollCallSessionUseCase } from './application/unsubmit-roll-call-session.use-case';
import { UpsertRollCallEntryUseCase } from './application/upsert-roll-call-entry.use-case';
import { AttendanceRollCallController } from './controller/attendance-roll-call.controller';
import { AttendanceRollCallRepository } from './infrastructure/attendance-roll-call.repository';

@Module({
  imports: [AuthModule],
  controllers: [AttendanceRollCallController],
  providers: [
    AttendanceRollCallRepository,
    GetRollCallRosterUseCase,
    ResolveRollCallSessionUseCase,
    ListRollCallSessionsUseCase,
    GetRollCallSessionDetailUseCase,
    SaveRollCallEntriesUseCase,
    UpsertRollCallEntryUseCase,
    SubmitRollCallSessionUseCase,
    UnsubmitRollCallSessionUseCase,
    CorrectAttendanceEntryUseCase,
  ],
})
export class RollCallModule {}
