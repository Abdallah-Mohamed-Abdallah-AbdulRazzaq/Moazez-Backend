import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export class StudentBulkRegistrationConfirmConflictException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'students.bulk_registration.confirm_conflict',
      message:
        'Bulk registration batch cannot be confirmed in its current state',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class StudentBulkRegistrationExecutionInvariantException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'students.bulk_registration.execution_invariant_invalid',
      message: 'Bulk registration execution state is invalid',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class StudentBulkRegistrationExecutionMetadataException extends DomainException {
  constructor() {
    super({
      code: 'students.bulk_registration.execution_metadata_invalid',
      message: 'Bulk registration execution metadata is invalid',
      httpStatus: HttpStatus.CONFLICT,
    });
  }
}

export class StudentBulkRegistrationRowDataInvalidException extends DomainException {
  constructor() {
    super({
      code: 'students.bulk_registration.row_data_invalid',
      message: 'Persisted bulk registration row data is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    });
  }
}

export class StudentBulkRegistrationPlacementInvalidException extends DomainException {
  constructor(field: 'termId' | 'classroomId') {
    super({
      code: 'students.bulk_registration.execution_placement_invalid',
      message: 'Bulk registration placement is no longer valid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details: { field },
    });
  }
}
