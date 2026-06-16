import { MembershipStatus, UserType } from '@prisma/client';
import {
  TeacherAllocationClosedTermException,
  TeacherAllocationDuplicatePairException,
  TeacherAllocationInvalidBulkSizeException,
  TeacherAllocationInvalidScopeException,
  TeacherAllocationMissingSubjectAllocationException,
} from '../domain/teacher-allocation.exceptions';
import {
  ActiveMembershipRecord,
  ClassroomReferenceRecord,
  SubjectReferenceRecord,
  TeacherAllocationDependencyCounts,
  TeacherAllocationRepository,
  TermReferenceRecord,
} from '../infrastructure/teacher-allocation.repository';

export const MAX_TEACHER_ALLOCATION_BULK_ITEMS = 500;

export interface TeacherAllocationCandidate {
  teacherUserId: string;
  subjectId: string;
  classroomId: string;
}

export interface ResolvedTeacherAllocationCandidate
  extends TeacherAllocationCandidate {
  gradeId: string;
}

export function assertValidBulkSize(items: unknown[]): void {
  if (!Array.isArray(items) || items.length === 0) {
    throw new TeacherAllocationInvalidBulkSizeException({
      minItems: 1,
      maxItems: MAX_TEACHER_ALLOCATION_BULK_ITEMS,
    });
  }

  if (items.length > MAX_TEACHER_ALLOCATION_BULK_ITEMS) {
    throw new TeacherAllocationInvalidBulkSizeException({
      minItems: 1,
      maxItems: MAX_TEACHER_ALLOCATION_BULK_ITEMS,
      received: items.length,
    });
  }
}

export function assertNoDuplicateAllocationPairs(
  items: TeacherAllocationCandidate[],
  termId: string,
): void {
  const seenPairs = new Set<string>();

  for (const item of items) {
    const key = allocationPairKey(termId, item);
    if (seenPairs.has(key)) {
      throw new TeacherAllocationDuplicatePairException({
        termId,
        teacherUserId: item.teacherUserId,
        subjectId: item.subjectId,
        classroomId: item.classroomId,
      });
    }
    seenPairs.add(key);
  }
}

export function assertNoDuplicateClassroomIds(classroomIds: string[]): void {
  const seenIds = new Set<string>();
  for (const classroomId of classroomIds) {
    if (seenIds.has(classroomId)) {
      throw new TeacherAllocationDuplicatePairException({ classroomId });
    }
    seenIds.add(classroomId);
  }
}

export function assertTermWritable(
  term: TermReferenceRecord | null,
  termId: string,
): TermReferenceRecord {
  if (!term) {
    throw new TeacherAllocationInvalidScopeException({ termId });
  }

  if (!term.isActive) {
    throw new TeacherAllocationClosedTermException({ termId });
  }

  return term;
}

export async function validateTeacherAllocationCandidates(
  repository: TeacherAllocationRepository,
  termId: string,
  candidates: TeacherAllocationCandidate[],
): Promise<ResolvedTeacherAllocationCandidate[]> {
  const teacherUserIds = unique(candidates.map((item) => item.teacherUserId));
  const subjectIds = unique(candidates.map((item) => item.subjectId));
  const classroomIds = unique(candidates.map((item) => item.classroomId));
  const [teacherMemberships, subjects, classrooms] = await Promise.all([
    repository.findActiveMembershipsByUserIds(teacherUserIds),
    repository.findSubjectsByIds(subjectIds),
    repository.findClassroomsByIds(classroomIds),
  ]);

  const teacherByUserId = new Map(
    teacherMemberships.map((membership) => [membership.user.id, membership]),
  );
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
  const classroomById = new Map(
    classrooms.map((classroom) => [classroom.id, classroom]),
  );

  const resolved = candidates.map((candidate) => {
    const teacherMembership = teacherByUserId.get(candidate.teacherUserId);
    assertActiveTeacher(teacherMembership, candidate.teacherUserId);

    const subject = subjectById.get(candidate.subjectId);
    assertActiveSubject(subject, candidate.subjectId);

    const classroom = classroomById.get(candidate.classroomId);
    if (!classroom) {
      throw new TeacherAllocationInvalidScopeException({
        classroomId: candidate.classroomId,
      });
    }

    return {
      ...candidate,
      gradeId: classroom.section.gradeId,
    };
  });

  const matrixKeys = uniqueBy(
    resolved.map((item) => ({
      gradeId: item.gradeId,
      subjectId: item.subjectId,
    })),
    (item) => subjectAllocationKey(item.gradeId, item.subjectId),
  );
  const subjectAllocations =
    await repository.findSubjectAllocationsByKeys(termId, matrixKeys);
  const matrixRowKeys = new Set(
    subjectAllocations.map((row) =>
      subjectAllocationKey(row.gradeId, row.subjectId),
    ),
  );

  for (const item of resolved) {
    if (!matrixRowKeys.has(subjectAllocationKey(item.gradeId, item.subjectId))) {
      throw new TeacherAllocationMissingSubjectAllocationException({
        termId,
        gradeId: item.gradeId,
        subjectId: item.subjectId,
        classroomId: item.classroomId,
      });
    }
  }

  return resolved;
}

export function assertActiveTeacher(
  teacherMembership: ActiveMembershipRecord | null | undefined,
  teacherUserId: string,
): void {
  if (
    !teacherMembership ||
    teacherMembership.status !== MembershipStatus.ACTIVE ||
    teacherMembership.endedAt !== null ||
    teacherMembership.userType !== UserType.TEACHER ||
    teacherMembership.user.userType !== UserType.TEACHER
  ) {
    throw new TeacherAllocationInvalidScopeException({ teacherUserId });
  }
}

export function assertActiveSubject(
  subject: SubjectReferenceRecord | null | undefined,
  subjectId: string,
): void {
  if (!subject || !subject.isActive) {
    throw new TeacherAllocationInvalidScopeException({ subjectId });
  }
}

export function dependencyConflictDetails(
  counts: TeacherAllocationDependencyCounts,
): Record<string, number> {
  return {
    timetableEntries: counts.timetableEntries,
    lessonPlans: counts.lessonPlans,
    homeworkAssignments: counts.homeworkAssignments,
  };
}

export function hasDependencyCounts(
  counts: TeacherAllocationDependencyCounts,
): boolean {
  return (
    counts.timetableEntries > 0 ||
    counts.lessonPlans > 0 ||
    counts.homeworkAssignments > 0
  );
}

export function subjectAllocationKey(
  gradeId: string,
  subjectId: string,
): string {
  return `${gradeId}:${subjectId}`;
}

function allocationPairKey(
  termId: string,
  item: TeacherAllocationCandidate,
): string {
  return `${termId}:${item.teacherUserId}:${item.subjectId}:${item.classroomId}`;
}

export function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function uniqueBy<T>(values: T[], getKey: (value: T) => string): T[] {
  const seenKeys = new Set<string>();
  const result: T[] = [];

  for (const value of values) {
    const key = getKey(value);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    result.push(value);
  }

  return result;
}
