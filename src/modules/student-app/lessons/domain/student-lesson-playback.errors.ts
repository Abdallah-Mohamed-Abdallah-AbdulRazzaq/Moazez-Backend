import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export class StudentLessonPlaybackNotFoundException extends DomainException {
  constructor() {
    super({
      code: 'learning.content.playback_not_found',
      message: 'Lesson content playback was not found',
      httpStatus: HttpStatus.NOT_FOUND,
    });
  }
}
