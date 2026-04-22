import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export class UserEmailTakenException extends DomainException {
  constructor(email: string) {
    super({
      code: 'iam.user.email_taken',
      message: 'A user with this email already exists',
      httpStatus: HttpStatus.CONFLICT,
      details: { email },
    });
  }
}

export class UserNotInvitableException extends DomainException {
  constructor(userId: string) {
    super({
      code: 'iam.user.not_invitable',
      message: 'User cannot be re-invited in the current state',
      httpStatus: HttpStatus.CONFLICT,
      details: { userId },
    });
  }
}
