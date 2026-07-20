import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  MembershipStatus,
  OrganizationStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  getRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../context/request-context';
import { ORGANIZATION_MANAGEMENT_ONLY_METADATA } from '../decorators/organization-management-only.decorator';
import { PUBLIC_ROUTE_METADATA } from '../decorators/public-route.decorator';
import { ScopeMissingException } from '../../modules/iam/auth/domain/auth.exceptions';
import type { AuthRepository } from '../../modules/iam/auth/infrastructure/auth.repository';
import { OrganizationScopeGuard } from './organization-scope.guard';

const actorId = '11111111-1111-4111-8111-111111111111';
const membershipId = '22222222-2222-4222-8222-222222222222';
const organizationId = '33333333-3333-4333-8333-333333333333';
const roleId = '44444444-4444-4444-8444-444444444444';

function projection() {
  return {
    id: actorId,
    userType: UserType.ORGANIZATION_USER,
    status: UserStatus.ACTIVE,
    deletedAt: null,
    memberships: [
      {
        id: membershipId,
        userId: actorId,
        organizationId,
        schoolId: null,
        roleId,
        userType: UserType.ORGANIZATION_USER,
        status: MembershipStatus.ACTIVE,
        endedAt: null,
        deletedAt: null,
        organization: {
          status: OrganizationStatus.ACTIVE,
          deletedAt: null,
        },
        role: {
          key: 'organization_admin',
          isSystem: true,
          schoolId: null,
          deletedAt: null,
          rolePermissions: [
            { permission: { code: 'teachers.records.manage' } },
          ],
        },
      },
    ],
  };
}

function executionContext(): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class TestController {},
  } as unknown as ExecutionContext;
}

function buildGuard(repositoryResult: unknown = projection()) {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) => {
      if (key === PUBLIC_ROUTE_METADATA) return false;
      if (key === ORGANIZATION_MANAGEMENT_ONLY_METADATA) return true;
      return undefined;
    }),
  } as unknown as Reflector;
  const authRepository = {
    findOrganizationManagementScope: jest
      .fn()
      .mockResolvedValue(repositoryResult),
  } as unknown as AuthRepository;
  return {
    guard: new OrganizationScopeGuard(reflector, authRepository),
    authRepository,
  };
}

async function withActor(
  userType: UserType,
  callback: () => Promise<unknown>,
  active = {
    membershipId,
    organizationId,
    schoolId: null,
    roleId,
    permissions: ['teachers.records.manage'],
  },
) {
  return runWithRequestContext(createRequestContext('trace'), async () => {
    setActor({ id: actorId, userType });
    setActiveMembership(active);
    return callback();
  });
}

