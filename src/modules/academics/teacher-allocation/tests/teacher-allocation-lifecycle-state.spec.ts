import { UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../../common/context/request-context';
import { ScopeMissingException } from '../../../iam/auth/domain/auth.exceptions';
import { TeacherAllocationLifecycleReadService } from '../application/teacher-allocation-lifecycle-read.service';
import {
  classifyTeacherAllocationTermState,
  evaluateTeacherAllocationLifecycleGate,
  summarizeTeacherAllocationLifecycleStates,
  type TeacherAllocationLifecycleTermInput,
} from '../domain/teacher-allocation-lifecycle-state';
import type { TeacherAllocationRepository } from '../infrastructure/teacher-allocation.repository';

const AS_OF = new Date('2028-02-29T12:00:00.000Z');
const SCHOOL_ID = '40000000-0000-4000-8000-000000000001';
const TEACHER_USER_ID = '40000000-0000-4000-8000-000000000002';

function term(
  overrides: Partial<TeacherAllocationLifecycleTermInput> = {},
): TeacherAllocationLifecycleTermInput {
  return {
    startDate: new Date('2028-02-01T00:00:00.000Z'),
    endDate: new Date('2028-03-31T23:59:59.999Z'),
    isActive: true,
    deletedAt: null,
    academicYear: { isActive: true, deletedAt: null },
    ...overrides,
  };
}

function inSchool<T>(schoolId: string, callback: () => T): T {
  const context = createRequestContext('allocation-lifecycle-test');
  context.actor = { id: TEACHER_USER_ID, userType: UserType.SCHOOL_USER };
  context.activeMembership = {
    membershipId: '40000000-0000-4000-8000-000000000003',
    organizationId: '40000000-0000-4000-8000-000000000004',
    schoolId,
    roleId: '40000000-0000-4000-8000-000000000005',
    permissions: [],
  };
  return runWithRequestContext(context, callback);
}

describe('Teacher allocation lifecycle state', () => {
  it('classifies all six date-first states', () => {
    expect(
      classifyTeacherAllocationTermState(
        term({
          startDate: new Date('2028-03-01T00:00:00.000Z'),
          isActive: false,
        }),
        AS_OF,
      ),
    ).toBe('future');
    expect(
      classifyTeacherAllocationTermState(
        term({
          endDate: new Date('2028-02-28T23:59:59.999Z'),
          isActive: false,
        }),
        AS_OF,
      ),
    ).toBe('historical');
    expect(classifyTeacherAllocationTermState(term(), AS_OF)).toBe(
      'current_active',
    );
    expect(
      classifyTeacherAllocationTermState(term({ isActive: false }), AS_OF),
    ).toBe('current_inactive');
    expect(
      classifyTeacherAllocationTermState(
        term({
          startDate: new Date('2028-04-01T00:00:00.000Z'),
          endDate: new Date('2028-03-01T00:00:00.000Z'),
        }),
        AS_OF,
      ),
    ).toBe('inconsistent');
    expect(classifyTeacherAllocationTermState(null, AS_OF)).toBe('invalid');
  });

  it('keeps equality at start and end inside the current window', () => {
    expect(
      classifyTeacherAllocationTermState(
        term({ startDate: AS_OF, endDate: AS_OF }),
        AS_OF,
      ),
    ).toBe('current_active');
  });

  it('handles leap-day boundaries using the fixed as-of instant', () => {
    expect(
      classifyTeacherAllocationTermState(
        term({
          startDate: new Date('2028-02-29T00:00:00.000Z'),
          endDate: new Date('2028-02-29T23:59:59.999Z'),
        }),
        AS_OF,
      ),
    ).toBe('current_active');
  });

  it('marks active future and historical Terms inconsistent', () => {
    expect(
      classifyTeacherAllocationTermState(
        term({ startDate: new Date('2028-03-01T00:00:00.000Z') }),
        AS_OF,
      ),
    ).toBe('inconsistent');
    expect(
      classifyTeacherAllocationTermState(
        term({ endDate: new Date('2028-02-28T23:59:59.999Z') }),
        AS_OF,
      ),
    ).toBe('inconsistent');
  });

  it('marks an active current Term with inactive or deleted AcademicYear inconsistent', () => {
    for (const academicYear of [
      { isActive: false, deletedAt: null },
      { isActive: true, deletedAt: new Date('2028-01-01T00:00:00.000Z') },
    ]) {
      expect(
        classifyTeacherAllocationTermState(term({ academicYear }), AS_OF),
      ).toBe('inconsistent');
    }
  });

  it('marks missing relations, missing dates, and unusable dates invalid', () => {
    expect(
      classifyTeacherAllocationTermState(term({ academicYear: null }), AS_OF),
    ).toBe('invalid');
    expect(
      classifyTeacherAllocationTermState(term({ startDate: null }), AS_OF),
    ).toBe('invalid');
    expect(
      classifyTeacherAllocationTermState(
        term({ endDate: new Date(Number.NaN) }),
        AS_OF,
      ),
    ).toBe('invalid');
  });

  it('keeps historical-only state non-blocking and preserved', () => {
    const summary = summarizeTeacherAllocationLifecycleStates(['historical']);
    expect(
      evaluateTeacherAllocationLifecycleGate(summary, 'role_demotion'),
    ).toEqual({
      blocked: false,
      reassignmentRequired: false,
      reason: 'none',
    });
    expect(
      evaluateTeacherAllocationLifecycleGate(summary, 'profile_archive'),
    ).toMatchObject({ blocked: false });
  });

  it('blocks demotion and archive for current-active or future allocations', () => {
    const summary = summarizeTeacherAllocationLifecycleStates([
      'current_active',
      'future',
    ]);
    expect(summary.blockingCount).toBe(2);
    expect(summary.reassignmentRequired).toBe(true);
    expect(
      evaluateTeacherAllocationLifecycleGate(summary, 'role_demotion'),
    ).toMatchObject({
      blocked: true,
      reason: 'active_or_future_allocations',
    });
    expect(
      evaluateTeacherAllocationLifecycleGate(summary, 'profile_archive'),
    ).toMatchObject({ blocked: true });
  });

  it.each(['current_inactive', 'inconsistent', 'invalid'] as const)(
    'fails closed for %s state',
    (state) => {
      const summary = summarizeTeacherAllocationLifecycleStates([state]);
      expect(summary.integrityRiskCount).toBe(1);
      expect(
        evaluateTeacherAllocationLifecycleGate(summary, 'role_demotion'),
      ).toMatchObject({
        blocked: true,
        reason: 'allocation_integrity_risk',
      });
    },
  );

  it('does not block employment inactivation or termination', () => {
    const summary = summarizeTeacherAllocationLifecycleStates([
      'current_active',
      'future',
      'invalid',
    ]);
    for (const operation of [
      'employment_inactive',
      'employment_terminated',
    ] as const) {
      expect(
        evaluateTeacherAllocationLifecycleGate(summary, operation),
      ).toEqual({
        blocked: false,
        reassignmentRequired: true,
        reason: 'none',
      });
    }
  });

  it('never blocks account disable or Membership suspension', () => {
    const summary = summarizeTeacherAllocationLifecycleStates([
      'current_active',
      'invalid',
    ]);
    for (const operation of [
      'account_disable',
      'membership_suspend',
    ] as const) {
      expect(
        evaluateTeacherAllocationLifecycleGate(summary, operation),
      ).toEqual({
        blocked: false,
        reassignmentRequired: false,
        reason: 'none',
      });
    }
  });

  it('returns aggregate-safe output and delegates only to Academics reads', async () => {
    const repository = {
      listTeacherAllocationLifecycleRecords: jest.fn().mockResolvedValue([
        { id: 'allocation-current', term: term() },
        {
          id: 'allocation-history',
          term: term({
            endDate: new Date('2028-02-28T00:00:00.000Z'),
            isActive: false,
          }),
        },
      ]),
      countAllocationDependencies: jest.fn().mockResolvedValue({
        timetableEntries: 1,
        lessonPlans: 2,
        homeworkAssignments: 3,
      }),
      createAllocation: jest.fn(),
      deleteAllocation: jest.fn(),
      clearSubjectAllocations: jest.fn(),
    } as unknown as TeacherAllocationRepository;
    const service = new TeacherAllocationLifecycleReadService(repository);

    const result = await inSchool(SCHOOL_ID, () =>
      service.classifyTeacherAllocationLifecycleState(
        SCHOOL_ID,
        TEACHER_USER_ID,
        AS_OF,
      ),
    );

    expect(result).toMatchObject({
      currentActiveCount: 1,
      historicalCount: 1,
      blockingCount: 1,
      dependencyCounts: {
        timetableEntries: 1,
        lessonPlans: 2,
        homeworkAssignments: 3,
      },
    });
    expect(repository.countAllocationDependencies).toHaveBeenCalledWith([
      'allocation-current',
    ]);
    const serialized = JSON.stringify(result);
    for (const forbidden of [
      'allocation-current',
      'allocation-history',
      SCHOOL_ID,
      TEACHER_USER_ID,
      'termId',
      'classroomId',
      'subjectId',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(repository.createAllocation).not.toHaveBeenCalled();
    expect(repository.deleteAllocation).not.toHaveBeenCalled();
    expect(repository.clearSubjectAllocations).not.toHaveBeenCalled();
  });

  it('rejects a supplied school outside the current Academics scope', async () => {
    const repository = {
      listTeacherAllocationLifecycleRecords: jest.fn(),
    } as unknown as TeacherAllocationRepository;
    const service = new TeacherAllocationLifecycleReadService(repository);
    await expect(
      inSchool(SCHOOL_ID, () =>
        service.classifyTeacherAllocationLifecycleState(
          '40000000-0000-4000-8000-000000000099',
          TEACHER_USER_ID,
          AS_OF,
        ),
      ),
    ).rejects.toBeInstanceOf(ScopeMissingException);
    expect(
      repository.listTeacherAllocationLifecycleRecords,
    ).not.toHaveBeenCalled();
  });
});
