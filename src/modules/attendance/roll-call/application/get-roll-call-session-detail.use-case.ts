import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AttendanceRollCallRepository } from '../infrastructure/attendance-roll-call.repository';
import { presentRollCallSession } from '../presenters/attendance-roll-call.presenter';

@Injectable()
export class GetRollCallSessionDetailUseCase {
  constructor(
    private readonly attendanceRollCallRepository: AttendanceRollCallRepository,
  ) {}

  async execute(sessionId: string) {
    const session = await this.attendanceRollCallRepository.findSessionById(
      sessionId,
    );
    if (!session) {
      throw new NotFoundDomainException('Attendance session not found', {
        sessionId,
      });
    }

    return presentRollCallSession(session);
  }
}
