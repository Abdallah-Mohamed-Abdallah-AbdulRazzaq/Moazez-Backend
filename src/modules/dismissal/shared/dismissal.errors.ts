import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../common/exceptions/domain-exception';

export class DismissalException extends DomainException {
  constructor(
    code: string,
    message: string,
    httpStatus = HttpStatus.UNPROCESSABLE_ENTITY,
    details?: Record<string, unknown>,
  ) {
    super({ code, message, httpStatus, details });
  }
}

export class DismissalGateNotFoundException extends DismissalException {
  constructor() {
    super(
      'dismissal.gate.not_found',
      'Dismissal gate was not found.',
      HttpStatus.NOT_FOUND,
    );
  }
}

export class DismissalGateDuplicateCodeException extends DismissalException {
  constructor() {
    super(
      'dismissal.gate.duplicate_code',
      'A dismissal gate with this code already exists in this school.',
      HttpStatus.CONFLICT,
    );
  }
}

export class DismissalInvalidStatusException extends DismissalException {
  constructor() {
    super(
      'dismissal.gate.invalid_status',
      'Dismissal gate status is invalid.',
    );
  }
}

export class DismissalInvalidGateCoordinatesException extends DismissalException {
  constructor() {
    super(
      'dismissal.gate.invalid_coordinates',
      'Dismissal gate coordinates are invalid.',
    );
  }
}

export class DismissalInvalidWaitingZonesException extends DismissalException {
  constructor() {
    super(
      'dismissal.gate.invalid_waiting_zones',
      'Dismissal gate waiting zones are invalid.',
    );
  }
}

export class DismissalSettingsInvalidTimezoneException extends DismissalException {
  constructor() {
    super(
      'dismissal.settings.invalid_timezone',
      'Dismissal settings timezone is invalid.',
    );
  }
}

export class DismissalSettingsInvalidCoordinatesException extends DismissalException {
  constructor() {
    super(
      'dismissal.settings.invalid_coordinates',
      'Dismissal settings coordinates are invalid.',
    );
  }
}

export class DismissalSettingsInvalidRadiusException extends DismissalException {
  constructor() {
    super(
      'dismissal.settings.invalid_radius',
      'Dismissal settings allowed radius is invalid.',
    );
  }
}

export class DismissalSettingsInvalidWindowException extends DismissalException {
  constructor() {
    super(
      'dismissal.settings.invalid_window',
      'Dismissal request window is invalid.',
    );
  }
}

export class DismissalSettingsInvalidThresholdsException extends DismissalException {
  constructor() {
    super(
      'dismissal.settings.invalid_thresholds',
      'Dismissal thresholds are invalid.',
    );
  }
}

export class DismissalDefaultGateNotFoundException extends DismissalException {
  constructor() {
    super(
      'dismissal.settings.default_gate_not_found',
      'Default dismissal gate was not found in the current school.',
      HttpStatus.NOT_FOUND,
    );
  }
}

export class DismissalCoordinatesRequiredWhenEnabledException extends DismissalException {
  constructor() {
    super(
      'dismissal.settings.coordinates_required_when_enabled',
      'School coordinates are required when dismissal is enabled.',
    );
  }
}

export class DismissalProfileInvalidActorTypeException extends DismissalException {
  constructor() {
    super(
      'dismissal.profile.invalid_actor_type',
      'Dismissal profile requires a dismissal staff actor.',
      HttpStatus.FORBIDDEN,
    );
  }
}

export class DismissalStaffAssignmentNotFoundException extends DismissalException {
  constructor() {
    super(
      'dismissal.staff_assignment.not_found',
      'Dismissal staff assignment was not found.',
      HttpStatus.NOT_FOUND,
    );
  }
}

export class DismissalStaffAssignmentStaffNotFoundException extends DismissalException {
  constructor() {
    super(
      'dismissal.staff_assignment.staff_not_found',
      'Dismissal staff user was not found.',
      HttpStatus.NOT_FOUND,
    );
  }
}

export class DismissalStaffAssignmentStaffNotDismissalStaffException extends DismissalException {
  constructor() {
    super(
      'dismissal.staff_assignment.staff_not_dismissal_staff',
      'Assigned user must be a dismissal staff user.',
    );
  }
}

