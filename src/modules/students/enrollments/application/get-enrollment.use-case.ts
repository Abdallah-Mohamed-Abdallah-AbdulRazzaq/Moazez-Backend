import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { EnrollmentResponseDto } from '../dto/enrollment.dto';
import { EnrollmentsRepository } from '../infrastructure/enrollments.repository';
import { presentEnrollment } from '../presenters/enrollment.presenter';

@Injectable()
export class GetEnrollmentUseCase {
  constructor(private readonly enrollmentsRepository: EnrollmentsRepository) {}

  async execute(enrollmentId: string): Promise<EnrollmentResponseDto> {
    const enrollment = await this.enrollmentsRepository.findEnrollmentById(
      enrollmentId,
    );
    if (!enrollment) {
      throw new NotFoundDomainException('Enrollment not found', {
        enrollmentId,
      });
    }

    return presentEnrollment(enrollment);
  }
}