describe('OrganizationScopeGuard', () => {
  it('establishes the exact immutable Organization scope', async () => {
    const { guard, authRepository } = buildGuard();
    await withActor(UserType.ORGANIZATION_USER, async () => {
      await expect(guard.canActivate(executionContext())).resolves.toBe(true);
      expect(getRequestContext()?.organizationScope).toEqual({
        actorId,
        membershipId,
        organizationId,
        roleId,
      });
      expect(Object.isFrozen(getRequestContext()?.organizationScope)).toBe(
        true,
      );
    });
    expect(
      (authRepository.findOrganizationManagementScope as jest.Mock).mock.calls,
    ).toEqual([[actorId]]);
  });

  it.each([UserType.SCHOOL_USER, UserType.TEACHER, UserType.PLATFORM_USER])(
    'denies %s before querying Organization membership',
    async (userType) => {
      const { guard, authRepository } = buildGuard();
      await expect(
        withActor(userType, () => guard.canActivate(executionContext())),
      ).rejects.toBeInstanceOf(ScopeMissingException);
      expect(
        authRepository.findOrganizationManagementScope,
      ).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['missing qualifying membership', null],
    [
      'ambiguous qualifying memberships',
      {
        ...projection(),
        memberships: [
          projection().memberships[0],
          { ...projection().memberships[0], id: actorId },
        ],
      },
    ],
    [
      'stale database user type',
      {
        ...projection(),
        userType: UserType.SCHOOL_USER,
      },
    ],
    [
      'inactive database User',
      {
        ...projection(),
        status: UserStatus.DISABLED,
      },
    ],
  ])('denies %s', async (_label, result) => {
    const { guard } = buildGuard(result);
    await expect(
      withActor(UserType.ORGANIZATION_USER, () =>
        guard.canActivate(executionContext()),
      ),
    ).rejects.toBeInstanceOf(ScopeMissingException);
  });

  it.each([
    ['different Membership', { membershipId: actorId }],
    ['different Organization', { organizationId: actorId }],
    ['School-level scope', { schoolId: actorId }],
    ['different Role', { roleId: actorId }],
  ])('denies a ScopeResolver %s projection', async (_label, override) => {
    const { guard } = buildGuard();
    await expect(
      withActor(
        UserType.ORGANIZATION_USER,
        () => guard.canActivate(executionContext()),
        {
          membershipId,
          organizationId,
          schoolId: null,
          roleId,
          permissions: ['teachers.records.manage'],
          ...override,
        },
      ),
    ).rejects.toBeInstanceOf(ScopeMissingException);
  });

  it('denies a Role projection without teachers.records.manage', async () => {
    const missingPermission = projection();
    missingPermission.memberships[0].role.rolePermissions = [];
    const { guard } = buildGuard(missingPermission);
    await expect(
      withActor(UserType.ORGANIZATION_USER, () =>
        guard.canActivate(executionContext()),
      ),
    ).rejects.toBeInstanceOf(ScopeMissingException);
  });

  it.each([
    [
      'ended Membership',
      (value: ReturnType<typeof projection>) =>
        (value.memberships[0].endedAt = new Date()),
    ],
    [
      'deleted Membership',
      (value: ReturnType<typeof projection>) =>
        (value.memberships[0].deletedAt = new Date()),
    ],
    [
      'inactive Membership',
      (value: ReturnType<typeof projection>) =>
        (value.memberships[0].status = MembershipStatus.SUSPENDED),
    ],
    [
      'School-level Membership',
      (value: ReturnType<typeof projection>) =>
        (value.memberships[0].schoolId = actorId),
    ],
    [
      'inactive Organization',
      (value: ReturnType<typeof projection>) =>
        (value.memberships[0].organization.status =
          OrganizationStatus.SUSPENDED),
    ],
    [
      'deleted Organization',
      (value: ReturnType<typeof projection>) =>
        (value.memberships[0].organization.deletedAt = new Date()),
    ],
    [
      'custom Role',
      (value: ReturnType<typeof projection>) =>
        (value.memberships[0].role.isSystem = false),
    ],
    [
      'wrong Role key',
      (value: ReturnType<typeof projection>) =>
        (value.memberships[0].role.key = 'custom'),
    ],
    [
      'School Role',
      (value: ReturnType<typeof projection>) =>
        (value.memberships[0].role.schoolId = actorId),
    ],
    [
      'deleted Role',
      (value: ReturnType<typeof projection>) =>
        (value.memberships[0].role.deletedAt = new Date()),
    ],
  ])('denies a %s projection defensively', async (_label, mutate) => {
    const value = projection();
    mutate(value);
    const { guard } = buildGuard(value);
    await expect(
      withActor(UserType.ORGANIZATION_USER, () =>
        guard.canActivate(executionContext()),
      ),
    ).rejects.toBeInstanceOf(ScopeMissingException);
  });

  it('does nothing on a route without OrganizationManagementOnly metadata', async () => {
    const reflector = {
      getAllAndOverride: jest.fn(() => false),
    } as unknown as Reflector;
    const authRepository = {
      findOrganizationManagementScope: jest.fn(),
    } as unknown as AuthRepository;
    const guard = new OrganizationScopeGuard(reflector, authRepository);
    await expect(guard.canActivate(executionContext())).resolves.toBe(true);
    expect(
      authRepository.findOrganizationManagementScope,
    ).not.toHaveBeenCalled();
  });
});
