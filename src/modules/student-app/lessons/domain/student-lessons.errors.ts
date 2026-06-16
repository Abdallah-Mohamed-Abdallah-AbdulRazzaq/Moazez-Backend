import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export class StudentLessonNotFoundException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'student_app.lessons.not_found',
      message: 'Student lesson was not found',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}
