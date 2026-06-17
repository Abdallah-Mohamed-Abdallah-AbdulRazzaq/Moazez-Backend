import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export class ParentChildLessonNotFoundException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'parent_app.lessons.not_found',
      message: 'Parent child lesson was not found',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}
