import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { StudentsRepository } from '../../students/infrastructure/students.repository';
import { CurrentEnrollmentQueryDto, EnrollmentResponseDto } from '../dto/enrollment.dto';
import { EnrollmentsRepository } from '../infrastructure/enrollments.repository';
import { presentEnrollment } from '../presenters/enrollment.presenter';

@Injectable()
export class GetCurrentEnrollmentUseCase {
  constructor(
    private readonly studentsRepository: StudentsRepository,
    private readonly enrollmentsRepository: EnrollmentsRepository,
  ) {}

  async execute(
    query: CurrentEnrollmentQueryDto,
  ): Promise<EnrollmentResponseDto | null> {
    const student = await this.studentsRepository.findStudentById(query.studentId);
    if (!student) {
      throw new NotFoundDomainException('Student not found', {
        studentId: query.studentId,
      });
    }

    const enrollment = await this.enrollmentsRepository.findCurrentEnrollment({
      studentId: query.studentId,
      academicYearId: query.academicYearId,
      academicYear: query.academicYear,
    });

    return enrollment ? presentEnrollment(enrollment) : null;
  }
}
