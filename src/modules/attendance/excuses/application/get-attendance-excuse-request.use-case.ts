import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AttendanceExcusesRepository } from '../infrastructure/attendance-excuses.repository';
import { presentAttendanceExcuseRequest } from '../presenters/attendance-excuse.presenter';

@Injectable()
export class GetAttendanceExcuseRequestUseCase {
  constructor(
    private readonly attendanceExcusesRepository: AttendanceExcusesRepository,
  ) {}

  async execute(excuseRequestId: string) {
    const request =
      await this.attendanceExcusesRepository.findById(excuseRequestId);
    if (!request) {
      throw new NotFoundDomainException('Attendance excuse request not found', {
        excuseRequestId,
      });
    }

    return presentAttendanceExcuseRequest(request);
  }
}
