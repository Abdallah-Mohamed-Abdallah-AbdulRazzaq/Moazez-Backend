import { UserType } from '@prisma/client';
import type { RequestContext } from '../../../common/context/request-context';
import type { TeacherAppContext } from '../shared/teacher-app-context';
import {
  TeacherAppAllocationForbiddenException,
  TeacherAppAllocationNotFoundException,
  TeacherAppRequiredTeacherException,
} from '../shared/teacher-app.errors';
import type {
  TeacherAppAllocationRecord,
  TeacherAppClassId,
} from '../shared/teacher-app.types';

export const TEACHER_APP_CLASS_ID_BACKING_MODEL =
  'TeacherSubjectAllocation.id' as const;

export const TEACHER_APP_SCHEDULE_ID_GUARDRAIL = {
  durableScheduleIdAvailable: false,
  reason:
    'Schedule APIs are deferred until timetable, period, and schedule occurrence models exist.',
} as const;

export function buildTeacherAppContextFromRequestContext(
  context: RequestContext | undefined,
): TeacherAppContext {
  const actor = context?.actor;
  const activeMembership = context?.activeMembership;

  if (!actor) {
    throw new TeacherAppRequiredTeacherException({ reason: 'actor_missing' });
  }

  if (actor.userType !== UserType.TEACHER) {
    throw new TeacherAppRequiredTeacherException({
      reason: 'actor_not_teacher',
      userType: actor.userType,
    });
  }

  if (!activeMembership) {
    throw new TeacherAppRequiredTeacherException({
      reason: 'active_membership_missing',
    });
  }

  return {
    teacherUserId: requireContextValue(actor.id, 'teacherUserId'),
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

export function toTeacherAppClassId(
  allocation: Pick<TeacherAppAllocationRecord, 'id'>,
): TeacherAppClassId {
  return allocation.id;
}

export function assertTeacherOwnsAllocationRecord(params: {
  context: TeacherAppContext;
  allocation: TeacherAppAllocationRecord | null;
  classId?: TeacherAppClassId;
}): asserts params is {
  context: TeacherAppContext;
  allocation: TeacherAppAllocationRecord;
  classId?: TeacherAppClassId;
} {
  const { context, allocation, classId } = params;

  if (!allocation) {
    throw new TeacherAppAllocationNotFoundException({ classId });
  }

  if (classId && allocation.id !== classId) {
    throw new TeacherAppAllocationNotFoundException({ classId });
  }

  if (allocation.schoolId !== context.schoolId) {
    throw new TeacherAppAllocationNotFoundException({ classId: allocation.id });
  }

  if (allocation.teacherUserId !== context.teacherUserId) {
    throw new TeacherAppAllocationForbiddenException({
      classId: allocation.id,
    });
  }

  assertAllocationRelationsArePresent(allocation);
}

function assertAllocationRelationsArePresent(
  allocation: TeacherAppAllocationRecord,
): void {
  const relationChecks = [
    {
      relation: 'subject',
      actualId: allocation.subject?.id,
      expectedId: allocation.subjectId,
      schoolId: allocation.subject?.schoolId,
    },
    {
      relation: 'classroom',
      actualId: allocation.classroom?.id,
      expectedId: allocation.classroomId,
      schoolId: allocation.classroom?.schoolId,
    },
    {
      relation: 'term',
      actualId: allocation.term?.id,
      expectedId: allocation.termId,
      schoolId: allocation.term?.schoolId,
    },
  ];

  for (const check of relationChecks) {
    if (
      check.actualId !== check.expectedId ||
      check.schoolId !== allocation.schoolId
    ) {
      throw new TeacherAppAllocationNotFoundException({
        classId: allocation.id,
        relation: check.relation,
      });
    }
  }

  const section = allocation.classroom?.section;
  const grade = section?.grade;
  const stage = grade?.stage;

  if (
    section?.schoolId !== allocation.schoolId ||
    grade?.schoolId !== allocation.schoolId ||
    stage?.schoolId !== allocation.schoolId
  ) {
    throw new TeacherAppAllocationNotFoundException({
      classId: allocation.id,
      relation: 'classroom_structure',
    });
  }
}

function requireContextValue(
  value: string | null | undefined,
  field: string,
): string {
  if (!value || value.trim().length === 0) {
    throw new TeacherAppRequiredTeacherException({
      reason: 'teacher_context_incomplete',
      field,
    });
  }

  return value;
}
