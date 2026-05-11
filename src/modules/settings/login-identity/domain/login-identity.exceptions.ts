import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';
import {
  LoginDomainValidationReason,
  UsernameValidationReason,
} from './login-identity.policy';

export class UsernameInvalidException extends DomainException {
  constructor(reason: UsernameValidationReason, username?: string) {
    super({
      code: 'iam.user.username_invalid',
      message: 'Username is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details: { reason, username },
    });
  }
}

export class UsernameTakenException extends DomainException {
  constructor(username: string) {
    super({
      code: 'iam.user.username_taken',
      message: 'Username is already taken',
      httpStatus: HttpStatus.CONFLICT,
      details: { username },
    });
  }
}

export class LoginEmailTakenException extends DomainException {
  constructor(loginEmail: string) {
    super({
      code: 'iam.user.login_email_taken',
      message: 'Generated login email is already taken',
      httpStatus: HttpStatus.CONFLICT,
      details: { loginEmail },
    });
  }
}

export class LoginDomainMissingException extends DomainException {
  constructor() {
    super({
      code: 'iam.user.login_domain_missing',
      message: 'School login domain is not configured',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    });
  }
}

export class LoginDomainInvalidException extends DomainException {
  constructor(reason: LoginDomainValidationReason, loginDomain?: string) {
    super({
      code: 'iam.user.login_domain_invalid',
      message: 'Login domain is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details: { reason, loginDomain },
    });
  }
}

export class SettingsLoginDomainInvalidException extends DomainException {
  constructor(reason: LoginDomainValidationReason, loginDomain?: string) {
    super({
      code: 'settings.login_identity.domain_invalid',
      message: 'Login identity domain is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details: { reason, loginDomain },
    });
  }
}

export class LoginIdentityNotConfiguredException extends DomainException {
  constructor() {
    super({
      code: 'settings.login_identity.not_configured',
      message: 'School login identity settings are not configured',
      httpStatus: HttpStatus.NOT_FOUND,
    });
  }
}
