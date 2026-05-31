import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../common/exceptions/domain-exception';

export class HomeworkAnswerReviewNotFoundException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.answer_review.not_found',
      message: 'Homework answer review target was not found',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class HomeworkAnswerReviewInvalidScopeException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.answer_review.invalid_scope',
      message: 'Homework answer review scope is invalid',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class HomeworkAnswerReviewNotSubmittedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.answer_review.not_submitted',
      message: 'Homework answer cannot be reviewed before submission',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class HomeworkAnswerReviewInvalidPointsException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.answer_review.invalid_points',
      message: 'Homework answer review points are invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class HomeworkAnswerReviewExceedsQuestionPointsException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.answer_review.exceeds_question_points',
      message: 'Homework answer review points exceed question points',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class HomeworkAnswerReviewExceedsAssignmentMarksException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.answer_review.exceeds_assignment_marks',
      message: 'Homework answer review total exceeds assignment marks',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class HomeworkAnswerReviewReadOnlyException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.answer_review.read_only',
      message: 'Homework answer review is read-only in this submission state',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class HomeworkAnswerReviewIncompleteRequiredAnswersException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'homework.answer_review.incomplete_required_answers',
      message: 'Required homework answers are not fully reviewed',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}
