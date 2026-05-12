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

export class EmailDeliveryConnectionInactiveException extends DomainException {
  constructor() {
    super({
      code: 'settings.email.delivery_connection_inactive',
      message: 'School email delivery connection is not active',
      httpStatus: HttpStatus.CONFLICT,
    });
  }
}

export class EmailDeliveryTemplateMissingException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'settings.email.delivery_template_missing',
      message: 'School email delivery template is missing or inactive',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class EmailDeliveryNoRecipientsException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'settings.email.delivery_no_recipients',
      message: 'No eligible email delivery recipients were found',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class EmailDeliveryBatchNotFoundException extends DomainException {
  constructor() {
    super({
      code: 'settings.email.delivery_batch_not_found',
      message: 'Email delivery batch was not found',
      httpStatus: HttpStatus.NOT_FOUND,
    });
  }
}

export class EmailDeliveryBatchNotCancelableException extends DomainException {
  constructor(status: string) {
    super({
      code: 'settings.email.delivery_batch_not_cancelable',
      message: 'Email delivery batch cannot be cancelled in its current state',
      httpStatus: HttpStatus.CONFLICT,
      details: { status },
    });
  }
}

export class EmailDeliveryTooManyRecipientsException extends DomainException {
  constructor(count: number, limit: number) {
    super({
      code: 'settings.email.delivery_too_many_recipients',
      message: 'Email delivery recipient limit exceeded',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details: { count, limit },
    });
  }
}

export class EmailDeliverySendFailedException extends DomainException {
  constructor(reason: string) {
    super({
      code: 'settings.email.delivery_send_failed',
      message: 'Email delivery send failed',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details: { reason },
    });
  }
}

export class EmailCampaignInvalidException extends DomainException {
  constructor(details: Record<string, unknown>) {
    super({
      code: 'settings.email.campaign_invalid',
      message: 'School email campaign is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class EmailCampaignCredentialVariablesForbiddenException extends DomainException {
  constructor(variables: string[]) {
    super({
      code: 'settings.email.campaign_credential_variables_forbidden',
      message: 'Credential variables are not allowed in general email campaigns',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details: { variables },
    });
  }
}
