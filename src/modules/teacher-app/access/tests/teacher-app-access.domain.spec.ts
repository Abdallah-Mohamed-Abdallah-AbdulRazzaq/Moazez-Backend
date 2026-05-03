import { UserType } from '@prisma/client';
import type { RequestContext } from '../../../../common/context/request-context';
import type { TeacherAppContext } from '../../shared/teacher-app-context';
import {
  TeacherAppAllocationForbiddenException,
  TeacherAppAllocationNotFoundException,
  TeacherAppRequiredTeacherException,
} from '../../shared/teacher-app.errors';
import type { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';
import {
  assertTeacherOwnsAllocationRecord,
  buildTeacherAppContextFromRequestContext,
  TEACHER_APP_CLASS_ID_BACKING_MODEL,
  TEACHER_APP_SCHEDULE_ID_GUARDRAIL,
  toTeacherAppClassId,
} from '../teacher-app-access.domain';

const TEACHER_ID = 'teacher-1';
const SCHOOL_ID = 'school-1';
const ORGANIZATION_ID = 'org-1';

describe('Teacher App access domain', () => {
  it('builds a compact teacher context from RequestContext', () => {
    const result = buildTeacherAppContextFromRequestContext(
      requestContextFixture(),
    );

    expect(result).toEqual({
      teacherUserId: TEACHER_ID,
      schoolId: SCHOOL_ID,
      organizationId: ORGANIZATION_ID,
      membershipId: 'membership-1',
      roleId: 'role-1',
      permissions: ['teacher.classes.view'],
    });
  });

  it('rejects actors that are not active teachers', () => {
    expect(() =>
      buildTeacherAppContextFromRequestContext(
        requestContextFixture({ userType: UserType.SCHOOL_USER }),
      ),
    ).toThrow(TeacherAppRequiredTeacherException);

    expect(() =>
      buildTeacherAppContextFromRequestContext(
        requestContextFixture({ activeMembership: undefined }),
      ),
    ).toThrow(TeacherAppRequiredTeacherException);
  });

  it('treats TeacherSubjectAllocation.id as the Teacher App classId', () => {
    const allocation = allocationFixture({ id: 'allocation-class-1' });

    expect(TEACHER_APP_CLASS_ID_BACKING_MODEL).toBe(
      'TeacherSubjectAllocation.id',
    );
    expect(toTeacherAppClassId(allocation)).toBe('allocation-class-1');
  });

  it('keeps scheduleId deferred until timetable models exist', () => {
    expect(TEACHER_APP_SCHEDULE_ID_GUARDRAIL).toEqual({
      durableScheduleIdAvailable: false,
      reason:
        'Schedule APIs are deferred until timetable, period, and schedule occurrence models exist.',
    });
    expect(TEACHER_APP_SCHEDULE_ID_GUARDRAIL).not.toHaveProperty(
      'scheduleId',
    );
  });

  it('accepts an allocation owned by the current teacher in the active school', () => {
    expect(() =>
      assertTeacherOwnsAllocationRecord({
        context: teacherContextFixture(),
        allocation: allocationFixture(),
        classId: 'allocation-1',
      }),
    ).not.toThrow();
  });

  it('rejects another teacher allocation in the same school', () => {
    expect(() =>
      assertTeacherOwnsAllocationRecord({
        context: teacherContextFixture(),
        allocation: allocationFixture({ teacherUserId: 'teacher-2' }),
        classId: 'allocation-1',
      }),
    ).toThrow(TeacherAppAllocationForbiddenException);
  });

  it('hides cross-school allocations as not found', () => {
    expect(() =>
      assertTeacherOwnsAllocationRecord({
        context: teacherContextFixture(),
        allocation: allocationFixture({ schoolId: 'school-2' }),
        classId: 'allocation-1',
      }),
    ).toThrow(TeacherAppAllocationNotFoundException);
  });

  it('requires allocation classroom, subject, term, and structure links', () => {
    expect(() =>
      assertTeacherOwnsAllocationRecord({
        context: teacherContextFixture(),
        allocation: allocationFixture({ subject: null }),
        classId: 'allocation-1',
      }),
    ).toThrow(TeacherAppAllocationNotFoundException);
  });
});

function requestContextFixture(
  overrides?: Partial<{
    userType: UserType;
    activeMembership: RequestContext['activeMembership'];
  }>,
): RequestContext {
  return {
    requestId: 'request-1',
    actor: {
      id: TEACHER_ID,
      userType: overrides?.userType ?? UserType.TEACHER,
    },
    activeMembership:
      overrides && 'activeMembership' in overrides
        ? overrides.activeMembership
        : {
            membershipId: 'membership-1',
            schoolId: SCHOOL_ID,
            organizationId: ORGANIZATION_ID,
            roleId: 'role-1',
            permissions: ['teacher.classes.view'],
          },
    bypass: { bypassSchoolScope: false, includeSoftDeleted: false },
  };
}

function teacherContextFixture(): TeacherAppContext {
  return {
    teacherUserId: TEACHER_ID,
    schoolId: SCHOOL_ID,
    organizationId: ORGANIZATION_ID,
    membershipId: 'membership-1',
    roleId: 'role-1',
    permissions: ['teacher.classes.view'],
  };
}

function allocationFixture(
  overrides?: Partial<TeacherAppAllocationRecord>,
): TeacherAppAllocationRecord {
  const schoolId = overrides?.schoolId ?? SCHOOL_ID;

  return {
    id: 'allocation-1',
    schoolId,
    teacherUserId: TEACHER_ID,
    subjectId: 'subject-1',
    classroomId: 'classroom-1',
    termId: 'term-1',
    subject: {
      id: 'subject-1',
      schoolId,
      nameAr: 'Math AR',
      nameEn: 'Math',
      code: 'MATH',
    },
    classroom: {
      id: 'classroom-1',
      schoolId,
      sectionId: 'section-1',
      roomId: null,
      nameAr: 'Classroom AR',
      nameEn: 'Classroom',
      room: null,
      section: {
        id: 'section-1',
        schoolId,
        gradeId: 'grade-1',
        nameAr: 'Section AR',
        nameEn: 'Section',
        grade: {
          id: 'grade-1',
          schoolId,
          stageId: 'stage-1',
          nameAr: 'Grade AR',
          nameEn: 'Grade',
          stage: {
            id: 'stage-1',
            schoolId,
            nameAr: 'Stage AR',
            nameEn: 'Stage',
          },
        },
      },
    },
    term: {
      id: 'term-1',
      schoolId,
      academicYearId: 'year-1',
      nameAr: 'Term AR',
      nameEn: 'Term',
      isActive: true,
    },
    ...overrides,
  };
}
