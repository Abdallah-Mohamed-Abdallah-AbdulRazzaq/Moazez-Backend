import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../common/exceptions/domain-exception';

const errors = {
  'import.readonly_export': {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Published result exports cannot be used for draft entry',
  },
  'import.export_expired': {
    status: HttpStatus.GONE,
    message: 'This Official Results export has expired for draft entry',
  },
  'export.expired': {
    status: HttpStatus.GONE,
    message: 'This Official Results export has expired',
  },
  'export.not_ready': {
    status: HttpStatus.CONFLICT,
    message: 'This Official Results file is not ready for download',
  },
  'export.format_disabled': {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message:
      'This Official Results format is unavailable for the selected scope',
  },
  'candidate.stale': {
    status: HttpStatus.CONFLICT,
    message: 'The current work no longer matches this exact result candidate',
  },
  'publication.stale': {
    status: HttpStatus.CONFLICT,
    message: 'The current publication composition has changed',
  },
  'publication.incomplete': {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'The selected release has unresolved required values',
  },
  'publication.topology': {
    status: HttpStatus.CONFLICT,
    message:
      'A reviewed replacement bundle is required for these release units',
  },
  'calculation.invalid': {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'The calculated result is invalid',
  },
  'cell.conflict': {
    status: HttpStatus.CONFLICT,
    message: 'The result cell has changed',
  },
  'cell.reason_required': {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'A reason is required for this result change',
  },
  'cell.invalid_value': {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'The value does not fit the result field',
  },
  'schema.invalid': {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'The proposed result definition is invalid',
  },
  'schema.stale': {
    status: HttpStatus.CONFLICT,
    message: 'The result sheet definition has changed',
  },
  'schema.protected': {
    status: HttpStatus.FORBIDDEN,
    message: 'The proposed action would change protected data',
  },
  'template.archived': {
    status: HttpStatus.CONFLICT,
    message: 'This template is archived',
  },
  'preview.stale': {
    status: HttpStatus.CONFLICT,
    message: 'The reviewed result preview no longer matches the current state',
  },
  'period.used_dates': {
    status: HttpStatus.CONFLICT,
    message:
      'The dates are bound to an existing result roster or closed period',
  },
  'scope.limit_exceeded': {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'The selected scope exceeds the supported operation size',
  },
  'scope.conflict': {
    status: HttpStatus.CONFLICT,
    message: 'More than one incomparable Official Results scope applies',
  },
  'policy.invalid': {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'The proposed result policy is invalid',
  },
  'policy.stale': {
    status: HttpStatus.CONFLICT,
    message: 'The policy or its preview has changed',
  },
  'idempotency.conflict': {
    status: HttpStatus.CONFLICT,
    message: 'The idempotency key is bound to a different request',
  },
  'publication.forbidden': {
    status: HttpStatus.FORBIDDEN,
    message:
      'This actor cannot publish the selected result under the current policy',
  },
  'review.required': {
    status: HttpStatus.CONFLICT,
    message: 'The current policy requires school review',
  },
  'grant.invalid': {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'The delegated scope, actions or validity period are invalid',
  },
  'revision.stale': {
    status: HttpStatus.CONFLICT,
    message: 'The result resource has changed',
  },
  'correction_window.invalid': {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'The correction window target or expiry is invalid',
  },
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
