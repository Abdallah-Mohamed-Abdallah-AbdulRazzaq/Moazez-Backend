import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../common/exceptions/domain-exception';

export class HomeworkAssignmentNotFoundException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.assignment.not_found',
      message: 'Homework assignment was not found',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class HomeworkAssignmentNotMutableException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.assignment.not_mutable',
      message: 'Homework assignment cannot be changed in its current state',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class HomeworkAssignmentNotPublishableException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.assignment.not_publishable',
      message: 'Homework assignment cannot be published in its current state',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class HomeworkAssignmentAlreadyPublishedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.assignment.already_published',
      message: 'Homework assignment is already published',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class HomeworkAssignmentAlreadyClosedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.assignment.already_closed',
      message: 'Homework assignment is already closed',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class HomeworkAssignmentCancelledException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.assignment.cancelled',
      message: 'Homework assignment is cancelled',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class HomeworkAssignmentScheduleMismatchException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.assignment.schedule_mismatch',
      message: 'Homework assignment schedule context is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class HomeworkAssignmentAllocationMismatchException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.assignment.allocation_mismatch',
      message: 'Homework assignment allocation context is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class HomeworkAssignmentDueDateInvalidException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.assignment.due_date_invalid',
      message: 'Homework assignment due date is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class HomeworkAssignmentTargetRequiredException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.assignment.target_required',
      message: 'Homework assignment target selection is required',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class HomeworkAssignmentNoEligibleTargetsException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.assignment.no_eligible_targets',
      message: 'Homework assignment has no eligible targets',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class HomeworkAssignmentTargetConflictException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.assignment.target_conflict',
      message: 'Homework assignment target selection is invalid',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class HomeworkAssignmentValidationException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.assignment.validation_failed',
      message: 'Homework assignment validation failed',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class HomeworkSubmissionTargetNotFoundException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.submission.target_not_found',
      message: 'Homework submission target was not found',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class HomeworkSubmissionNotFoundException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.submission.not_found',
      message: 'Homework submission was not found',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class HomeworkSubmissionNotSubmittableException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.submission.not_submittable',
      message: 'Homework submission is not allowed in the current state',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class HomeworkSubmissionNotReviewableException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.submission.not_reviewable',
      message: 'Homework submission cannot be reviewed in the current state',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class HomeworkSubmissionAlreadyReviewedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.submission.already_reviewed',
      message: 'Homework submission is already reviewed',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class HomeworkSubmissionReviewInvalidException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.submission.review_invalid',
      message: 'Homework submission review is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class HomeworkSubmissionAlreadySubmittedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.submission.already_submitted',
      message: 'Homework submission is already submitted',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}
