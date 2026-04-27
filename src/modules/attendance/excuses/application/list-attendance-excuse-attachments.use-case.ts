import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireAttendanceScope } from '../../attendance-context';
import { AttendanceExcusesRepository } from '../infrastructure/attendance-excuses.repository';
import { presentAttendanceExcuseAttachments } from '../presenters/attendance-excuse.presenter';

@Injectable()
export class ListAttendanceExcuseAttachmentsUseCase {
  constructor(
    private readonly attendanceExcusesRepository: AttendanceExcusesRepository,
  ) {}

  async execute(excuseRequestId: string) {
    requireAttendanceScope();

    const request =
      await this.attendanceExcusesRepository.findById(excuseRequestId);
    if (!request) {
      throw new NotFoundDomainException('Attendance excuse request not found', {
        excuseRequestId,
      });
    }

    const attachments =
      await this.attendanceExcusesRepository.listAttachmentsForExcuseRequest(
        request.id,
      );

    return presentAttendanceExcuseAttachments(attachments);
  }
}
