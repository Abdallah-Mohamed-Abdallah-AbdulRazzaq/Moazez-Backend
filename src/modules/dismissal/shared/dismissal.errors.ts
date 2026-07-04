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
