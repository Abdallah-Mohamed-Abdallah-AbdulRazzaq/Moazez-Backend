import { Injectable } from '@nestjs/common';
import { STUDENT_BULK_REGISTRATION_TEMPLATE_CSV } from '../domain/student-bulk-registration.constants';

@Injectable()
export class GetStudentBulkRegistrationTemplateUseCase {
  execute(): string {
    return STUDENT_BULK_REGISTRATION_TEMPLATE_CSV;
  }
}
