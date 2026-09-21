import type { Prisma } from '@prisma/client';

export interface LockedTeacherAllocation {
  id: string;
  schoolId: string;
  teacherUserId: string;
  subjectId: string;
  classroomId: string;
  termId: string;
}

export interface TeacherAllocationOperationalWriteGateInput {
  schoolId: string;
  allocationIds: readonly string[];
  expectedTeacherUserId?: string;
}

export type TeacherAllocationOperationalWriteGateFailure =
  | 'ALLOCATION_NOT_FOUND'
  | 'OWNER_CHANGED';

export class TeacherAllocationOperationalWriteGateError extends Error {
  constructor(readonly reason: TeacherAllocationOperationalWriteGateFailure) {
    super('Teacher allocation operational write gate rejected the write');
    this.name = TeacherAllocationOperationalWriteGateError.name;
  }
}

export abstract class TeacherAllocationOperationalWriteGate {
  abstract lock(
    transaction: Prisma.TransactionClient,
    input: TeacherAllocationOperationalWriteGateInput,
  ): Promise<LockedTeacherAllocation[]>;
}
