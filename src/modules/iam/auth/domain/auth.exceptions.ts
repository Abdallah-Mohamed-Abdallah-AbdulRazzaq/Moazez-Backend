import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export class InvalidCredentialsException extends DomainException {
  constructor() {
    super({
      code: 'auth.credentials.invalid',
      message: 'Invalid email or password',
      httpStatus: HttpStatus.UNAUTHORIZED,
    });
  }
}

export class AccountDisabledException extends DomainException {
  constructor() {
    super({
      code: 'auth.account.disabled',
      message: 'Account is disabled',
      httpStatus: HttpStatus.FORBIDDEN,
    });
  }
}

export class TokenExpiredException extends DomainException {
  constructor() {
    super({
      code: 'auth.token.expired',
      message: 'Access token expired',
      httpStatus: HttpStatus.UNAUTHORIZED,
    });
  }
}

export class TokenInvalidException extends DomainException {
  constructor() {
    super({
      code: 'auth.token.invalid',
      message: 'Invalid or malformed token',
      httpStatus: HttpStatus.UNAUTHORIZED,
    });
  }
}

export class SessionRevokedException extends DomainException {
  constructor() {
    super({
      code: 'auth.session.revoked',
      message: 'Session has been revoked',
      httpStatus: HttpStatus.UNAUTHORIZED,
    });
  }
}

export class RefreshRotatedException extends DomainException {
  constructor() {
    super({
      code: 'auth.refresh.rotated',
      message: 'Refresh token already rotated',
      httpStatus: HttpStatus.UNAUTHORIZED,
    });
  }
}

export class ScopeMissingException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'auth.scope.missing',
      message: 'Active scope is required for this action',
      httpStatus: HttpStatus.FORBIDDEN,
      details,
    });
  }
}
