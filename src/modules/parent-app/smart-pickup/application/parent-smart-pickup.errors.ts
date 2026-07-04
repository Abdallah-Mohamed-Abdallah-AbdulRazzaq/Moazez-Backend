import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export class ParentSmartPickupInvalidActorTypeException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'parent.smart_pickup.invalid_actor_type',
      message: 'Parent Smart Pickup requires a parent actor',
      httpStatus: HttpStatus.FORBIDDEN,
      details,
    });
  }
}

export class ParentSmartPickupParentContextNotFoundException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'parent.smart_pickup.parent_context_not_found',
      message: 'Parent Smart Pickup parent context was not found',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class ParentSmartPickupSchoolContextRequiredException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'parent.smart_pickup.school_context_required',
      message: 'Parent Smart Pickup requires an active school context',
      httpStatus: HttpStatus.FORBIDDEN,
      details,
    });
  }
}
