import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export class StudentGuardianPrimaryRequiredException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'students.guardian.primary_required',
      message: 'At least one primary guardian is required',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}
