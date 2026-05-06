import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../common/exceptions/domain-exception';

export class StudentAppRequiredStudentException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'student_app.actor.required_student',
      message: 'Student App requires an active student membership',
      httpStatus: HttpStatus.FORBIDDEN,
      details,
    });
  }
}

export class StudentAppStudentNotFoundException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'student_app.student.not_found',
      message: 'Student App student was not found',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class StudentAppEnrollmentNotFoundException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'student_app.enrollment.not_found',
      message: 'Student App active enrollment was not found',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}

export class StudentAppClassroomNotFoundException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'student_app.classroom.not_found',
      message: 'Student App classroom was not found',
      httpStatus: HttpStatus.NOT_FOUND,
      details,
    });
  }
}
