import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../common/exceptions/domain-exception';

export class HomeworkGradeSyncNotLinkedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.grade_sync.not_linked',
      message: 'Homework assignment is not linked to a grade assessment',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class HomeworkGradeSyncInvalidAssessmentException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.grade_sync.invalid_assessment',
      message: 'Grade assessment is not compatible with homework sync',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class HomeworkGradeSyncIncompatibleScopeException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.grade_sync.incompatible_scope',
      message: 'Grade assessment scope is incompatible with this homework',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class HomeworkGradeSyncAssessmentLockedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.grade_sync.assessment_locked',
      message: 'Grade assessment is locked for homework sync',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class HomeworkGradeSyncSubmissionNotReviewedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.grade_sync.submission_not_reviewed',
      message: 'Only reviewed homework submissions can be synced to Grades',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class HomeworkGradeSyncMissingScoreException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.grade_sync.missing_score',
      message: 'Reviewed homework submission has no awarded marks',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class HomeworkGradeSyncScoreExceedsHomeworkMarksException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.grade_sync.score_exceeds_homework_marks',
      message: 'Homework awarded marks exceed homework total marks',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class HomeworkGradeSyncScoreExceedsAssessmentMarksException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.grade_sync.score_exceeds_assessment_marks',
      message: 'Homework awarded marks exceed grade assessment marks',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class HomeworkGradeSyncDuplicateLinkException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.grade_sync.duplicate_link',
      message: 'Homework assignment is already linked to a grade assessment',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class HomeworkGradeSyncUnlinkNotAllowedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.grade_sync.unlink_not_allowed',
      message: 'Homework grade sync link cannot be removed safely',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class HomeworkGradeSyncFailedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.grade_sync.failed',
      message: 'Homework grade sync failed',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}
