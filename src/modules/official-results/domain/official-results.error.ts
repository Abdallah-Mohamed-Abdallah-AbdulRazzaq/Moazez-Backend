import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../common/exceptions/domain-exception';

const errors = {
  'period.invalid_dates': {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Reporting dates must fit the selected academic year and term',
  },
  'period.closed': {
    status: HttpStatus.CONFLICT,
    message: 'This reporting period is closed for entry',
  },
  'period.duplicate_code': {
    status: HttpStatus.CONFLICT,
    message: 'This reporting period code already exists in the academic year',
  },
  'group.invalid_subject': {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'The result group and subject do not agree',
  },
  'group.duplicate': {
    status: HttpStatus.CONFLICT,
    message: 'A result group already uses this code or subject',
  },
  'scope.subject_unavailable': {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'The subject is not offered for this grade and term',
  },
  'roster.ambiguous': {
    status: HttpStatus.CONFLICT,
    message: 'More than one enrollment satisfies the roster date',
  },
  'roster.changed': {
    status: HttpStatus.CONFLICT,
    message: 'The roster must be reconciled before creating this sheet',
  },
  'roster.limit_exceeded': {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'The roster exceeds the materialization limit',
  },
} as const;

export class OfficialResultsError extends DomainException {
  constructor(error: keyof typeof errors, details?: Record<string, unknown>) {
    const { status, message } = errors[error];
    super({
      code: `official_results.${error}`,
      message,
      httpStatus: status,
      details,
    });
  }
}
