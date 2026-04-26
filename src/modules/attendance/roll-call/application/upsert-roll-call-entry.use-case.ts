import { Injectable } from '@nestjs/common';
import {
  UpsertRollCallEntryDto,
} from '../dto/attendance-roll-call.dto';
import { presentRollCallEntry } from '../presenters/attendance-roll-call.presenter';
import { SaveRollCallEntriesUseCase } from './save-roll-call-entries.use-case';

@Injectable()
export class UpsertRollCallEntryUseCase {
  constructor(
    private readonly saveRollCallEntriesUseCase: SaveRollCallEntriesUseCase,
  ) {}

  async execute(
    sessionId: string,
    studentId: string,
    command: UpsertRollCallEntryDto,
  ) {
    const result = await this.saveRollCallEntriesUseCase.save(sessionId, [
      {
        studentId,
        enrollmentId: command.enrollmentId,
        status: command.status,
        lateMinutes: command.lateMinutes,
        earlyLeaveMinutes: command.earlyLeaveMinutes,
        excuseReason: command.excuseReason,
        note: command.note,
      },
    ]);

    return presentRollCallEntry(result.entries[0]);
  }
}
