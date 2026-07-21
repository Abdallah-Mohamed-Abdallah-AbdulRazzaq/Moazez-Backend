import {
  MembershipStatus,
  TeacherEmploymentStatus,
  TeacherGender,
  UserStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setOrganizationScope,
} from '../../../../common/context/request-context';
import type {
  TeacherLifecycleMembershipState,
  TeacherLifecycleProfileState,
  TeacherLifecycleTransactionContext,
  TeacherLifecycleUserState,
  TeacherLifecycleUnitOfWork,
} from '../../../teachers/lifecycle/application/teacher-lifecycle-unit-of-work';
import { summarizeTeacherAllocationLifecycleStates } from '../../../academics/teacher-allocation/domain/teacher-allocation-lifecycle-state';
import type { TransferTeacherToSchoolDto } from '../dto/transfer-teacher-to-school.dto';
import { TransferTeacherBetweenSchoolsCoordinator } from '../application/transfer-teacher-between-schools.coordinator';

const actorId = '11111111-1111-4111-8111-111111111111';
const actorMembershipId = '22222222-2222-4222-8222-222222222222';
const organizationId = '33333333-3333-4333-8333-333333333333';
const actorRoleId = '44444444-4444-4444-8444-444444444444';
const sourceSchoolId = '55555555-5555-4555-8555-555555555555';
const destinationSchoolId = '66666666-6666-4666-8666-666666666666';
const userId = '77777777-7777-4777-8777-777777777777';
const sourceProfileId = '88888888-8888-4888-8888-888888888888';
const destinationProfileId = '99999999-9999-4999-8999-999999999999';
const sourceMembershipId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const destinationMembershipId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const teacherRoleId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const fixed = new Date('2026-07-20T12:00:00.000Z');

function user(
  overrides: Partial<TeacherLifecycleUserState> = {},
): TeacherLifecycleUserState {
  return {
    id: userId,
    loginEmail: 'safe@example.invalid',
    username: null,
    contactEmail: null,
    phone: null,
    firstName: 'Ahmed',
    lastName: 'Ali',
    userType: UserType.TEACHER,
    status: UserStatus.ACTIVE,
    deletedAt: null,
    createdAt: fixed,
    updatedAt: fixed,
    credential: {
      hasPassword: false,
      status: 'missing',
      mustChangePassword: false,
      passwordProvisionedAt: null,
      passwordChangedAt: null,
      credentialVersion: 0,
    },
    ...overrides,
  };
}

function profile(
  overrides: Partial<TeacherLifecycleProfileState> = {},
): TeacherLifecycleProfileState {
  return {
    id: sourceProfileId,
    schoolId: sourceSchoolId,
    userId,
    teacherCode: 'OLD',
    firstNameAr: 'قديم',
    lastNameAr: 'مصدر',
    firstNameEn: 'Old',
    lastNameEn: 'Source',
    gender: TeacherGender.MALE,
    employmentStatus: TeacherEmploymentStatus.ACTIVE,
    department: 'Source Department',
    specialization: 'Source Specialization',
    employmentType: null,
    experienceYears: null,
    hireDate: null,
    workingDays: [],
    workStartTime: null,
    workEndTime: null,
    notesAr: 'source note',
    notesEn: 'source note',
    createdAt: fixed,
    updatedAt: fixed,
    deletedAt: null,
    ...overrides,
  };
}

function membership(
  overrides: Partial<TeacherLifecycleMembershipState> = {},
): TeacherLifecycleMembershipState {
  return {
    id: sourceMembershipId,
    userId,
    organizationId,
    schoolId: sourceSchoolId,
    roleId: teacherRoleId,
    userType: UserType.TEACHER,
    status: MembershipStatus.ACTIVE,
    startedAt: fixed,
    endedAt: null,
    deletedAt: null,
    role: {
      id: teacherRoleId,
      key: 'teacher',
      schoolId: null,
      deletedAt: null,
    },
    user: { userType: UserType.TEACHER, deletedAt: null },
    ...overrides,
  };
}

function command(
  overrides: Partial<TransferTeacherToSchoolDto> = {},
): TransferTeacherToSchoolDto {
  return {
    destinationSchoolId,
    teacherCode: ' dst 001 ',
    firstNameAr: ' جديد ',
    lastNameAr: ' معلم ',
    firstNameEn: ' New ',
    lastNameEn: ' Teacher ',
    preferredDisplayLanguage: 'EN',
    gender: TeacherGender.MALE,
    ...overrides,
  };
}