export class DismissalStaffAssignmentStaffNotInSchoolException extends DismissalException {
  constructor() {
    super(
      'dismissal.staff_assignment.staff_not_in_school',
      'Dismissal staff user is not active in the current school.',
    );
  }
}

export class DismissalStaffAssignmentScopeRequiredException extends DismissalException {
  constructor() {
    super(
      'dismissal.staff_assignment.scope_required',
      'At least one dismissal staff assignment scope is required.',
    );
  }
}

export class DismissalStaffAssignmentGateNotFoundException extends DismissalException {
  constructor() {
    super(
      'dismissal.staff_assignment.gate_not_found',
      'Dismissal assignment gate was not found.',
      HttpStatus.NOT_FOUND,
    );
  }
}

export class DismissalStaffAssignmentStageNotFoundException extends DismissalException {
  constructor() {
    super(
      'dismissal.staff_assignment.stage_not_found',
      'Dismissal assignment stage was not found.',
      HttpStatus.NOT_FOUND,
    );
  }
}

export class DismissalStaffAssignmentGradeNotFoundException extends DismissalException {
  constructor() {
    super(
      'dismissal.staff_assignment.grade_not_found',
      'Dismissal assignment grade was not found.',
      HttpStatus.NOT_FOUND,
    );
  }
}

export class DismissalStaffAssignmentSectionNotFoundException extends DismissalException {
  constructor() {
    super(
      'dismissal.staff_assignment.section_not_found',
      'Dismissal assignment section was not found.',
      HttpStatus.NOT_FOUND,
    );
  }
}

export class DismissalStaffAssignmentClassroomNotFoundException extends DismissalException {
  constructor() {
    super(
      'dismissal.staff_assignment.classroom_not_found',
      'Dismissal assignment classroom was not found.',
      HttpStatus.NOT_FOUND,
    );
  }
}

export class DismissalStaffAssignmentScopeMismatchException extends DismissalException {
  constructor() {
    super(
      'dismissal.staff_assignment.scope_mismatch',
      'Dismissal assignment academic scope is inconsistent.',
    );
  }
}

export class DismissalStaffAssignmentInvalidTimeWindowException extends DismissalException {
  constructor() {
    super(
      'dismissal.staff_assignment.invalid_time_window',
      'Dismissal staff assignment time window is invalid.',
    );
  }
}

export class DismissalStaffAssignmentDuplicateActiveException extends DismissalException {
  constructor() {
    super(
      'dismissal.staff_assignment.duplicate_active',
      'An active dismissal staff assignment already exists for this exact scope.',
      HttpStatus.CONFLICT,
    );
  }
}

export class DismissalRequestNotFoundException extends DismissalException {
  constructor() {
    super(
      'dismissal.request.not_found',
      'Dismissal request was not found.',
      HttpStatus.NOT_FOUND,
    );
  }
}

export class DismissalRequestInvalidStatusFilterException extends DismissalException {
  constructor() {
    super(
      'dismissal.request.invalid_status_filter',
      'Dismissal request status filter is invalid.',
    );
  }
}

export class DismissalRequestInvalidStatusException extends DismissalException {
  constructor() {
    super(
      'dismissal.request.invalid_status',
      'Dismissal request status is invalid.',
    );
  }
}

export class DismissalRequestInvalidTransitionException extends DismissalException {
  constructor() {
    super(
      'dismissal.request.invalid_transition',
      'Dismissal request status transition is invalid.',
      HttpStatus.CONFLICT,
    );
  }
}

export class DismissalRequestTerminalStatusException extends DismissalException {
  constructor() {
    super(
      'dismissal.request.terminal_status',
      'Terminal dismissal request statuses are not allowed in this operation.',
      HttpStatus.CONFLICT,
    );
  }
}

export class DismissalRequestInvalidQueueFilterException extends DismissalException {
  constructor() {
    super(
      'dismissal.request.invalid_queue_filter',
      'Dismissal request queue filter is invalid.',
    );
  }
}

export class DismissalRequestSchoolContextRequiredException extends DismissalException {
  constructor() {
    super(
      'dismissal.request.school_context_required',
      'A school context is required for dismissal requests.',
      HttpStatus.FORBIDDEN,
    );
  }
}
