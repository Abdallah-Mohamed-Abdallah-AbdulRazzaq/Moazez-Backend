import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { ListEnrollmentsQueryDto, EnrollmentResponseDto } from '../dto/enrollment.dto';
import { EnrollmentsRepository } from '../infrastructure/enrollments.repository';
import { presentEnrollment } from '../presenters/enrollment.presenter';
import { mapEnrollmentStatusFromApi } from './shared';
import { StudentsRepository } from '../../students/infrastructure/students.repository';

@Injectable()
export class ListEnrollmentsUseCase {
  constructor(
    private readonly studentsRepository: StudentsRepository,
    private readonly enrollmentsRepository: EnrollmentsRepository,
  ) {}

  async execute(query: ListEnrollmentsQueryDto): Promise<EnrollmentResponseDto[]> {
    if (query.studentId) {
      const student = await this.studentsRepository.findStudentById(query.studentId);
      if (!student) {
        throw new NotFoundDomainException('Student not found', {
          studentId: query.studentId,
        });
      }
    }

    const enrollments = await this.enrollmentsRepository.listEnrollments({
      studentId: query.studentId,
      academicYearId: query.academicYearId,
      academicYear: query.academicYear,
      ...(query.status
        ? { status: mapEnrollmentStatusFromApi(query.status) }
        : {}),
    });

    return enrollments.map((enrollment) => presentEnrollment(enrollment));
  }
}
