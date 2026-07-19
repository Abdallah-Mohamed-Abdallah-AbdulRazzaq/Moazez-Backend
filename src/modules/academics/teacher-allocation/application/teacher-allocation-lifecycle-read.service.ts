import { Injectable } from '@nestjs/common';
import { ScopeMissingException } from '../../../iam/auth/domain/auth.exceptions';
import { requireAcademicsScope } from '../../academics-context';
import {
  classifyTeacherAllocationTermState,
  summarizeTeacherAllocationLifecycleStates,
  type TeacherAllocationLifecycleSummary,
} from '../domain/teacher-allocation-lifecycle-state';
import { TeacherAllocationRepository } from '../infrastructure/teacher-allocation.repository';

export const TEACHER_ALLOCATION_LIFECYCLE_READER = Symbol(
  'TEACHER_ALLOCATION_LIFECYCLE_READER',
);

export interface TeacherAllocationLifecycleReader {
  classifyTeacherAllocationLifecycleState(
    schoolId: string,
    teacherUserId: string,
    asOf: Date,
  ): Promise<TeacherAllocationLifecycleSummary>;
}

@Injectable()
export class TeacherAllocationLifecycleReadService implements TeacherAllocationLifecycleReader {
  constructor(private readonly repository: TeacherAllocationRepository) {}

  async classifyTeacherAllocationLifecycleState(
    schoolId: string,
    teacherUserId: string,
    asOf: Date,
  ): Promise<TeacherAllocationLifecycleSummary> {
    const scope = requireAcademicsScope();
    if (scope.schoolId !== schoolId) throw new ScopeMissingException();

    const allocations =
      await this.repository.listTeacherAllocationLifecycleRecords(
        teacherUserId,
      );
    const classified = allocations.map((allocation) => ({
      id: allocation.id,
      state: classifyTeacherAllocationTermState(allocation.term, asOf),
    }));
    const dependencyRelevantIds = classified
      .filter((allocation) => allocation.state !== 'historical')
      .map((allocation) => allocation.id);
    const dependencyCounts = await this.repository.countAllocationDependencies(
      dependencyRelevantIds,
    );

    return summarizeTeacherAllocationLifecycleStates(
      classified.map((allocation) => allocation.state),
      dependencyCounts,
    );
  }
}
