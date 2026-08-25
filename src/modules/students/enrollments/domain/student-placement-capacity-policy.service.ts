import { Injectable } from '@nestjs/common';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import type { ClassroomRecord } from '../../../academics/structure/infrastructure/structure.repository';
import { EnrollmentsRepository } from '../infrastructure/enrollments.repository';
import { StudentEnrollmentPlacementConflictException } from './enrollment.exceptions';

export interface AssertStudentPlacementCapacityCommand {
  academicYearId: string;
  classroom: Pick<ClassroomRecord, 'id' | 'capacity'>;
  incrementBy?: number;
  excludeEnrollmentId?: string;
}

@Injectable()
export class StudentPlacementCapacityPolicyService {
  constructor(private readonly enrollmentsRepository: EnrollmentsRepository) {}

  async assertCanPlace(
    command: AssertStudentPlacementCapacityCommand,
  ): Promise<void> {
    const incrementBy = this.normalizeIncrement(command.incrementBy);

    if (command.classroom.capacity === null) {
      return;
    }

    const activeCount =
      await this.enrollmentsRepository.countActiveEnrollmentsInPlacement({
        academicYearId: command.academicYearId,
        classroomId: command.classroom.id,
        excludeEnrollmentId: command.excludeEnrollmentId,
      });
    const projectedActiveCount = activeCount + incrementBy;

    if (projectedActiveCount > command.classroom.capacity) {
      throw new StudentEnrollmentPlacementConflictException({
        academicYearId: command.academicYearId,
        classroomId: command.classroom.id,
        capacity: command.classroom.capacity,
        activeCount,
        incrementBy,
        projectedActiveCount,
      });
    }
  }

  private normalizeIncrement(incrementBy?: number): number {
    const normalizedIncrement = incrementBy === undefined ? 1 : incrementBy;

    if (
      !Number.isSafeInteger(normalizedIncrement) ||
      normalizedIncrement <= 0
    ) {
      throw new ValidationDomainException(
        'Placement increment must be a positive integer',
        { field: 'incrementBy' },
      );
    }

    return normalizedIncrement;
  }
}
