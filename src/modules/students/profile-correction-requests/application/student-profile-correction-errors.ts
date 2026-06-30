import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export class ProfileCorrectionRequestNotPendingException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'students.profile_correction.not_pending',
      message: 'Profile correction request is not pending',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class ProfileCorrectionRequestTargetUnavailableException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'students.profile_correction.target_unavailable',
      message: 'Profile correction target student is unavailable',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}
