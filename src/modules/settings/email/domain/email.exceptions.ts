import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export class EmailConnectionMissingException extends DomainException {
  constructor() {
    super({
      code: 'settings.email.connection_missing',
      message: 'School email connection is not configured',
      httpStatus: HttpStatus.NOT_FOUND,
    });
  }
}

export class EmailConnectionNotVerifiedException extends DomainException {
  constructor() {
    super({
      code: 'settings.email.connection_not_verified',
      message: 'School email connection must be verified before activation',
      httpStatus: HttpStatus.CONFLICT,
    });
  }
}

export class EmailConnectionTestFailedException extends DomainException {
  constructor(reason: string) {
    super({
      code: 'settings.email.connection_test_failed',
      message: 'School email connection test failed',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details: { reason },
    });
  }
}

export class EmailSecretEncryptionFailedException extends DomainException {
  constructor() {
    super({
      code: 'settings.email.secret_encryption_failed',
      message: 'School email secret encryption failed',
      httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    });
  }
}

export class EmailTemplateInvalidException extends DomainException {
  constructor(details: Record<string, unknown>) {
    super({
      code: 'settings.email.template_invalid',
      message: 'School email template is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}