function buildContext(
  options: {
    destinationProfile?: TeacherLifecycleProfileState | null;
    destinationMembership?: TeacherLifecycleMembershipState | null;
    allocationStates?: Parameters<
      typeof summarizeTeacherAllocationLifecycleStates
    >[0];
  } = {},
) {
  const sourceUser = user();
  const sourceProfile = profile();
  const sourceMembership = membership();
  const destinationProfile = profile({
    id: destinationProfileId,
    schoolId: destinationSchoolId,
    deletedAt: fixed,
  });
  const destinationMembership = membership({
    id: destinationMembershipId,
    schoolId: destinationSchoolId,
    status: MembershipStatus.TRANSFERRED,
    endedAt: fixed,
  });
  const createdProfile = profile({
    id: destinationProfileId,
    schoolId: destinationSchoolId,
    teacherCode: 'DST001',
    firstNameAr: 'جديد',
    lastNameAr: 'معلم',
    firstNameEn: 'New',
    lastNameEn: 'Teacher',
    department: null,
    specialization: null,
    notesAr: null,
    notesEn: null,
    employmentStatus: TeacherEmploymentStatus.INACTIVE,
  });
  const suspendedMembership = membership({
    id: destinationMembershipId,
    schoolId: destinationSchoolId,
    status: MembershipStatus.SUSPENDED,
    endedAt: null,
  });
  const disabledUser = user({
    status: UserStatus.DISABLED,
    firstName: 'New',
    lastName: 'Teacher',
  });
  const selectedDestinationProfile =
    options.destinationProfile === undefined
      ? null
      : options.destinationProfile;
  const selectedDestinationMembership =
    options.destinationMembership === undefined
      ? null
      : options.destinationMembership;
  const organizationTransfer = {
    revalidateActorScope: jest.fn().mockResolvedValue(true),
    resolveAndLockOwnedResources: jest.fn().mockResolvedValue({
      source: {
        schoolId: sourceSchoolId,
        profile: sourceProfile,
        user: sourceUser,
      },
      destination: { schoolId: destinationSchoolId },
    }),
    listAndLockSourceMembershipFootprints: jest
      .fn()
      .mockResolvedValue([sourceMembership]),
    listAndLockProfileFootprints: jest
      .fn()
      .mockResolvedValue(
        selectedDestinationProfile
          ? [sourceProfile, selectedDestinationProfile]
          : [sourceProfile],
      ),
    listAndLockMembershipFootprints: jest
      .fn()
      .mockResolvedValue(
        selectedDestinationMembership
          ? [sourceMembership, selectedDestinationMembership]
          : [sourceMembership],
      ),
    resolveDestinationTeacherRole: jest.fn().mockResolvedValue({
      id: teacherRoleId,
      key: 'teacher',
      schoolId: null,
      deletedAt: null,
    }),
    isDestinationTeacherCodeAvailable: jest.fn().mockResolvedValue(true),
    createDestinationMembership: jest
      .fn()
      .mockResolvedValue(suspendedMembership),
    restoreDestinationMembership: jest
      .fn()
      .mockResolvedValue(suspendedMembership),
  };
  const context = {
    organizationTransfer,
    allocation: {
      classify: jest
        .fn()
        .mockResolvedValue(
          summarizeTeacherAllocationLifecycleStates(
            options.allocationStates ?? [],
          ),
        ),
    },
    membership: {
      setTransferred: jest.fn().mockResolvedValue(
        membership({
          status: MembershipStatus.TRANSFERRED,
          endedAt: fixed,
        }),
      ),
    },
    profile: {
      archive: jest.fn().mockResolvedValue(profile({ deletedAt: fixed })),
      create: jest.fn().mockResolvedValue(createdProfile),
      restore: jest.fn().mockResolvedValue(createdProfile),
    },
    user: {
      updateDisplayNames: jest.fn().mockResolvedValue(disabledUser),
      setStatus: jest.fn().mockResolvedValue(disabledUser),
    },
    sessions: { revokeUserSessions: jest.fn().mockResolvedValue(2) },
    audit: { writeSuccessful: jest.fn().mockResolvedValue(undefined) },
  } as unknown as TeacherLifecycleTransactionContext;
  return {
    context,
    organizationTransfer,
    sourceProfile,
    destinationProfile,
    destinationMembership,
  };
}

