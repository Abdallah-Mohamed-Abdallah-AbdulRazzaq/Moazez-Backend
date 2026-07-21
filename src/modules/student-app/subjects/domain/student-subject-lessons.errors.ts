import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export class StudentSubjectLessonsNotFoundException extends DomainException {
  constructor() {
    super({
      code: 'learning.subject_lessons.not_found',
      message: 'Subject lessons not found or not accessible',
      httpStatus: HttpStatus.NOT_FOUND,
    });
  }
}
