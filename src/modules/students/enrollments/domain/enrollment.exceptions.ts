import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export class StudentEnrollmentPlacementConflictException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'students.enrollment.placement_conflict',
      message: 'Classroom capacity exceeded or placement conflict',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class StudentEnrollmentInactiveYearException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'students.enrollment.inactive_year',
      message: 'Academic year is not active',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}
