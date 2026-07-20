import {
  MembershipStatus,
  OrganizationStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import type { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AuthRepository } from '../infrastructure/auth.repository';

describe('AuthRepository Organization management scope projection', () => {
  it('uses the authenticated actor id and exact active User predicates', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const repository = new AuthRepository({
      user: { findFirst },
    } as unknown as PrismaService);
    await repository.findOrganizationManagementScope('actor-id');
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'actor-id',
          userType: UserType.ORGANIZATION_USER,
          status: UserStatus.ACTIVE,
          deletedAt: null,
        },
      }),
    );
  });

  it('bounds deterministic Membership selection at two rows', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const repository = new AuthRepository({
      user: { findFirst },
    } as unknown as PrismaService);
    await repository.findOrganizationManagementScope('actor-id');
    const query = findFirst.mock.calls[0][0];
    expect(query.select.memberships.take).toBe(2);
    expect(query.select.memberships.orderBy).toEqual([
      { startedAt: 'desc' },
      { id: 'asc' },
    ]);
  });

  it('requires the exact Organization Membership, Organization, and system Role', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const repository = new AuthRepository({
      user: { findFirst },
    } as unknown as PrismaService);
    await repository.findOrganizationManagementScope('actor-id');
    const where = findFirst.mock.calls[0][0].select.memberships.where;
    expect(where).toEqual(
      expect.objectContaining({
        userType: UserType.ORGANIZATION_USER,
        status: MembershipStatus.ACTIVE,
        endedAt: null,
        deletedAt: null,
        schoolId: null,
        organization: {
          status: OrganizationStatus.ACTIVE,
          deletedAt: null,
        },
        role: expect.objectContaining({
          key: 'organization_admin',
          isSystem: true,
          schoolId: null,
          deletedAt: null,
        }),
      }),
    );
  });

  it('requires teachers.records.manage and selects no identity or credential fields', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const repository = new AuthRepository({
      user: { findFirst },
    } as unknown as PrismaService);
    await repository.findOrganizationManagementScope('actor-id');
    const select = findFirst.mock.calls[0][0].select;
    expect(
      select.memberships.where.role.rolePermissions.some.permission.code,
    ).toBe('teachers.records.manage');
    expect(select).not.toHaveProperty('email');
    expect(select).not.toHaveProperty('passwordHash');
    expect(select).not.toHaveProperty('phone');
  });
});
