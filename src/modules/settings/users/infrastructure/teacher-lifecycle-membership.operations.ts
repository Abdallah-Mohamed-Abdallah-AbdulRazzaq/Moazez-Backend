import { MembershipStatus, Prisma, UserType, type Role } from '@prisma/client';
import type { TeacherLifecycleMembershipState } from '../../../teachers/lifecycle/application/teacher-lifecycle-unit-of-work';
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
      select: { id: true, key: true, schoolId: true, deletedAt: true },
    },
    user: { select: { userType: true, deletedAt: true } },
  });

export class TeacherLifecycleMembershipInvariantError extends Error {
  constructor(readonly reasonCode: string) {
    super('Teacher lifecycle Membership invariant failed');
    this.name = 'TeacherLifecycleMembershipInvariantError';
  }
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
  input: { membershipId: string; schoolId: string },
): Promise<TeacherLifecycleMembershipState> {
  return updateMembership(transaction, input.membershipId, input.schoolId, {
    status: MembershipStatus.ACTIVE,
    endedAt: null,
  });
}

export function setTeacherLifecycleMembershipSuspended(
  transaction: Prisma.TransactionClient,
  input: { membershipId: string; schoolId: string },
): Promise<TeacherLifecycleMembershipState> {
  return updateMembership(transaction, input.membershipId, input.schoolId, {
    status: MembershipStatus.SUSPENDED,
    endedAt: null,
  });
}

export function setTeacherLifecycleMembershipInactive(
  transaction: Prisma.TransactionClient,
  input: { membershipId: string; schoolId: string; endedAt: Date },
): Promise<TeacherLifecycleMembershipState> {
  return updateMembership(transaction, input.membershipId, input.schoolId, {
    status: MembershipStatus.INACTIVE,
    endedAt: input.endedAt,
  });
}

export function setTeacherLifecycleMembershipTransferred(
  transaction: Prisma.TransactionClient,
  input: { membershipId: string; schoolId: string; endedAt: Date },
): Promise<TeacherLifecycleMembershipState> {
  return updateMembership(transaction, input.membershipId, input.schoolId, {
    status: MembershipStatus.TRANSFERRED,
    endedAt: input.endedAt,
  });
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
): Promise<TeacherLifecycleMembershipState> {
  const result = await transaction.membership.updateMany({
    where: { id: membershipId, schoolId, deletedAt: null },
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
): Promise<Pick<Role, 'id' | 'key' | 'schoolId' | 'deletedAt'> | null> {
  return transaction.role.findUnique({
    where: { id: roleId },
    select: { id: true, key: true, schoolId: true, deletedAt: true },
  });
}

function isExactRole(
  role: Pick<Role, 'key' | 'schoolId' | 'deletedAt'> | null,
  schoolId: string,
): boolean {
  return isExactTeacherRoleForSchool(role, schoolId);
}
