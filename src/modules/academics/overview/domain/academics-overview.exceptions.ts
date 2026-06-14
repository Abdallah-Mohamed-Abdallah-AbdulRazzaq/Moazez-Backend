import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export class AcademicsOverviewInvalidContextException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'academics.overview.invalid_context',
      message: 'Academics overview academic context is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}
