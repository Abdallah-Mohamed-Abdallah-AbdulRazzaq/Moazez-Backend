import { Injectable } from '@nestjs/common';
import { MembershipStatus, Prisma, UserType } from '@prisma/client';
import type { TrustedOrganizationScope } from '../../../../common/context/request-context';
import type {
  TeacherLifecycleMembershipState,
  TeacherLifecycleProfileState,
  TeacherLifecycleRoleState,
  TeacherLifecycleUserState,
} from '../../../teachers/lifecycle/application/teacher-lifecycle-unit-of-work';
import { findTeacherLifecycleUserState } from '../../../settings/users/infrastructure/teacher-lifecycle-user.operations';

const PROFILE_SELECT = Prisma.validator<Prisma.TeacherProfileSelect>()({
  id: true,
  schoolId: true,
  userId: true,
  teacherCode: true,
  firstNameAr: true,
  lastNameAr: true,
  firstNameEn: true,
  lastNameEn: true,
  gender: true,
  employmentStatus: true,
  department: true,
  specialization: true,
  employmentType: true,
  experienceYears: true,
  hireDate: true,
  workingDays: true,
  workStartTime: true,
  workEndTime: true,
  notesAr: true,
  notesEn: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

const MEMBERSHIP_SELECT = Prisma.validator<Prisma.MembershipSelect>()({
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

export interface OwnedTransferSource {
  schoolId: string;
  profile: TeacherLifecycleProfileState;
  user: TeacherLifecycleUserState;
}

export interface OwnedTransferDestination {
  schoolId: string;
}

export interface OwnedTransferResources {
  source: OwnedTransferSource;
  destination: OwnedTransferDestination;
}

export type SourceMembershipFootprint = TeacherLifecycleMembershipState;
export type ProfileFootprint = TeacherLifecycleProfileState;
export type MembershipFootprint = TeacherLifecycleMembershipState;

export interface OrganizationTeacherTransferTransactionOperations {
  revalidateActorScope(scope: TrustedOrganizationScope): Promise<boolean>;
  resolveAndLockOwnedResources(input: {
    scope: TrustedOrganizationScope;
    sourceTeacherProfileId: string;
    destinationSchoolId: string;
  }): Promise<OwnedTransferResources | null>;
  listAndLockSourceMembershipFootprints(input: {
    source: OwnedTransferSource;
  }): Promise<SourceMembershipFootprint[]>;
  listAndLockProfileFootprints(input: {
    source: OwnedTransferSource;
    destination: OwnedTransferDestination;
  }): Promise<ProfileFootprint[]>;
  listAndLockMembershipFootprints(input: {
    source: OwnedTransferSource;
    destination: OwnedTransferDestination;
  }): Promise<MembershipFootprint[]>;
  resolveDestinationTeacherRole(
    destination: OwnedTransferDestination,
  ): Promise<TeacherLifecycleRoleState | null>;
  isDestinationTeacherCodeAvailable(input: {
    destination: OwnedTransferDestination;
    teacherCode: string;
    destinationProfileId?: string;
  }): Promise<boolean>;
  createDestinationMembership(input: {
    sourceUserId: string;
    organizationId: string;
    destinationSchoolId: string;
    destinationRoleId: string;
  }): Promise<TeacherLifecycleMembershipState>;
  restoreDestinationMembership(input: {
    membershipId: string;
    sourceUserId: string;
    organizationId: string;
    destinationSchoolId: string;
    destinationRoleId: string;
    expectedStatus: MembershipStatus;
    expectedEndedAt: Date | null;
  }): Promise<TeacherLifecycleMembershipState>;
}

@Injectable()
export class PrismaOrganizationTeacherTransferTransactionOperations {
  bind(
    transaction: Prisma.TransactionClient,
  ): OrganizationTeacherTransferTransactionOperations {
    const operations: OrganizationTeacherTransferTransactionOperations = {
      revalidateActorScope: (scope) =>
        this.revalidateActorScope(transaction, scope),
      resolveAndLockOwnedResources: (input) =>
        this.resolveAndLockOwnedResources(transaction, input),
      listAndLockSourceMembershipFootprints: (input) =>
        this.listAndLockSourceMembershipFootprints(transaction, input),
      listAndLockProfileFootprints: (input) =>
        this.listAndLockProfileFootprints(transaction, input),
      listAndLockMembershipFootprints: (input) =>
        this.listAndLockMembershipFootprints(transaction, input),
      resolveDestinationTeacherRole: (destination) =>
        this.resolveDestinationTeacherRole(transaction, destination),
      isDestinationTeacherCodeAvailable: (input) =>
        this.isDestinationTeacherCodeAvailable(transaction, input),
      createDestinationMembership: (input) =>
        this.createDestinationMembership(transaction, input),
      restoreDestinationMembership: (input) =>
        this.restoreDestinationMembership(transaction, input),
    };
    return Object.freeze(operations);
  }

  private async revalidateActorScope(
    transaction: Prisma.TransactionClient,
    scope: TrustedOrganizationScope,
  ): Promise<boolean> {
    const memberships = await transaction.$queryRaw<
      Array<{ membershipId: string; organizationId: string; roleId: string }>
    >(Prisma.sql`
      SELECT
        m.id AS "membershipId",
        m.organization_id AS "organizationId",
        m.role_id AS "roleId"
      FROM users u
      INNER JOIN memberships m ON m.user_id = u.id
      INNER JOIN organizations o ON o.id = m.organization_id
      INNER JOIN roles r ON r.id = m.role_id
      INNER JOIN role_permissions rp ON rp.role_id = r.id
      INNER JOIN permissions p ON p.id = rp.permission_id
      WHERE u.id = ${scope.actorId}::uuid
        AND u.user_type = 'ORGANIZATION_USER'::user_type
        AND u.status = 'ACTIVE'::user_status
        AND u.deleted_at IS NULL
        AND m.user_type = 'ORGANIZATION_USER'::user_type
        AND m.status = 'ACTIVE'::membership_status
        AND m.ended_at IS NULL
        AND m.deleted_at IS NULL
        AND m.school_id IS NULL
        AND m.organization_id = ${scope.organizationId}::uuid
        AND o.status = 'ACTIVE'::organization_status
        AND o.deleted_at IS NULL
        AND r.key = 'organization_admin'
        AND r.is_system = TRUE
        AND r.school_id IS NULL
        AND r.deleted_at IS NULL
        AND p.code = 'teachers.records.manage'
      ORDER BY m.id ASC
      LIMIT 2
      FOR UPDATE OF u, m, o, r, rp, p
    `);
    return (
      memberships.length === 1 &&
      memberships[0].membershipId === scope.membershipId &&
      memberships[0].organizationId === scope.organizationId &&
      memberships[0].roleId === scope.roleId
    );
  }

  private async resolveAndLockOwnedResources(
    transaction: Prisma.TransactionClient,
    input: {
      scope: TrustedOrganizationScope;
      sourceTeacherProfileId: string;
      destinationSchoolId: string;
    },
  ): Promise<OwnedTransferResources | null> {
    const [sourceLocks, destinationLocks] = await Promise.all([
      transaction.$queryRaw<
        Array<{ profileId: string; schoolId: string; userId: string }>
      >(Prisma.sql`
        SELECT tp.id AS "profileId", tp.school_id AS "schoolId", tp.user_id AS "userId"
        FROM teacher_profiles tp
        INNER JOIN schools s ON s.id = tp.school_id
        INNER JOIN users u ON u.id = tp.user_id
        WHERE tp.id = ${input.sourceTeacherProfileId}::uuid
          AND tp.deleted_at IS NULL
          AND s.organization_id = ${input.scope.organizationId}::uuid
          AND s.status = 'ACTIVE'::school_status
          AND s.deleted_at IS NULL
        FOR UPDATE OF tp, s, u
      `),
      transaction.$queryRaw<Array<{ schoolId: string }>>(Prisma.sql`
        SELECT s.id AS "schoolId"
        FROM schools s
        WHERE s.id = ${input.destinationSchoolId}::uuid
          AND s.organization_id = ${input.scope.organizationId}::uuid
          AND s.status = 'ACTIVE'::school_status
          AND s.deleted_at IS NULL
        FOR UPDATE OF s
      `),
    ]);

    const sourceLock = sourceLocks[0];
    const destinationLock = destinationLocks[0];
    if (!sourceLock || !destinationLock) return null;

    const [profile, user] = await Promise.all([
      transaction.teacherProfile.findFirst({
        where: {
          id: sourceLock.profileId,
          schoolId: sourceLock.schoolId,
          userId: sourceLock.userId,
          deletedAt: null,
        },
        select: PROFILE_SELECT,
      }),
      findTeacherLifecycleUserState(transaction, sourceLock.userId),
    ]);
    if (!profile || !user) return null;
    return Object.freeze({
      source: Object.freeze({
        schoolId: sourceLock.schoolId,
        profile,
        user,
      }),
      destination: Object.freeze({ schoolId: destinationLock.schoolId }),
    });
  }

  private async listAndLockSourceMembershipFootprints(
    transaction: Prisma.TransactionClient,
    input: { source: OwnedTransferSource },
  ): Promise<SourceMembershipFootprint[]> {
    await transaction.$queryRaw(Prisma.sql`
      SELECT m.id
      FROM memberships m
      INNER JOIN roles r ON r.id = m.role_id
      WHERE m.user_id = ${input.source.user.id}::uuid
        AND (
          m.school_id = ${input.source.schoolId}::uuid
          OR (m.status = 'ACTIVE'::membership_status AND m.ended_at IS NULL AND m.deleted_at IS NULL)
        )
      ORDER BY m.started_at ASC, m.id ASC
      FOR UPDATE OF m, r
    `);
    return transaction.membership.findMany({
      where: {
        userId: input.source.user.id,
        OR: [
          { schoolId: input.source.schoolId },
          {
            status: MembershipStatus.ACTIVE,
            endedAt: null,
            deletedAt: null,
          },
        ],
      },
      orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
      select: MEMBERSHIP_SELECT,
    });
  }

  private async listAndLockProfileFootprints(
    transaction: Prisma.TransactionClient,
    input: {
      source: OwnedTransferSource;
      destination: OwnedTransferDestination;
    },
  ): Promise<ProfileFootprint[]> {
    await transaction.$queryRaw(Prisma.sql`
      SELECT tp.id
      FROM teacher_profiles tp
      WHERE tp.user_id = ${input.source.user.id}::uuid
      ORDER BY tp.id ASC
      FOR UPDATE OF tp
    `);
    return transaction.teacherProfile.findMany({
      where: { userId: input.source.user.id },
      orderBy: { id: 'asc' },
      select: PROFILE_SELECT,
    });
  }

  private async listAndLockMembershipFootprints(
    transaction: Prisma.TransactionClient,
    input: {
      source: OwnedTransferSource;
      destination: OwnedTransferDestination;
    },
  ): Promise<MembershipFootprint[]> {
    await transaction.$queryRaw(Prisma.sql`
      SELECT m.id
      FROM memberships m
      INNER JOIN roles r ON r.id = m.role_id
      WHERE m.user_id = ${input.source.user.id}::uuid
        AND (
          m.school_id IN (${input.source.schoolId}::uuid, ${input.destination.schoolId}::uuid)
          OR (m.status = 'ACTIVE'::membership_status AND m.ended_at IS NULL AND m.deleted_at IS NULL)
        )
      ORDER BY m.started_at ASC, m.id ASC
      FOR UPDATE OF m, r
    `);
    return transaction.membership.findMany({
      where: {
        userId: input.source.user.id,
        OR: [
          {
            schoolId: {
              in: [input.source.schoolId, input.destination.schoolId],
            },
          },
          {
            status: MembershipStatus.ACTIVE,
            endedAt: null,
            deletedAt: null,
          },
        ],
      },
      orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
      select: MEMBERSHIP_SELECT,
    });
  }

  private async resolveDestinationTeacherRole(
    transaction: Prisma.TransactionClient,
    destination: OwnedTransferDestination,
  ): Promise<TeacherLifecycleRoleState | null> {
    const select = {
      id: true,
      key: true,
      schoolId: true,
      deletedAt: true,
    } as const;
    const schoolRoles = await transaction.role.findMany({
      where: {
        schoolId: destination.schoolId,
        key: 'teacher',
        deletedAt: null,
      },
      orderBy: { id: 'asc' },
      take: 2,
      select,
    });
    if (schoolRoles.length !== 0) {
      if (schoolRoles.length !== 1) return null;
      return this.lockDestinationRole(transaction, destination, schoolRoles[0]);
    }
    const globalRoles = await transaction.role.findMany({
      where: {
        schoolId: null,
        key: 'teacher',
        isSystem: true,
        deletedAt: null,
      },
      orderBy: { id: 'asc' },
      take: 2,
      select,
    });
    if (globalRoles.length !== 1) return null;
    return this.lockDestinationRole(transaction, destination, globalRoles[0]);
  }

  private async lockDestinationRole(
    transaction: Prisma.TransactionClient,
    destination: OwnedTransferDestination,
    role: TeacherLifecycleRoleState,
  ): Promise<TeacherLifecycleRoleState | null> {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT r.id
      FROM roles r
      WHERE r.id = ${role.id}::uuid
        AND r.key = 'teacher'
        AND r.deleted_at IS NULL
        AND (
          r.school_id = ${destination.schoolId}::uuid
          OR (r.school_id IS NULL AND r.is_system = TRUE)
        )
      FOR UPDATE OF r
    `);
    return rows.length === 1 ? role : null;
  }

  private async isDestinationTeacherCodeAvailable(
    transaction: Prisma.TransactionClient,
    input: {
      destination: OwnedTransferDestination;
      teacherCode: string;
      destinationProfileId?: string;
    },
  ): Promise<boolean> {
    const conflict = await transaction.teacherProfile.findFirst({
      where: {
        schoolId: input.destination.schoolId,
        teacherCode: input.teacherCode,
        ...(input.destinationProfileId
          ? { id: { not: input.destinationProfileId } }
          : {}),
      },
      select: { id: true },
    });
    return conflict === null;
  }

  private createDestinationMembership(
    transaction: Prisma.TransactionClient,
    input: {
      sourceUserId: string;
      organizationId: string;
      destinationSchoolId: string;
      destinationRoleId: string;
    },
  ): Promise<TeacherLifecycleMembershipState> {
    return transaction.membership.create({
      data: {
        userId: input.sourceUserId,
        organizationId: input.organizationId,
        schoolId: input.destinationSchoolId,
        roleId: input.destinationRoleId,
        userType: UserType.TEACHER,
        status: MembershipStatus.SUSPENDED,
        endedAt: null,
      },
      select: MEMBERSHIP_SELECT,
    });
  }

  private async restoreDestinationMembership(
    transaction: Prisma.TransactionClient,
    input: {
      membershipId: string;
      sourceUserId: string;
      organizationId: string;
      destinationSchoolId: string;
      destinationRoleId: string;
      expectedStatus: MembershipStatus;
      expectedEndedAt: Date | null;
    },
  ): Promise<TeacherLifecycleMembershipState> {
    const result = await transaction.membership.updateMany({
      where: {
        id: input.membershipId,
        userId: input.sourceUserId,
        schoolId: input.destinationSchoolId,
        organizationId: input.organizationId,
        status: input.expectedStatus,
        endedAt: input.expectedEndedAt,
        deletedAt: null,
      },
      data: {
        roleId: input.destinationRoleId,
        userType: UserType.TEACHER,
        status: MembershipStatus.SUSPENDED,
        endedAt: null,
      },
    });
    if (result.count !== 1) {
      throw new OrganizationTeacherTransferInvariantError(
        'destination_membership_state_moved',
      );
    }
    return transaction.membership.findFirstOrThrow({
      where: {
        id: input.membershipId,
        userId: input.sourceUserId,
        schoolId: input.destinationSchoolId,
        deletedAt: null,
      },
      select: MEMBERSHIP_SELECT,
    });
  }
}

export class OrganizationTeacherTransferInvariantError extends Error {
  constructor(readonly reasonCode: string) {
    super('Organization Teacher transfer invariant failed');
    this.name = 'OrganizationTeacherTransferInvariantError';
  }
}
