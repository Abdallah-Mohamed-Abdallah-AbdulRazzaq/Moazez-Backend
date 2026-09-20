import type { UserType } from '@prisma/client';
import type { TeacherAllocationReassignmentSnapshot } from '../infrastructure/teacher-allocation-reassignment-read.repository';

export interface TeacherAllocationReassignmentSnapshotInput {
  schoolId: string;
  allocationId: string;
  newTeacherUserId: string;
}

export interface TeacherAllocationReassignmentHandoffInput {
  schoolId: string;
  allocationId: string;
  previousTeacherUserId: string;
  newTeacherUserId: string;
}

export interface TeacherAllocationReassignmentSuccessfulAuditEntry {
  actorId: string;
  userType: UserType;
  organizationId: string;
  schoolId: string;
  allocationId: string;
  previousTeacherUserId: string;
  newTeacherUserId: string;
  reasonCode?: string;
  transferred: {
    timetableEntries: number;
    lessonPlans: number;
    homeworkAssignments: number;
  };
}

export interface TeacherAllocationReassignmentTransactionContext {
  allocation: {
    lock(input: { schoolId: string; allocationId: string }): Promise<boolean>;
    handoff(input: TeacherAllocationReassignmentHandoffInput): Promise<number>;
  };
  snapshot: {
    load(
      input: TeacherAllocationReassignmentSnapshotInput,
    ): Promise<TeacherAllocationReassignmentSnapshot | null>;
  };
  timetable: {
    handoff(input: TeacherAllocationReassignmentHandoffInput): Promise<number>;
  };
  lessonPlans: {
    handoff(input: TeacherAllocationReassignmentHandoffInput): Promise<number>;
  };
  homework: {
    handoff(input: TeacherAllocationReassignmentHandoffInput): Promise<number>;
  };
  audit: {
    writeSuccessful(
      entry: TeacherAllocationReassignmentSuccessfulAuditEntry,
    ): Promise<void>;
  };
}

export abstract class TeacherAllocationReassignmentUnitOfWork {
  abstract execute<T>(
    callback: (
      context: TeacherAllocationReassignmentTransactionContext,
    ) => Promise<T>,
  ): Promise<T>;
}
