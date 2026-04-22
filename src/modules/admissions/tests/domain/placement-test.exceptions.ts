import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export class PlacementTestAlreadyScheduledException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'admissions.test.already_scheduled',
      message: 'A placement test is already scheduled for this application',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}
