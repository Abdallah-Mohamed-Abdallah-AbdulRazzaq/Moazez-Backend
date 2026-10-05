import { isUUID } from 'class-validator';
import {
  AcademicContentTargetScopeType,
  AcademicContentType,
  Prisma,
  UserType,
} from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import {
  LockedTeacherAllocation,
  TeacherAllocationOperationalWriteGate,
  TeacherAllocationOperationalWriteGateError,
} from '../../teacher-allocation/application/teacher-allocation-operational-write-gate';
import { normalizeAcademicContentTargets } from '../domain/academic-content-target.policy';

/** Internal scope: the actor-specific application layer has already proven manage. */
export type AcademicContentTeacherWriteScope = {
  schoolId: string;
  organizationId: string;
  actorId: string;
  teacherUserId: string;
};

export function assertTeacherAcademicContentClassIds(
  classIds: readonly string[],
): void {
  if (
    !Array.isArray(classIds) ||
    classIds.length < 1 ||
    classIds.length > 50 ||
    classIds.some((id) => typeof id !== 'string' || !isUUID(id)) ||
    new Set(classIds).size !== classIds.length
  )
    throw new ValidationDomainException(
      'Teacher targets require 1 to 50 unique class allocation UUIDs',
    );
}

export async function lockTeacherAcademicContentAllocations(
  tx: Prisma.TransactionClient,
  gate: TeacherAllocationOperationalWriteGate | undefined,
  input: {
    schoolId: string;
    teacherUserId: string;
    allocationIds: readonly string[];
  },
): Promise<LockedTeacherAllocation[]> {
  if (!gate)
    throw new Error('Academic Content Teacher write gate is unavailable');
  try {
    return await gate.lock(tx, {
      schoolId: input.schoolId,
      allocationIds: input.allocationIds,
      expectedTeacherUserId: input.teacherUserId,
    });
  } catch (error) {
    if (error instanceof TeacherAllocationOperationalWriteGateError)
      throw new NotFoundDomainException('Academic content or class not found');
    throw error;
  }
}

/** Called after locking the exact nondeleted content row, in its write transaction. */
export async function authorizeTeacherAcademicContentMutation(
  tx: Prisma.TransactionClient,
  gate: TeacherAllocationOperationalWriteGate | undefined,
  input: {
    id: string;
    schoolId: string;
    actorId: string;
    teacherUserId: string;
  },
  createdByUserId: string,
  requestedClassIds: readonly string[] = [],
): Promise<LockedTeacherAllocation[]> {
  if (
    input.actorId !== input.teacherUserId ||
    createdByUserId !== input.teacherUserId
  )
    throw new NotFoundDomainException('Academic content not found');
  const targets = await tx.academicContentTarget.findMany({
    where: { schoolId: input.schoolId, academicContentId: input.id },
    select: { teacherSubjectAllocationId: true },
  });
  const currentIds = targets.flatMap((target) =>
    target.teacherSubjectAllocationId
      ? [target.teacherSubjectAllocationId]
      : [],
  );
  if (currentIds.length === 0)
    throw new NotFoundDomainException('Academic content not found');
  return lockTeacherAcademicContentAllocations(tx, gate, {
    schoolId: input.schoolId,
    teacherUserId: input.teacherUserId,
    allocationIds: [...new Set([...currentIds, ...requestedClassIds])],
  });
}

export function teacherAcademicContentTargets(
  type: AcademicContentType,
  allocations: readonly LockedTeacherAllocation[],
) {
  return normalizeAcademicContentTargets(
    type,
    UserType.TEACHER,
    allocations.map((allocation) => ({
      scopeType: AcademicContentTargetScopeType.CLASSROOM,
      classroomId: allocation.classroomId,
      subjectId: allocation.subjectId,
      teacherSubjectAllocationId: allocation.id,
    })),
  );
}
