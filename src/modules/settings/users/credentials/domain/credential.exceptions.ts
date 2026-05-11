import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../../common/exceptions/domain-exception';
import { CredentialPasswordFailureReason } from './credential-password.policy';

export class CredentialPasswordPolicyFailedException extends DomainException {
  constructor(reasons: CredentialPasswordFailureReason[]) {
    super({
      code: 'iam.credentials.password_policy_failed',
      message: 'Password does not meet credential policy',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details: { reasons },
    });
  }
}

export class CredentialMissingPasswordException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'iam.credentials.missing_password',
      message: 'User does not have a password credential',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class CredentialBulkTooLargeException extends DomainException {
  constructor(count: number, limit: number) {
    super({
      code: 'iam.credentials.bulk_too_large',
      message: 'Credential bulk operation is too large',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details: { count, limit },
    });
  }
}

export class CredentialNoEligibleUsersException extends DomainException {
  constructor() {
    super({
      code: 'iam.credentials.no_eligible_users',
      message: 'No eligible users matched the credential operation',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    });
  }
}

export class CredentialCurrentPasswordInvalidException extends DomainException {
  constructor() {
    super({
      code: 'iam.credentials.current_password_invalid',
      message: 'Current password is invalid',
      httpStatus: HttpStatus.UNAUTHORIZED,
    });
  }
}

export class CredentialUserNotManageableException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'iam.credentials.user_not_manageable',
      message: 'User credentials cannot be managed in the current state',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class TemporaryPasswordUnavailableException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'iam.credentials.temporary_password_unavailable',
      message: 'Temporary password is unavailable',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}
