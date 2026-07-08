import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../common/exceptions/domain-exception';

export class SchoolSupportConversationNotFoundException extends DomainException {
  constructor() {
    super({
      code: 'school_support.conversation.not_found',
      message: 'School support conversation was not found',
      httpStatus: HttpStatus.NOT_FOUND,
    });
  }
}

export class SchoolSupportConversationClosedException extends DomainException {
  constructor() {
    super({
      code: 'school_support.conversation.closed',
      message: 'School support conversation is closed',
      httpStatus: HttpStatus.CONFLICT,
    });
  }
}

export class SchoolSupportMessageEmptyException extends DomainException {
  constructor() {
    super({
      code: 'school_support.message.empty',
      message: 'Support message cannot be empty',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    });
  }
}

export class PlatformSupportInvalidActorException extends DomainException {
  constructor() {
    super({
      code: 'platform_support.actor.invalid_type',
      message: 'Platform support requires a platform actor without school membership',
      httpStatus: HttpStatus.FORBIDDEN,
    });
  }
}

export class PlatformSupportConversationNotFoundException extends DomainException {
  constructor() {
    super({
      code: 'platform_support.conversation.not_found',
      message: 'Platform support conversation was not found',
      httpStatus: HttpStatus.NOT_FOUND,
    });
  }
}

export class PlatformSupportConversationClosedException extends DomainException {
  constructor() {
    super({
      code: 'platform_support.conversation.closed',
      message: 'Platform support conversation is closed',
      httpStatus: HttpStatus.CONFLICT,
    });
  }
}

export class PlatformSupportConversationInvalidStateException extends DomainException {
  constructor(message = 'Platform support conversation state is invalid') {
    super({
      code: 'platform_support.conversation.invalid_state',
      message,
      httpStatus: HttpStatus.CONFLICT,
    });
  }
}

export class PlatformSupportMessageEmptyException extends DomainException {
  constructor() {
    super({
      code: 'platform_support.message.empty',
      message: 'Support reply cannot be empty',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    });
  }
}
