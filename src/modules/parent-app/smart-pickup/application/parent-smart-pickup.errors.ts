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

export class DismissalSettingsDisabledException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'dismissal.settings.disabled',
      message: 'Dismissal is disabled for this school',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class DismissalSettingsCoordinatesRequiredException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'dismissal.settings.coordinates_required',
      message: 'Dismissal school zone coordinates are required',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class DismissalRequestOutsideWindowException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'dismissal.request.outside_window',
      message: 'Dismissal request is outside the configured request window',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class DismissalRequestOutsideGeofenceException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'dismissal.request.outside_geofence',
      message: 'Parent location is outside the allowed school zone',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class DismissalRequestStudentNotOwnedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'dismissal.request.student_not_owned',
      message: 'Dismissal request child was not found',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class DismissalRequestStudentNotActiveException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'dismissal.request.student_not_active',
      message: 'Dismissal request student is not active',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class DismissalRequestNoActiveEnrollmentException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'dismissal.request.no_active_enrollment',
      message: 'Dismissal request student has no active enrollment',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class DismissalRequestGuardianNotAllowedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'dismissal.request.guardian_not_allowed',
      message: 'Guardian is not allowed to request pickup for this child',
      httpStatus: HttpStatus.FORBIDDEN,
      details,
    });
  }
}

export class DismissalRequestDuplicateActiveException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'dismissal.request.duplicate_active',
      message: 'Student already has an active dismissal request',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class DismissalRequestGateRequiredException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'dismissal.request.gate_required',
      message: 'A deterministic available dismissal gate is required',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class DismissalRequestIdempotencyConflictException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'dismissal.request.idempotency_conflict',
      message: 'Client request id has already been used for a different dismissal request',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class DismissalGateNotFoundForRequestException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'dismissal.gate.not_found',
      message: 'Dismissal gate was not found',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class DismissalGateClosedForRequestException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'dismissal.gate.closed',
      message: 'Dismissal gate is not available for pickup requests',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}