async function executeWithScope(
  coordinator: TransferTeacherBetweenSchoolsCoordinator,
  input = command(),
) {
  return runWithRequestContext(createRequestContext('trace'), () => {
    setOrganizationScope({
      actorId,
      membershipId: actorMembershipId,
      organizationId,
      roleId: actorRoleId,
    });
    return coordinator.execute(sourceProfileId, input);
  });
}

function coordinatorFor(context: TeacherLifecycleTransactionContext) {
  const unitOfWork = {
    execute: jest.fn((callback) => callback(context)),
  } as unknown as TeacherLifecycleUnitOfWork;
  return {
    coordinator: new TransferTeacherBetweenSchoolsCoordinator(unitOfWork),
    unitOfWork,
  };
}

describe('TransferTeacherBetweenSchoolsCoordinator', () => {
  it('creates a complete disabled/suspended/inactive destination aggregate', async () => {
    const fixture = buildContext();
    const { coordinator, unitOfWork } = coordinatorFor(fixture.context);
    const result = await executeWithScope(coordinator);

    expect(unitOfWork.execute).toHaveBeenCalledTimes(1);
    expect(result.teacher).toEqual(
      expect.objectContaining({
        id: destinationProfileId,
        userId,
        teacherCode: 'DST001',
        accountStatus: UserStatus.DISABLED,
        membershipStatus: MembershipStatus.SUSPENDED,
        membershipEndedAt: null,
        employmentStatus: TeacherEmploymentStatus.INACTIVE,
      }),
    );
    expect(result.transfer).toEqual(
      expect.objectContaining({
        sourceArchived: true,
        revokedSessionCount: 2,
        reassignmentRequired: false,
        integrityReviewRequired: false,
      }),
    );
    expect(fixture.context.membership.setTransferred).toHaveBeenCalledWith(
      expect.objectContaining({
        membershipId: sourceMembershipId,
        expectedStatus: MembershipStatus.ACTIVE,
        expectedEndedAt: null,
      }),
    );
    expect(fixture.context.profile.archive).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: sourceSchoolId,
        profileId: sourceProfileId,
      }),
    );
  });

  it('restores exact archived destination Profile and Membership', async () => {
    const destinationProfile = profile({
      id: destinationProfileId,
      schoolId: destinationSchoolId,
      deletedAt: fixed,
    });
    const destinationMembership = membership({
      id: destinationMembershipId,
      schoolId: destinationSchoolId,
      status: MembershipStatus.TRANSFERRED,
      endedAt: fixed,
    });
    const fixture = buildContext({ destinationProfile, destinationMembership });
    const { coordinator } = coordinatorFor(fixture.context);
    await expect(executeWithScope(coordinator)).resolves.toBeDefined();
    expect(fixture.context.profile.restore).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: destinationProfileId }),
    );
    expect(
      fixture.organizationTransfer.restoreDestinationMembership,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ membershipId: destinationMembershipId }),
    );
    expect(fixture.context.profile.create).not.toHaveBeenCalled();
  });

  it('does not copy omitted source-owned destination fields', async () => {
    const fixture = buildContext();
    const { coordinator } = coordinatorFor(fixture.context);
    await executeWithScope(coordinator);
    expect(fixture.context.profile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: expect.objectContaining({
          department: null,
          specialization: null,
          workingDays: [],
          notesAr: null,
          notesEn: null,
        }),
      }),
    );
  });

  it('uses only the five approved successful audit actions', async () => {
    const fixture = buildContext();
    const { coordinator } = coordinatorFor(fixture.context);
    await executeWithScope(coordinator);
    expect(fixture.context.audit.writeSuccessful).toHaveBeenCalledTimes(5);
    expect(
      (fixture.context.audit.writeSuccessful as jest.Mock).mock.calls.map(
        ([entry]) => entry.action,
      ),
    ).toEqual([
      'teachers.profile.archive',
      'teachers.membership.transfer',
      'teachers.profile.create',
      'teachers.membership.transfer',
      'teachers.account.transfer',
    ]);
  });

  it.each([
    [
      'actor scope moved',
      (fixture: ReturnType<typeof buildContext>) =>
        fixture.organizationTransfer.revalidateActorScope.mockResolvedValue(
          false,
        ),
      'actor_scope_moved',
    ],
    [
      'same School',
      (fixture: ReturnType<typeof buildContext>) =>
        fixture.organizationTransfer.resolveAndLockOwnedResources.mockResolvedValue(
          {
            source: {
              schoolId: sourceSchoolId,
              profile: fixture.sourceProfile,
              user: user(),
            },
            destination: { schoolId: sourceSchoolId },
          },
        ),
      'same_school_transfer',
    ],
    [
      'missing destination Role',
      (fixture: ReturnType<typeof buildContext>) =>
        fixture.organizationTransfer.resolveDestinationTeacherRole.mockResolvedValue(
          null,
        ),
      'destination_teacher_role_required',
    ],
  ])('fails closed when %s', async (_label, mutate, reasonCode) => {
    const fixture = buildContext();
    mutate(fixture);
    const { coordinator } = coordinatorFor(fixture.context);
    await expect(executeWithScope(coordinator)).rejects.toEqual(
      expect.objectContaining({
        details: expect.objectContaining({ reasonCode }),
      }),
    );
    expect(fixture.context.sessions.revokeUserSessions).not.toHaveBeenCalled();
  });

  it('returns the same safe 404 for an unavailable owned-resource aggregate', async () => {
    const fixture = buildContext();
    fixture.organizationTransfer.resolveAndLockOwnedResources.mockResolvedValue(
      null,
    );
    const { coordinator } = coordinatorFor(fixture.context);
    await expect(executeWithScope(coordinator)).rejects.toEqual(
      expect.objectContaining({
        code: 'teachers.lifecycle.transfer_not_found',
        details: undefined,
      }),
    );
  });

  it('maps a destination teacher-code precheck without exposing the value', async () => {
    const fixture = buildContext();
    fixture.organizationTransfer.isDestinationTeacherCodeAvailable.mockResolvedValue(
      false,
    );
    const { coordinator } = coordinatorFor(fixture.context);
    await expect(executeWithScope(coordinator)).rejects.toEqual(
      expect.objectContaining({
        code: 'teachers.profile.code_conflict',
        details: { field: 'teacherCode' },
      }),
    );
  });

  it('maps Session revocation failure and prevents success audits', async () => {
    const fixture = buildContext();
    (
      fixture.context.sessions.revokeUserSessions as jest.Mock
    ).mockRejectedValue(new Error('redacted'));
    const { coordinator } = coordinatorFor(fixture.context);
    await expect(executeWithScope(coordinator)).rejects.toEqual(
      expect.objectContaining({
        code: 'teachers.lifecycle.revocation_failed',
        details: { retryable: true, reasonCode: 'revocation_failed' },
      }),
    );
    expect(fixture.context.audit.writeSuccessful).not.toHaveBeenCalled();
  });

  it('surfaces allocation reassignment and integrity review aggregates only', async () => {
    const fixture = buildContext({
      allocationStates: ['current_active', 'future', 'historical', 'invalid'],
    });
    const { coordinator } = coordinatorFor(fixture.context);
    const result = await executeWithScope(coordinator);
    expect(result.transfer).toEqual(
      expect.objectContaining({
        reassignmentRequired: true,
        integrityReviewRequired: true,
        allocationSummary: expect.objectContaining({
          currentActiveCount: 1,
          futureCount: 1,
          historicalCount: 1,
          invalidCount: 1,
        }),
      }),
    );
    expect(JSON.stringify(result.transfer)).not.toMatch(
      /allocationId|termId|subjectId|classroomId|schoolId/iu,
    );
  });

  it.each([
    [
      'source Membership update',
      (fixture: ReturnType<typeof buildContext>) =>
        (
          fixture.context.membership.setTransferred as jest.Mock
        ).mockRejectedValue(new Error('write failed')),
    ],
    [
      'source Profile archive',
      (fixture: ReturnType<typeof buildContext>) =>
        (fixture.context.profile.archive as jest.Mock).mockRejectedValue(
          new Error('write failed'),
        ),
    ],
    [
      'destination Profile create',
      (fixture: ReturnType<typeof buildContext>) =>
        (fixture.context.profile.create as jest.Mock).mockRejectedValue(
          new Error('write failed'),
        ),
    ],
    [
      'destination Membership create',
      (fixture: ReturnType<typeof buildContext>) =>
        fixture.organizationTransfer.createDestinationMembership.mockRejectedValue(
          new Error('write failed'),
        ),
    ],
    [
      'User display update',
      (fixture: ReturnType<typeof buildContext>) =>
        (
          fixture.context.user.updateDisplayNames as jest.Mock
        ).mockRejectedValue(new Error('write failed')),
    ],
    [
      'User disable',
      (fixture: ReturnType<typeof buildContext>) =>
        (fixture.context.user.setStatus as jest.Mock).mockRejectedValue(
          new Error('write failed'),
        ),
    ],
    [
      'successful audit',
      (fixture: ReturnType<typeof buildContext>) =>
        (fixture.context.audit.writeSuccessful as jest.Mock).mockRejectedValue(
          new Error('audit failed'),
        ),
    ],
  ])('does not return success after %s failure', async (_label, mutate) => {
    const fixture = buildContext();
    mutate(fixture);
    const { coordinator } = coordinatorFor(fixture.context);
    await expect(executeWithScope(coordinator)).rejects.toBeDefined();
  });

  it.each([1, 2, 3, 4, 5])(
    'rolls back when successful audit position %i fails',
    async (failedPosition) => {
      const fixture = buildContext();
      let calls = 0;
      (fixture.context.audit.writeSuccessful as jest.Mock).mockImplementation(
        () => {
          calls += 1;
          return calls === failedPosition
            ? Promise.reject(new Error('audit failed'))
            : Promise.resolve();
        },
      );
      const { coordinator } = coordinatorFor(fixture.context);
      await expect(executeWithScope(coordinator)).rejects.toBeDefined();
      expect(calls).toBe(failedPosition);
    },
  );

  it('maps serialization conflict to the stable concurrency reason', async () => {
    const unitOfWork = {
      execute: jest.fn().mockRejectedValue({ code: 'P2034' }),
    } as unknown as TeacherLifecycleUnitOfWork;
    const coordinator = new TransferTeacherBetweenSchoolsCoordinator(
      unitOfWork,
    );
    await expect(executeWithScope(coordinator)).rejects.toEqual(
      expect.objectContaining({
        code: 'teachers.lifecycle.transfer_conflict',
        details: { reasonCode: 'transfer_concurrency_conflict' },
      }),
    );
  });

  it('maps raw-query PostgreSQL serialization failure without exposing database metadata', async () => {
    const unitOfWork = {
      execute: jest.fn().mockRejectedValue({
        code: 'P2010',
        meta: { code: '40001', message: 'not exposed' },
      }),
    } as unknown as TeacherLifecycleUnitOfWork;
    const coordinator = new TransferTeacherBetweenSchoolsCoordinator(
      unitOfWork,
    );

    await expect(executeWithScope(coordinator)).rejects.toEqual(
      expect.objectContaining({
        code: 'teachers.lifecycle.transfer_conflict',
        details: { reasonCode: 'transfer_concurrency_conflict' },
      }),
    );
  });

  it('maps a concurrent destination uniqueness conflict to the stable concurrency reason', async () => {
    const unitOfWork = {
      execute: jest.fn().mockRejectedValue({
        code: 'P2002',
        meta: { target: ['school_id', 'user_id'] },
      }),
    } as unknown as TeacherLifecycleUnitOfWork;
    const coordinator = new TransferTeacherBetweenSchoolsCoordinator(
      unitOfWork,
    );

    await expect(executeWithScope(coordinator)).rejects.toEqual(
      expect.objectContaining({
        code: 'teachers.lifecycle.transfer_conflict',
        details: { reasonCode: 'transfer_concurrency_conflict' },
      }),
    );
  });

  it('returns no tenant, Membership, Role, Session, or allocation ids', async () => {
    const fixture = buildContext();
    const { coordinator } = coordinatorFor(fixture.context);
    const result = await executeWithScope(coordinator);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(organizationId);
    expect(serialized).not.toContain(sourceSchoolId);
    expect(serialized).not.toContain(destinationSchoolId);
    expect(serialized).not.toContain(sourceMembershipId);
    expect(serialized).not.toContain(teacherRoleId);
    expect(serialized).not.toMatch(/passwordHash|sessionId|allocationId/iu);
  });
});
