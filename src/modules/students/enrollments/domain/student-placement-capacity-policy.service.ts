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

export interface StudentPlacementCapacitySnapshot {
  academicYearId: string;
  classroomId: string;
  capacity: number | null;
  activeCount: number;
  incrementBy?: number;
}

export function assertStudentPlacementCapacitySnapshot(
  snapshot: StudentPlacementCapacitySnapshot,
): void {
  const incrementBy = normalizePlacementIncrement(snapshot.incrementBy);

  if (snapshot.capacity === null) return;

  const projectedActiveCount = snapshot.activeCount + incrementBy;
  if (projectedActiveCount > snapshot.capacity) {
    throw new StudentEnrollmentPlacementConflictException({
      academicYearId: snapshot.academicYearId,
      classroomId: snapshot.classroomId,
      capacity: snapshot.capacity,
      activeCount: snapshot.activeCount,
      incrementBy,
      projectedActiveCount,
    });
  }
}

@Injectable()
export class StudentPlacementCapacityPolicyService {
  constructor(private readonly enrollmentsRepository: EnrollmentsRepository) {}

  async assertCanPlace(
    command: AssertStudentPlacementCapacityCommand,
  ): Promise<void> {
    const incrementBy = normalizePlacementIncrement(command.incrementBy);

    if (command.classroom.capacity === null) {
      return;
    }

    const activeCount =
      await this.enrollmentsRepository.countActiveEnrollmentsInPlacement({
        academicYearId: command.academicYearId,
        classroomId: command.classroom.id,
        excludeEnrollmentId: command.excludeEnrollmentId,
      });
    assertStudentPlacementCapacitySnapshot({
      academicYearId: command.academicYearId,
      classroomId: command.classroom.id,
      capacity: command.classroom.capacity,
      activeCount,
      incrementBy,
    });
  }
}

function normalizePlacementIncrement(incrementBy?: number): number {
  const normalizedIncrement = incrementBy === undefined ? 1 : incrementBy;

  if (!Number.isSafeInteger(normalizedIncrement) || normalizedIncrement <= 0) {
    throw new ValidationDomainException(
      'Placement increment must be a positive integer',
      { field: 'incrementBy' },
    );
  }

  return normalizedIncrement;
}
