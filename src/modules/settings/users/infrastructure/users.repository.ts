import { Injectable } from '@nestjs/common';
import {
  MembershipStatus,
  Prisma,
  Role,
  User,
  UserStatus,
  UserType,
} from '@prisma/client';
import { platformBypassScope } from '../../../../infrastructure/database/platform-bypass.helper';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const ASSIGNABLE_SYSTEM_ROLE_KEYS = [
  'school_admin',
  'teacher',
  'parent',
  'student',
] as const;

const SCOPED_MEMBERSHIP_ARGS = Prisma.validator<Prisma.MembershipDefaultArgs>()({
  include: {
    user: true,
    role: true,
  },
});

export type ScopedMembershipRecord = Prisma.MembershipGetPayload<
  typeof SCOPED_MEMBERSHIP_ARGS
>;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listUsers(params: {
    search?: string;
    roleId?: string;
    status?: 'active' | 'invited' | 'inactive';
    page: number;
    limit: number;
  }): Promise<{ items: ScopedMembershipRecord[]; total: number }> {
    const where = this.buildMembershipWhere(params);
    const skip = (params.page - 1) * params.limit;

    const [items, total] = await Promise.all([
      this.scopedPrisma.membership.findMany({
        where,
        orderBy: [{ user: { firstName: 'asc' } }, { user: { lastName: 'asc' } }],
        skip,
        take: params.limit,
        ...SCOPED_MEMBERSHIP_ARGS,
      }),
      this.scopedPrisma.membership.count({ where }),
    ]);

    return { items, total };
  }

  findScopedMembershipByUserId(userId: string): Promise<ScopedMembershipRecord | null> {
    return this.scopedPrisma.membership.findFirst({
      where: {
        userId,
        status: MembershipStatus.ACTIVE,
        deletedAt: null,
        user: { deletedAt: null },
      },
      ...SCOPED_MEMBERSHIP_ARGS,
    });
  }

  findUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });
  }

  findAssignableRoleById(schoolId: string, roleId: string): Promise<Role | null> {
    return platformBypassScope(() =>
      this.prisma.role.findFirst({
        where: {
          id: roleId,
          deletedAt: null,
          OR: [
            { schoolId },
            {
              schoolId: null,
              isSystem: true,
              key: { in: [...ASSIGNABLE_SYSTEM_ROLE_KEYS] },
            },
          ],
        },
      }),
    );
  }

  createUserWithMembership(data: {
    email: string;
    firstName: string;
    lastName: string;
    status: UserStatus;
    userType: UserType;
    schoolId: string;
    organizationId: string;
    roleId: string;
    passwordHash?: string | null;
  }): Promise<ScopedMembershipRecord> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          userType: data.userType,
          status: data.status,
          passwordHash: data.passwordHash ?? null,
        },
      });

      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: data.organizationId,
          schoolId: data.schoolId,
          roleId: data.roleId,
          userType: data.userType,
          status: MembershipStatus.ACTIVE,
        },
      });

      return tx.membership.findUniqueOrThrow({
        where: { id: membership.id },
        ...SCOPED_MEMBERSHIP_ARGS,
      });
    });
  }

  updateUserAndMembership(data: {
    userId: string;
    membershipId: string;
    firstName?: string;
    lastName?: string;
    status?: UserStatus;
    userType?: UserType;
    roleId?: string;
    touchUpdatedAt?: boolean;
  }): Promise<ScopedMembershipRecord> {
    return this.prisma.$transaction(async (tx) => {
      if (
        data.firstName !== undefined ||
        data.lastName !== undefined ||
        data.status !== undefined ||
        data.userType !== undefined ||
        data.touchUpdatedAt
      ) {
        await tx.user.update({
          where: { id: data.userId },
          data: {
            ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
            ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
            ...(data.status !== undefined ? { status: data.status } : {}),
            ...(data.userType !== undefined ? { userType: data.userType } : {}),
            ...(data.touchUpdatedAt ? { status: UserStatus.INVITED } : {}),
          },
        });
      }

      if (data.roleId !== undefined || data.userType !== undefined) {
        await tx.membership.update({
          where: { id: data.membershipId },
          data: {
            ...(data.roleId !== undefined ? { roleId: data.roleId } : {}),
            ...(data.userType !== undefined ? { userType: data.userType } : {}),
          },
        });
      }

      return tx.membership.findUniqueOrThrow({
        where: { id: data.membershipId },
        ...SCOPED_MEMBERSHIP_ARGS,
      });
    });
  }

  private buildMembershipWhere(params: {
    search?: string;
    roleId?: string;
    status?: 'active' | 'invited' | 'inactive';
  }): Prisma.MembershipWhereInput {
    const search = params.search?.trim();

    return {
      status: MembershipStatus.ACTIVE,
      deletedAt: null,
      ...(params.roleId ? { roleId: params.roleId } : {}),
      user: {
        deletedAt: null,
        ...(params.status ? this.mapStatusFilter(params.status) : {}),
        ...(search
          ? {
              OR: [
                { email: { contains: search, mode: 'insensitive' } },
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
    };
  }

  private mapStatusFilter(
    status: 'active' | 'invited' | 'inactive',
  ): Prisma.UserWhereInput {
    switch (status) {
      case 'active':
        return { status: UserStatus.ACTIVE };
      case 'invited':
        return { status: UserStatus.INVITED };
      case 'inactive':
        return { status: { in: [UserStatus.SUSPENDED, UserStatus.DISABLED] } };
    }
  }
}
