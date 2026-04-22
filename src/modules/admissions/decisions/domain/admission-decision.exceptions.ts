import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export class ApplicationAlreadyDecidedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'admissions.application.already_decided',
      message: 'Application already has a decision',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class DecisionRequiresAllStepsException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'admissions.decision.requires_all_steps',
      message: 'Tests and interviews must be completed first',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}
