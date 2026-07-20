import { MembershipStatus, Prisma, UserType, type Role } from '@prisma/client';
import type {
  TeacherLifecycleMembershipState,
  TeacherLifecycleRoleState,
} from '../../../teachers/lifecycle/application/teacher-lifecycle-unit-of-work';
import { isExactTeacherRoleForSchool } from '../../../teachers/lifecycle/domain/teacher-membership-state';

const TEACHER_LIFECYCLE_MEMBERSHIP_SELECT =
  Prisma.validator<Prisma.MembershipSelect>()({
    id: true,
    userId: true,
    organizationId: true,
    schoolId: true,
    roleId: true,
    userType: true,
    status: true,
    startedAt: true,
    endedAt: true,
    deletedAt: true,
    role: {
      select: {
        id: true,
        key: true,
        name: true,
        schoolId: true,
        deletedAt: true,
      },
    },
    user: { select: { userType: true, deletedAt: true } },
  });

export class TeacherLifecycleMembershipInvariantError extends Error {
  constructor(readonly reasonCode: string) {
    super('Teacher lifecycle Membership invariant failed');
    this.name = 'TeacherLifecycleMembershipInvariantError';
  }
}

export async function resolveExactTeacherLifecycleRole(
  transaction: Prisma.TransactionClient,
  schoolId: string,
): Promise<TeacherLifecycleRoleState | null> {
  const select = {
    id: true,
    key: true,
    schoolId: true,
    deletedAt: true,
  } as const;
  const schoolRoles = await transaction.role.findMany({
    where: { key: 'teacher', schoolId, deletedAt: null },
    orderBy: { id: 'asc' },
    take: 2,
    select,
  });
  if (schoolRoles.length > 1) {
    throw new TeacherLifecycleMembershipInvariantError(
      'ambiguous_teacher_role',
    );
  }
  if (schoolRoles[0]) return schoolRoles[0];

  const globalRoles = await transaction.role.findMany({
    where: {
      key: 'teacher',
      schoolId: null,
      isSystem: true,
      deletedAt: null,
    },
    orderBy: { id: 'asc' },
    take: 2,
    select,
  });
  if (globalRoles.length !== 1) {
    if (globalRoles.length > 1) {
      throw new TeacherLifecycleMembershipInvariantError(
        'ambiguous_teacher_role',
      );
    }
    return null;
  }
  return globalRoles[0];
}

export function findTeacherLifecycleCurrentSchoolMembership(
  transaction: Prisma.TransactionClient,
  input: { schoolId: string; userId: string },
): Promise<TeacherLifecycleMembershipState | null> {
  return transaction.membership.findFirst({
    where: {
      schoolId: input.schoolId,
      userId: input.userId,
      deletedAt: null,
    },
    orderBy: [{ startedAt: 'desc' }, { id: 'asc' }],
    select: TEACHER_LIFECYCLE_MEMBERSHIP_SELECT,
  });
}

