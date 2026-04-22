import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { StudentsRepository } from '../../students/infrastructure/students.repository';
import { EnrollmentHistoryQueryDto, EnrollmentResponseDto } from '../dto/enrollment.dto';
import { EnrollmentsRepository } from '../infrastructure/enrollments.repository';
import { presentEnrollment } from '../presenters/enrollment.presenter';

@Injectable()
export class ListEnrollmentHistoryUseCase {
  constructor(
    private readonly studentsRepository: StudentsRepository,
    private readonly enrollmentsRepository: EnrollmentsRepository,
  ) {}

  async execute(
    query: EnrollmentHistoryQueryDto,
  ): Promise<EnrollmentResponseDto[]> {
    const student = await this.studentsRepository.findStudentById(query.studentId);
    if (!student) {
      throw new NotFoundDomainException('Student not found', {
        studentId: query.studentId,
      });
    }

    const enrollments = await this.enrollmentsRepository.listEnrollmentHistory(
      query.studentId,
    );

    return enrollments.map((enrollment) => presentEnrollment(enrollment));
  }
}
