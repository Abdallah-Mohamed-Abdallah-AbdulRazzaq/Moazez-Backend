import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export class RoomSchedulingDependencyException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.rooms.scheduling_dependency',
      message: 'Room is required by current scheduling state',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}
