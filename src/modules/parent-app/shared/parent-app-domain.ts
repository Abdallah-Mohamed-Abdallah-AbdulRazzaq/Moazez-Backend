import {
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import type { RequestContext } from '../../../common/context/request-context';
import {
  ParentAppChildNotFoundException,
  ParentAppClassroomNotFoundException,
  ParentAppEnrollmentNotFoundException,
  ParentAppGuardianNotFoundException,
  ParentAppRequiredParentException,
} from './parent-app-errors';
import type {
  ParentAppAccessibleChild,
  ParentAppBaseContext,
  ParentAppContext,
  ParentAppEnrollmentRecord,
  ParentAppGuardianRecord,
  ParentAppStudentGuardianLinkRecord,
} from './parent-app.types';

export const PARENT_APP_GUARDIAN_ID_BACKING_MODEL = 'Guardian.id' as const;
export const PARENT_APP_CHILD_ID_BACKING_MODEL = 'Student.id' as const;
export const PARENT_APP_ENROLLMENT_ID_BACKING_MODEL = 'Enrollment.id' as const;
export const PARENT_APP_CLASSROOM_ID_BACKING_MODEL =
  'Enrollment.classroomId' as const;

export const PARENT_APP_CURRENT_SCHOOL_ONLY_GUARDRAIL = {
  crossSchoolAggregationEnabled: false,
  schoolScopeSource: 'RequestContext.activeMembership.schoolId',
  reason:
    'Sprint 9B resolves Parent App access only inside the active school context.',
} as const;

export function buildParentAppBaseContextFromRequestContext(
  context: RequestContext | undefined,
): ParentAppBaseContext {
  const actor = context?.actor;
  const activeMembership = context?.activeMembership;

  if (!actor) {
    throw new ParentAppRequiredParentException({ reason: 'actor_missing' });
  }

  if (actor.userType !== UserType.PARENT) {
    throw new ParentAppRequiredParentException({
      reason: 'actor_not_parent',
      userType: actor.userType,
    });
  }

  if (!activeMembership) {
    throw new ParentAppRequiredParentException({
      reason: 'active_membership_missing',
    });
  }

  return {
    parentUserId: requireContextValue(actor.id, 'parentUserId'),
    schoolId: requireContextValue(activeMembership.schoolId, 'schoolId'),
    organizationId: requireContextValue(
      activeMembership.organizationId,
      'organizationId',
    ),
    membershipId: requireContextValue(
      activeMembership.membershipId,
      'membershipId',
    ),
    roleId: requireContextValue(activeMembership.roleId, 'roleId'),
    permissions: [...(activeMembership.permissions ?? [])],
  };
}

export function assertParentAppGuardians(params: {
  context: ParentAppBaseContext;
  guardians: ParentAppGuardianRecord[];
}): ParentAppGuardianRecord[] {
  const { context, guardians } = params;

  if (guardians.length === 0) {
    throw new ParentAppGuardianNotFoundException({
      reason: 'current_school_guardian_missing',
    });
  }

  for (const guardian of guardians) {
    if (
      guardian.userId !== context.parentUserId ||
      guardian.schoolId !== context.schoolId ||
      guardian.organizationId !== context.organizationId ||
      guardian.deletedAt !== null
    ) {
      throw new ParentAppGuardianNotFoundException({
        guardianId: guardian.id,
        reason: 'guardian_not_owned_or_outside_current_school',
      });
    }

    if (
      !guardian.user ||
      guardian.user.id !== context.parentUserId ||
      guardian.user.userType !== UserType.PARENT ||
      guardian.user.status !== UserStatus.ACTIVE ||
      guardian.user.deletedAt !== null
    ) {
      throw new ParentAppGuardianNotFoundException({
        guardianId: guardian.id,
        reason: 'guardian_user_invalid',
      });
    }
  }

  return guardians;
}

export function assertParentAppLinkedStudentLinks(params: {
  context: ParentAppBaseContext;
  guardianIds: string[];
  links: ParentAppStudentGuardianLinkRecord[];
}): ParentAppStudentGuardianLinkRecord[] {
  const { context, guardianIds, links } = params;
  const guardianIdSet = new Set(guardianIds);

  if (links.length === 0) {
    throw new ParentAppChildNotFoundException({
      reason: 'linked_child_missing_in_current_school',
    });
  }

  for (const link of links) {
    if (
      link.schoolId !== context.schoolId ||
      !guardianIdSet.has(link.guardianId) ||
      !link.student ||
      link.student.id !== link.studentId ||
      link.student.schoolId !== context.schoolId ||
      link.student.organizationId !== context.organizationId ||
      link.student.status !== StudentStatus.ACTIVE ||
      link.student.deletedAt !== null
    ) {
      throw new ParentAppChildNotFoundException({
        studentId: link.studentId,
        guardianId: link.guardianId,
        reason: 'linked_child_not_active_or_outside_current_school',
      });
    }
  }

  return links;
}

export function buildParentAppContext(params: {
  baseContext: ParentAppBaseContext;
  guardians: ParentAppGuardianRecord[];
  links: ParentAppStudentGuardianLinkRecord[];
  enrollments: ParentAppEnrollmentRecord[];
}): ParentAppContext {
  const { baseContext, guardians, links, enrollments } = params;
  const guardianIds = guardians.map((guardian) => guardian.id);
  const validLinks = assertParentAppLinkedStudentLinks({
    context: baseContext,
    guardianIds,
    links,
  });

  return {
    ...baseContext,
    guardianIds,
    children: assertParentAppActiveCurrentSchoolChildren({
      context: baseContext,
      links: validLinks,
      enrollments,
    }),
  };
}

export function assertParentAppActiveCurrentSchoolChildren(params: {
  context: ParentAppBaseContext;
  links: ParentAppStudentGuardianLinkRecord[];
  enrollments: ParentAppEnrollmentRecord[];
}): ParentAppAccessibleChild[] {
  const { context, links, enrollments } = params;
  const linkedStudentIds = new Set(links.map((link) => link.studentId));

  if (enrollments.length === 0) {
    throw new ParentAppEnrollmentNotFoundException({
      reason: 'active_current_school_child_enrollment_missing',
    });
  }

  const childrenByStudentId = new Map<string, ParentAppAccessibleChild>();

  for (const enrollment of enrollments) {
    assertEnrollmentBelongsToCurrentSchoolLinkedChild({
      context,
      linkedStudentIds,
      enrollment,
    });

    if (!childrenByStudentId.has(enrollment.studentId)) {
      childrenByStudentId.set(
        enrollment.studentId,
        toParentAppAccessibleChild(enrollment),
      );
    }
  }

  const children = [...childrenByStudentId.values()];
  if (children.length === 0) {
    throw new ParentAppEnrollmentNotFoundException({
      reason: 'active_current_school_child_enrollment_missing',
    });
  }

  return children;
}

export function assertParentAppOwnsChildEnrollmentRecord(params: {
  context: ParentAppContext;
  enrollment: ParentAppEnrollmentRecord | null;
  studentId: string;
}): ParentAppAccessibleChild {
  const { context, enrollment, studentId } = params;

  if (!enrollment || enrollment.studentId !== studentId) {
    throw new ParentAppChildNotFoundException({ studentId });
  }

  assertEnrollmentBelongsToCurrentSchoolLinkedChild({
    context,
    linkedStudentIds: new Set(context.children.map((child) => child.studentId)),
    enrollment,
  });

  return toParentAppAccessibleChild(enrollment);
}

export function assertParentAppOwnsEnrollmentRecord(params: {
  context: ParentAppContext;
  enrollment: ParentAppEnrollmentRecord | null;
  enrollmentId: string;
}): ParentAppAccessibleChild {
  const { context, enrollment, enrollmentId } = params;

  if (!enrollment || enrollment.id !== enrollmentId) {
    throw new ParentAppEnrollmentNotFoundException({ enrollmentId });
  }

  assertEnrollmentBelongsToCurrentSchoolLinkedChild({
    context,
    linkedStudentIds: new Set(context.children.map((child) => child.studentId)),
    enrollment,
  });

  return toParentAppAccessibleChild(enrollment);
}

export function assertParentAppOwnsClassroomEnrollmentRecord(params: {
  context: ParentAppContext;
  enrollment: ParentAppEnrollmentRecord | null;
  classroomId: string;
}): ParentAppAccessibleChild {
  const { context, enrollment, classroomId } = params;

  if (!enrollment || enrollment.classroomId !== classroomId) {
    throw new ParentAppClassroomNotFoundException({ classroomId });
  }

  try {
    assertEnrollmentBelongsToCurrentSchoolLinkedChild({
      context,
      linkedStudentIds: new Set(
        context.children.map((child) => child.studentId),
      ),
      enrollment,
    });
  } catch {
    throw new ParentAppClassroomNotFoundException({ classroomId });
  }

  return toParentAppAccessibleChild(enrollment);
}

function assertEnrollmentBelongsToCurrentSchoolLinkedChild(params: {
  context: ParentAppBaseContext;
  linkedStudentIds: Set<string>;
  enrollment: ParentAppEnrollmentRecord;
}): void {
  const { context, linkedStudentIds, enrollment } = params;

  if (
    !linkedStudentIds.has(enrollment.studentId) ||
    enrollment.schoolId !== context.schoolId ||
    enrollment.status !== StudentEnrollmentStatus.ACTIVE ||
    enrollment.deletedAt !== null ||
    !enrollment.student ||
    enrollment.student.id !== enrollment.studentId ||
    enrollment.student.schoolId !== context.schoolId ||
    enrollment.student.organizationId !== context.organizationId ||
    enrollment.student.status !== StudentStatus.ACTIVE ||
    enrollment.student.deletedAt !== null
  ) {
    throw new ParentAppEnrollmentNotFoundException({
      enrollmentId: enrollment.id,
      studentId: enrollment.studentId,
    });
  }
}

function toParentAppAccessibleChild(
  enrollment: ParentAppEnrollmentRecord,
): ParentAppAccessibleChild {
  return {
    studentId: enrollment.studentId,
    enrollmentId: enrollment.id,
    classroomId: enrollment.classroomId,
    academicYearId: enrollment.academicYearId,
    termId: enrollment.termId,
  };
}

function requireContextValue(
  value: string | null | undefined,
  field: string,
): string {
  if (!value || value.trim().length === 0) {
    throw new ParentAppRequiredParentException({
      reason: 'parent_context_incomplete',
      field,
    });
  }

  return value;
}
