import { Injectable } from '@nestjs/common';
import { requireStudentsScope } from '../../students/domain/students-scope';
import { EnrollmentAcademicYearResponseDto } from '../dto/enrollment.dto';
import { EnrollmentsRepository } from '../infrastructure/enrollments.repository';
import { presentEnrollmentAcademicYear } from '../presenters/enrollment.presenter';

@Injectable()
export class ListEnrollmentAcademicYearsUseCase {
  constructor(private readonly enrollmentsRepository: EnrollmentsRepository) {}

  async execute(): Promise<EnrollmentAcademicYearResponseDto[]> {
    requireStudentsScope();

    const academicYears = await this.enrollmentsRepository.listAcademicYears();
    return academicYears.map((year) => presentEnrollmentAcademicYear(year));
  }
}
