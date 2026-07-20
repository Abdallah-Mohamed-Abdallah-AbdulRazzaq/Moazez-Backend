import {
  MembershipStatus,
  TeacherEmploymentStatus,
  TeacherGender,
  UserStatus,
  UserType,
} from '@prisma/client';
import type {
  OwnedTransferSource,
  MembershipFootprint,
  ProfileFootprint,
} from '../infrastructure/organization-teacher-transfer-transaction.operations';
import {
  selectDestinationMembership,
  selectDestinationProfile,
  selectExactSourceMembership,
} from '../domain/organization-teacher-transfer-state';
import { TeacherTransferConflictException } from '../domain/organization-teacher-transfer.errors';

const sourceSchoolId = '11111111-1111-4111-8111-111111111111';
const destinationSchoolId = '22222222-2222-4222-8222-222222222222';
const organizationId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';
const sourceProfileId = '55555555-5555-4555-8555-555555555555';
const sourceMembershipId = '66666666-6666-4666-8666-666666666666';
const roleId = '77777777-7777-4777-8777-777777777777';
const now = new Date('2026-07-20T12:00:00.000Z');

function source(
  overrides: {
    employmentStatus?: TeacherEmploymentStatus;
    userStatus?: UserStatus;
    complete?: boolean;
    userType?: UserType;
    userDeletedAt?: Date | null;
  } = {},
): OwnedTransferSource {
  const complete = overrides.complete ?? true;
  return {
    schoolId: sourceSchoolId,
    profile: {
      id: sourceProfileId,
      schoolId: sourceSchoolId,
      userId,
      teacherCode: complete ? 'T001' : null,
      firstNameAr: complete ? 'أحمد' : null,
      lastNameAr: complete ? 'علي' : null,
      firstNameEn: complete ? 'Ahmed' : null,
      lastNameEn: complete ? 'Ali' : null,
      gender: complete ? TeacherGender.MALE : null,
      employmentStatus:
        overrides.employmentStatus ?? TeacherEmploymentStatus.ACTIVE,
      department: null,
      specialization: null,
      employmentType: null,
      experienceYears: null,
      hireDate: null,
      workingDays: [],
      workStartTime: null,
      workEndTime: null,
      notesAr: null,
      notesEn: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
    user: {
      id: userId,
      loginEmail: 'safe@example.invalid',
      username: null,
      contactEmail: null,
      phone: null,
      firstName: 'Ahmed',
      lastName: 'Ali',
      userType: overrides.userType ?? UserType.TEACHER,
      status: overrides.userStatus ?? UserStatus.ACTIVE,
      deletedAt: overrides.userDeletedAt ?? null,
      credential: {
        hasPassword: false,
        status: 'missing',
        mustChangePassword: false,
        passwordProvisionedAt: null,
        passwordChangedAt: null,
        credentialVersion: 0,
      },
    },
  };
}

function membership(
  overrides: Partial<MembershipFootprint> = {},
): MembershipFootprint {
  return {
    id: sourceMembershipId,
    userId,
    organizationId,
    schoolId: sourceSchoolId,
    roleId,
    userType: UserType.TEACHER,
    status: MembershipStatus.ACTIVE,
    startedAt: now,
    endedAt: null,
    deletedAt: null,
    role: {
      id: roleId,
      key: 'teacher',
      schoolId: null,
      deletedAt: null,
    },
    user: { userType: UserType.TEACHER, deletedAt: null },
    ...overrides,
  };
}

function profile(overrides: Partial<ProfileFootprint> = {}): ProfileFootprint {
  return { ...source().profile, ...overrides };
}

describe('Organization Teacher transfer state matrix', () => {
  it.each([
    [
      TeacherEmploymentStatus.ACTIVE,
      UserStatus.ACTIVE,
      MembershipStatus.ACTIVE,
    ],
    [
      TeacherEmploymentStatus.ACTIVE,
      UserStatus.INVITED,
      MembershipStatus.ACTIVE,
    ],
    [
      TeacherEmploymentStatus.INACTIVE,
      UserStatus.INVITED,
      MembershipStatus.ACTIVE,
    ],
    [
      TeacherEmploymentStatus.ACTIVE,
      UserStatus.DISABLED,
      MembershipStatus.ACTIVE,
    ],
    [
      TeacherEmploymentStatus.INACTIVE,
      UserStatus.DISABLED,
      MembershipStatus.ACTIVE,
    ],
    [
      TeacherEmploymentStatus.INACTIVE,
      UserStatus.DISABLED,
      MembershipStatus.SUSPENDED,
    ],
  ])(
    'accepts coherent source tuple %s/%s/%s',
    (employmentStatus, userStatus, membershipStatus) => {
      const selected = selectExactSourceMembership({
        source: source({ employmentStatus, userStatus }),
        organizationId,
        footprints: [membership({ status: membershipStatus })],
      });
      expect(selected.id).toBe(sourceMembershipId);
    },
  );

  it('allows a missing credential', () => {
    const selected = selectExactSourceMembership({
      source: source(),
      organizationId,
      footprints: [membership()],
    });
    expect(selected.id).toBe(sourceMembershipId);
  });

  it('allows an incomplete Profile only in disabled/inactive/suspended state', () => {
    expect(
      selectExactSourceMembership({
        source: source({
          employmentStatus: TeacherEmploymentStatus.INACTIVE,
          userStatus: UserStatus.DISABLED,
          complete: false,
        }),
        organizationId,
        footprints: [membership({ status: MembershipStatus.SUSPENDED })],
      }).id,
    ).toBe(sourceMembershipId);
  });

  it.each([
    [
      'terminated Profile',
      source({ employmentStatus: TeacherEmploymentStatus.TERMINATED }),
      membership(),
      'source_state_conflict',
    ],
    [
      'suspended User',
      source({ userStatus: UserStatus.SUSPENDED }),
      membership(),
      'source_state_conflict',
    ],
    [
      'incomplete active tuple',
      source({ complete: false }),
      membership(),
      'source_state_conflict',
    ],
    [
      'inactive Membership',
      source(),
      membership({ status: MembershipStatus.INACTIVE, endedAt: now }),
      'source_membership_conflict',
    ],
    [
      'transferred Membership',
      source(),
      membership({ status: MembershipStatus.TRANSFERRED, endedAt: now }),
      'source_membership_conflict',
    ],
    [
      'ended Membership',
      source(),
      membership({ endedAt: now }),
      'source_membership_conflict',
    ],
    [
      'wrong Membership type',
      source(),
      membership({ userType: UserType.SCHOOL_USER }),
      'source_membership_conflict',
    ],
    [
      'deleted Role',
      source(),
      membership({ role: { ...membership().role, deletedAt: now } }),
      'source_membership_conflict',
    ],
    [
      'foreign Role',
      source(),
      membership({
        role: { ...membership().role, schoolId: destinationSchoolId },
      }),
      'source_membership_conflict',
    ],
    [
      'wrong User type',
      source({ userType: UserType.SCHOOL_USER }),
      membership(),
      'source_membership_conflict',
    ],
  ])('rejects %s', (_label, sourceState, membershipState, reasonCode) => {
    expect(() =>
      selectExactSourceMembership({
        source: sourceState as OwnedTransferSource,
        organizationId,
        footprints: [membershipState as MembershipFootprint],
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'teachers.lifecycle.transfer_conflict',
        details: { reasonCode },
      }) as TeacherTransferConflictException,
    );
  });

  it('rejects ambiguous source Membership candidates', () => {
    expect(() =>
      selectExactSourceMembership({
        source: source(),
        organizationId,
        footprints: [membership(), membership({ id: roleId })],
      }),
    ).toThrow(TeacherTransferConflictException);
  });

  it('rejects a competing operational Membership', () => {
    expect(() =>
      selectExactSourceMembership({
        source: source(),
        organizationId,
        footprints: [
          membership(),
          membership({ id: roleId, schoolId: destinationSchoolId }),
        ],
      }),
    ).toThrow(TeacherTransferConflictException);
  });

  it('selects no destination Profile for a new School employment', () => {
    expect(
      selectDestinationProfile({
        sourceProfileId,
        destinationSchoolId,
        footprints: [profile()],
      }),
    ).toBeNull();
  });

  it('selects the exact archived destination Profile for restoration', () => {
    const archived = profile({
      id: roleId,
      schoolId: destinationSchoolId,
      deletedAt: now,
    });
    expect(
      selectDestinationProfile({
        sourceProfileId,
        destinationSchoolId,
        footprints: [profile(), archived],
      }),
    ).toBe(archived);
  });

  it.each([
    [null, 'destination_live_profile_exists'],
    [now, 'destination_profile_history_ambiguous'],
  ])(
    'rejects conflicting destination Profile history',
    (deletedAt, reasonCode) => {
      const destination = profile({
        id: roleId,
        schoolId: destinationSchoolId,
        deletedAt,
      });
      const footprints = deletedAt
        ? [
            profile(),
            destination,
            profile({
              id: organizationId,
              schoolId: destinationSchoolId,
              deletedAt: now,
            }),
          ]
        : [profile(), destination];
      expect(() =>
        selectDestinationProfile({
          sourceProfileId,
          destinationSchoolId,
          footprints,
        }),
      ).toThrow(
        expect.objectContaining({
          details: { reasonCode },
        }) as TeacherTransferConflictException,
      );
    },
  );

  it('selects a restorable destination Membership', () => {
    const historical = membership({
      id: roleId,
      schoolId: destinationSchoolId,
      status: MembershipStatus.TRANSFERRED,
      endedAt: now,
    });
    expect(
      selectDestinationMembership({
        sourceMembershipId,
        destinationSchoolId,
        footprints: [membership(), historical],
      }),
    ).toBe(historical);
  });

  it.each([
    ['deleted', { ...membership().role, deletedAt: now }],
    ['foreign-School', { ...membership().role, schoolId: sourceSchoolId }],
  ])(
    'rejects a destination Membership with a %s Teacher Role',
    (_label, role) => {
      expect(() =>
        selectDestinationMembership({
          sourceMembershipId,
          destinationSchoolId,
          footprints: [
            membership(),
            membership({
              id: roleId,
              schoolId: destinationSchoolId,
              status: MembershipStatus.TRANSFERRED,
              endedAt: now,
              role,
            }),
          ],
        }),
      ).toThrow(
        expect.objectContaining({
          details: { reasonCode: 'destination_membership_conflict' },
        }) as TeacherTransferConflictException,
      );
    },
  );

  it('ignores deleted destination Membership history and creates anew', () => {
    expect(
      selectDestinationMembership({
        sourceMembershipId,
        destinationSchoolId,
        footprints: [
          membership(),
          membership({ schoolId: destinationSchoolId, deletedAt: now }),
        ],
      }),
    ).toBeNull();
  });

  it.each([
    [MembershipStatus.ACTIVE, 'destination_membership_conflict'],
    [MembershipStatus.SUSPENDED, 'destination_membership_history_ambiguous'],
  ])(
    'rejects conflicting destination Membership state',
    (status, reasonCode) => {
      const destination = membership({
        id: roleId,
        schoolId: destinationSchoolId,
        status,
        endedAt: status === MembershipStatus.ACTIVE ? null : now,
      });
      const footprints =
        status === MembershipStatus.SUSPENDED
          ? [
              membership(),
              destination,
              membership({
                id: organizationId,
                schoolId: destinationSchoolId,
                status,
                endedAt: now,
              }),
            ]
          : [membership(), destination];
      expect(() =>
        selectDestinationMembership({
          sourceMembershipId,
          destinationSchoolId,
          footprints,
        }),
      ).toThrow(
        expect.objectContaining({
          details: { reasonCode },
        }) as TeacherTransferConflictException,
      );
    },
  );
});