export function listTeacherLifecycleMembershipFootprints(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<TeacherLifecycleMembershipState[]> {
  return transaction.membership.findMany({
    where: {
      userId,
      OR: [{ userType: UserType.TEACHER }, { role: { key: 'teacher' } }],
    },
    orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
    select: TEACHER_LIFECYCLE_MEMBERSHIP_SELECT,
  });
}

export function listTeacherLifecycleOperationalMembershipFootprints(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<TeacherLifecycleMembershipState[]> {
  return transaction.membership.findMany({
    where: {
      userId,
      status: MembershipStatus.ACTIVE,
      endedAt: null,
      deletedAt: null,
    },
    orderBy: { id: 'asc' },
    select: TEACHER_LIFECYCLE_MEMBERSHIP_SELECT,
  });
}

export function listTeacherLifecycleCurrentSchoolHistory(
  transaction: Prisma.TransactionClient,
  input: { schoolId: string; userId: string },
): Promise<TeacherLifecycleMembershipState[]> {
  return transaction.membership.findMany({
    where: { schoolId: input.schoolId, userId: input.userId },
    orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
    select: TEACHER_LIFECYCLE_MEMBERSHIP_SELECT,
  });
}

export async function resolveAssignableNonTeacherLifecycleRole(
  transaction: Prisma.TransactionClient,
  input: { schoolId: string; roleId: string },
): Promise<TeacherLifecycleRoleState | null> {
  const role = await transaction.role.findFirst({
    where: {
      id: input.roleId,
      key: { not: 'teacher' },
      deletedAt: null,
      OR: [
        { schoolId: input.schoolId },
        {
          schoolId: null,
          isSystem: true,
          key: {
            in: ['school_admin', 'parent', 'student', 'dismissal_staff'],
          },
        },
      ],
    },
    select: {
      id: true,
      key: true,
      name: true,
      schoolId: true,
      deletedAt: true,
    },
  });
  return role;
}

export async function createExactTeacherLifecycleMembership(
  transaction: Prisma.TransactionClient,
  input: {
    userId: string;
    organizationId: string;
    schoolId: string;
    roleId: string;
    status: 'ACTIVE' | 'SUSPENDED';
  },
): Promise<TeacherLifecycleMembershipState> {
  const [user, role, existingSchoolFootprint, operationalFootprint] =
    await Promise.all([
      transaction.user.findUnique({
        where: { id: input.userId },
        select: { userType: true, deletedAt: true },
      }),
      findRole(transaction, input.roleId),
      transaction.membership.findFirst({
        where: {
          userId: input.userId,
          schoolId: input.schoolId,
          deletedAt: null,
        },
        select: { id: true },
      }),
      transaction.membership.findFirst({
        where: {
          userId: input.userId,
          userType: UserType.TEACHER,
          status: MembershipStatus.ACTIVE,
          endedAt: null,
          deletedAt: null,
        },
        select: { id: true },
      }),
    ]);

  if (
    user?.userType !== UserType.TEACHER ||
    user.deletedAt !== null ||
    !isExactRole(role, input.schoolId)
  ) {
    throw new TeacherLifecycleMembershipInvariantError(
      'exact_teacher_identity_required',
    );
  }
  if (existingSchoolFootprint || operationalFootprint) {
    throw new TeacherLifecycleMembershipInvariantError(
      'teacher_membership_conflict',
    );
  }

  return transaction.membership.create({
    data: {
      userId: input.userId,
      organizationId: input.organizationId,
      schoolId: input.schoolId,
      roleId: input.roleId,
      userType: UserType.TEACHER,
      status: input.status,
      endedAt: null,
    },
    select: TEACHER_LIFECYCLE_MEMBERSHIP_SELECT,
  });
}

export async function createExactTeacherLifecycleMembershipForRehire(
  transaction: Prisma.TransactionClient,
  input: {
    userId: string;
    organizationId: string;
    schoolId: string;
    roleId: string;
  },
): Promise<TeacherLifecycleMembershipState> {
  const [user, role, activeMembership, teacherHistory] = await Promise.all([
    transaction.user.findUnique({
      where: { id: input.userId },
      select: { userType: true, deletedAt: true },
    }),
    findRole(transaction, input.roleId),
    transaction.membership.findFirst({
      where: {
        userId: input.userId,
        status: MembershipStatus.ACTIVE,
        endedAt: null,
        deletedAt: null,
      },
      select: { id: true },
    }),
    transaction.membership.findFirst({
      where: {
        userId: input.userId,
        schoolId: input.schoolId,
        OR: [{ userType: UserType.TEACHER }, { role: { key: 'teacher' } }],
      },
      select: { id: true },
    }),
  ]);
  if (!user || user.deletedAt !== null || !isExactRole(role, input.schoolId)) {
    throw new TeacherLifecycleMembershipInvariantError(
      'exact_teacher_identity_required',
    );
  }
  if (activeMembership || teacherHistory) {
    throw new TeacherLifecycleMembershipInvariantError(
      'teacher_membership_conflict',
    );
  }
  return transaction.membership.create({
    data: {
      userId: input.userId,
      organizationId: input.organizationId,
      schoolId: input.schoolId,
      roleId: input.roleId,
      userType: UserType.TEACHER,
      status: MembershipStatus.SUSPENDED,
      endedAt: null,
    },
    select: TEACHER_LIFECYCLE_MEMBERSHIP_SELECT,
  });
}

export async function restoreExactTeacherLifecycleMembership(
  transaction: Prisma.TransactionClient,
  input: {
    membershipId: string;
    userId: string;
    schoolId: string;
    roleId: string;
    expectedStatus: MembershipStatus;
    expectedEndedAt: Date | null;
  },
): Promise<TeacherLifecycleMembershipState> {
  const [user, role, operationalConflict] = await Promise.all([
    transaction.user.findUnique({
      where: { id: input.userId },
      select: { deletedAt: true },
    }),
    findRole(transaction, input.roleId),
    transaction.membership.findFirst({
      where: {
        userId: input.userId,
        id: { not: input.membershipId },
        status: MembershipStatus.ACTIVE,
        endedAt: null,
        deletedAt: null,
      },
      select: { id: true },
    }),
  ]);
  if (!user || user.deletedAt !== null || !isExactRole(role, input.schoolId)) {
    throw new TeacherLifecycleMembershipInvariantError(
      'exact_teacher_role_required',
    );
  }
  if (operationalConflict) {
    throw new TeacherLifecycleMembershipInvariantError(
      'operational_membership_conflict',
    );
  }
  return updateMembership(
    transaction,
    input.membershipId,
    input.schoolId,
    {
      roleId: input.roleId,
      userType: UserType.TEACHER,
      status: MembershipStatus.SUSPENDED,
      endedAt: null,
    },
    input,
    { userId: input.userId },
  );
}

export async function createReviewedNonTeacherLifecycleMembership(
  transaction: Prisma.TransactionClient,
  input: {
    userId: string;
    organizationId: string;
    schoolId: string;
    roleId: string;
    userType: UserType;
  },
): Promise<TeacherLifecycleMembershipState> {
  const role = await resolveAssignableNonTeacherLifecycleRole(transaction, {
    schoolId: input.schoolId,
    roleId: input.roleId,
  });
  if (!role || input.userType === UserType.TEACHER) {
    throw new TeacherLifecycleMembershipInvariantError(
      'assignable_non_teacher_role_required',
    );
  }
  const activeMembership = await transaction.membership.findFirst({
    where: {
      userId: input.userId,
      status: MembershipStatus.ACTIVE,
      endedAt: null,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (activeMembership) {
    throw new TeacherLifecycleMembershipInvariantError(
      'operational_membership_conflict',
    );
  }
  return transaction.membership.create({
    data: {
      userId: input.userId,
      organizationId: input.organizationId,
      schoolId: input.schoolId,
      roleId: input.roleId,
      userType: input.userType,
      status: MembershipStatus.ACTIVE,
      endedAt: null,
    },
    select: TEACHER_LIFECYCLE_MEMBERSHIP_SELECT,
  });
}

export async function restoreReviewedNonTeacherLifecycleMembership(
  transaction: Prisma.TransactionClient,
  input: {
    membershipId: string;
    userId: string;
    schoolId: string;
    roleId: string;
    userType: UserType;
    expectedStatus: MembershipStatus;
    expectedEndedAt: Date | null;
  },
): Promise<TeacherLifecycleMembershipState> {
  const role = await resolveAssignableNonTeacherLifecycleRole(transaction, {
    schoolId: input.schoolId,
    roleId: input.roleId,
  });
  if (!role || input.userType === UserType.TEACHER) {
    throw new TeacherLifecycleMembershipInvariantError(
      'assignable_non_teacher_role_required',
    );
  }
  return updateMembership(
    transaction,
    input.membershipId,
    input.schoolId,
    {
      roleId: input.roleId,
      userType: input.userType,
      status: MembershipStatus.ACTIVE,
      endedAt: null,
      deletedAt: null,
    },
    input,
    { userId: input.userId },
  );
}

export async function setTeacherLifecycleMembershipRoleAndType(
  transaction: Prisma.TransactionClient,
  input: {
    membershipId: string;
    schoolId: string;
    roleId: string;
    userType: UserType;
  },
): Promise<TeacherLifecycleMembershipState> {
  const role = await findRole(transaction, input.roleId);
  if (
    input.userType === UserType.TEACHER &&
    !isExactRole(role, input.schoolId)
  ) {
    throw new TeacherLifecycleMembershipInvariantError(
      'exact_teacher_role_required',
    );
  }
  return updateMembership(transaction, input.membershipId, input.schoolId, {
    roleId: input.roleId,
    userType: input.userType,
  });
}

export function setTeacherLifecycleMembershipActive(
  transaction: Prisma.TransactionClient,
  input: {
    membershipId: string;
    schoolId: string;
    expectedStatus: MembershipStatus;
    expectedEndedAt: Date | null;
  },
): Promise<TeacherLifecycleMembershipState> {
  return updateMembership(
    transaction,
    input.membershipId,
    input.schoolId,
    {
      status: MembershipStatus.ACTIVE,
      endedAt: null,
    },
    input,
  );
}

export function setTeacherLifecycleMembershipSuspended(
  transaction: Prisma.TransactionClient,
  input: {
    membershipId: string;
    schoolId: string;
    expectedStatus: MembershipStatus;
    expectedEndedAt: Date | null;
  },
): Promise<TeacherLifecycleMembershipState> {
  return updateMembership(
    transaction,
    input.membershipId,
    input.schoolId,
    {
      status: MembershipStatus.SUSPENDED,
      endedAt: null,
    },
    input,
  );
}

export function setTeacherLifecycleMembershipInactive(
  transaction: Prisma.TransactionClient,
  input: {
    membershipId: string;
    schoolId: string;
    expectedStatus: MembershipStatus;
    expectedEndedAt: Date | null;
    endedAt: Date;
  },
): Promise<TeacherLifecycleMembershipState> {
  return updateMembership(
    transaction,
    input.membershipId,
    input.schoolId,
    {
      status: MembershipStatus.INACTIVE,
      endedAt: input.endedAt,
    },
    input,
  );
}

export function setTeacherLifecycleMembershipTransferred(
  transaction: Prisma.TransactionClient,
  input: {
    membershipId: string;
    schoolId: string;
    expectedStatus: MembershipStatus;
    expectedEndedAt: Date | null;
    endedAt: Date;
  },
): Promise<TeacherLifecycleMembershipState> {
  return updateMembership(
    transaction,
    input.membershipId,
    input.schoolId,
    {
      status: MembershipStatus.TRANSFERRED,
      endedAt: input.endedAt,
    },
    input,
  );
}

export function softDeleteTeacherLifecycleMembership(
  transaction: Prisma.TransactionClient,
  input: {
    membershipId: string;
    schoolId: string;
    endedAt: Date;
    deletedAt: Date;
  },
): Promise<TeacherLifecycleMembershipState> {
  return updateMembership(transaction, input.membershipId, input.schoolId, {
    status: MembershipStatus.INACTIVE,
    endedAt: input.endedAt,
    deletedAt: input.deletedAt,
  });
}

async function updateMembership(
  transaction: Prisma.TransactionClient,
  membershipId: string,
  schoolId: string,
  data: Prisma.MembershipUncheckedUpdateManyInput,
  expected?: {
    expectedStatus: MembershipStatus;
    expectedEndedAt: Date | null;
  },
  additionalWhere: Prisma.MembershipWhereInput = {},
): Promise<TeacherLifecycleMembershipState> {
  const result = await transaction.membership.updateMany({
    where: {
      id: membershipId,
      schoolId,
      deletedAt: null,
      ...(expected
        ? {
            status: expected.expectedStatus,
            endedAt: expected.expectedEndedAt,
          }
        : {}),
      ...additionalWhere,
    },
    data,
  });
  if (result.count !== 1) {
    throw new TeacherLifecycleMembershipInvariantError(
      'membership_not_found_or_not_writable',
    );
  }
  return transaction.membership.findFirstOrThrow({
    where: { id: membershipId, schoolId },
    select: TEACHER_LIFECYCLE_MEMBERSHIP_SELECT,
  });
}

function findRole(
  transaction: Prisma.TransactionClient,
  roleId: string,
): Promise<Pick<
  Role,
  'id' | 'key' | 'name' | 'schoolId' | 'deletedAt'
> | null> {
  return transaction.role.findUnique({
    where: { id: roleId },
    select: {
      id: true,
      key: true,
      name: true,
      schoolId: true,
      deletedAt: true,
    },
  });
}

function isExactRole(
  role: Pick<Role, 'key' | 'schoolId' | 'deletedAt'> | null,
  schoolId: string,
): boolean {
  return isExactTeacherRoleForSchool(role, schoolId);
}
