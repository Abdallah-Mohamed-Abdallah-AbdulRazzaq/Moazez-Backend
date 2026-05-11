import { Injectable } from '@nestjs/common';
import { MembershipStatus, Prisma, UserStatus, UserType } from '@prisma/client';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import {
  CredentialBulkScopeValue,
  CredentialStatusValue,
  UserTypeApiValue,
} from '../dto/credential.dto';

const CREDENTIAL_MEMBERSHIP_ARGS =
  Prisma.validator<Prisma.MembershipDefaultArgs>()({
    include: {
      user: {
        select: {
          id: true,
          email: true,
          username: true,
          contactEmail: true,
          passwordHash: true,
          firstName: true,
          lastName: true,
          userType: true,
          status: true,
          lastLoginAt: true,
          mustChangePassword: true,
          passwordChangedAt: true,
          passwordProvisionedAt: true,
          credentialVersion: true,
          createdAt: true,
          deletedAt: true,
        },
      },
      role: {
        select: {
          id: true,
          key: true,
          name: true,
        },
      },
    },
  });

export type CredentialMembershipRecord = Prisma.MembershipGetPayload<
  typeof CREDENTIAL_MEMBERSHIP_ARGS
>;

export interface CredentialTargetSelection {
  scope: CredentialBulkScopeValue;
  userIds?: string[];
  roleKeys?: string[];
  userTypes?: UserTypeApiValue[];
}

@Injectable()
export class UserCredentialsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findScopedMembershipByUserId(
    userId: string,
  ): Promise<CredentialMembershipRecord | null> {
    return this.scopedPrisma.membership.findFirst({
      where: {
        userId,
        status: MembershipStatus.ACTIVE,
        deletedAt: null,
        user: { deletedAt: null },
      },
      ...CREDENTIAL_MEMBERSHIP_ARGS,
    });
  }

  async listCredentialStatus(params: {
    roleKey?: string;
    userType?: UserTypeApiValue;
    credentialStatus?: CredentialStatusValue;
    search?: string;
    page: number;
    limit: number;
  }): Promise<{ items: CredentialMembershipRecord[]; total: number }> {
    const where = this.buildMembershipWhere(params);
    const skip = (params.page - 1) * params.limit;

    const [items, total] = await Promise.all([
      this.scopedPrisma.membership.findMany({
        where,
        orderBy: [
          { user: { firstName: 'asc' } },
          { user: { lastName: 'asc' } },
        ],
        skip,
        take: params.limit,
        ...CREDENTIAL_MEMBERSHIP_ARGS,
      }),
      this.scopedPrisma.membership.count({ where }),
    ]);

    return { items, total };
  }

  listCredentialTargets(
    selection: CredentialTargetSelection,
  ): Promise<CredentialMembershipRecord[]> {
    return this.scopedPrisma.membership.findMany({
      where: this.buildSelectionWhere(selection),
      orderBy: [{ user: { firstName: 'asc' } }, { user: { lastName: 'asc' } }],
      ...CREDENTIAL_MEMBERSHIP_ARGS,
    });
  }

  async updateUserCredential(data: {
    userId: string;
    passwordHash: string;
    mustChangePassword: boolean;
    passwordProvisionedAt: Date;
    passwordChangedAt?: Date | null;
  }): Promise<CredentialMembershipRecord> {
    await this.prisma.user.update({
      where: { id: data.userId },
      data: {
        passwordHash: data.passwordHash,
        mustChangePassword: data.mustChangePassword,
        passwordProvisionedAt: data.passwordProvisionedAt,
        passwordChangedAt:
          data.passwordChangedAt === undefined
            ? undefined
            : data.passwordChangedAt,
        credentialVersion: { increment: 1 },
      },
    });

    return this.scopedPrisma.membership.findFirstOrThrow({
      where: {
        userId: data.userId,
        status: MembershipStatus.ACTIVE,
        deletedAt: null,
        user: { deletedAt: null },
      },
      ...CREDENTIAL_MEMBERSHIP_ARGS,
    });
  }

  private buildMembershipWhere(params: {
    roleKey?: string;
    userType?: UserTypeApiValue;
    credentialStatus?: CredentialStatusValue;
    search?: string;
  }): Prisma.MembershipWhereInput {
    const userWhere: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(params.userType
        ? { userType: mapUserTypeFromApi(params.userType) }
        : {}),
      ...this.buildCredentialStatusWhere(params.credentialStatus),
      ...this.buildSearchWhere(params.search),
    };

    return {
      status: MembershipStatus.ACTIVE,
      deletedAt: null,
      ...(params.roleKey ? { role: { key: params.roleKey } } : {}),
      user: userWhere,
    };
  }

  private buildSelectionWhere(
    selection: CredentialTargetSelection,
  ): Prisma.MembershipWhereInput {
    const userWhere: Prisma.UserWhereInput = { deletedAt: null };
    const where: Prisma.MembershipWhereInput = {
      status: MembershipStatus.ACTIVE,
      deletedAt: null,
      user: userWhere,
    };

    switch (selection.scope) {
      case 'selected':
        userWhere.id = { in: selection.userIds ?? [] };
        break;
      case 'role':
        where.role = { key: { in: selection.roleKeys ?? [] } };
        break;
      case 'user_type':
        userWhere.userType = {
          in: (selection.userTypes ?? []).map(mapUserTypeFromApi),
        };
        break;
      case 'missing_password':
        userWhere.passwordHash = null;
        break;
      case 'all_school_users':
        break;
    }

    return where;
  }

  private buildCredentialStatusWhere(
    status?: CredentialStatusValue,
  ): Prisma.UserWhereInput {
    switch (status) {
      case 'missing':
        return { passwordHash: null };
      case 'set':
        return { passwordHash: { not: null }, mustChangePassword: false };
      case 'must_change':
        return { passwordHash: { not: null }, mustChangePassword: true };
      case 'temporary_or_must_change':
        return { passwordHash: { not: null }, mustChangePassword: true };
      default:
        return {};
    }
  }

  private buildSearchWhere(search?: string): Prisma.UserWhereInput {
    const normalized = search?.trim();
    if (!normalized) return {};

    return {
      OR: [
        { email: { contains: normalized, mode: Prisma.QueryMode.insensitive } },
        {
          username: {
            contains: normalized,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          contactEmail: {
            contains: normalized,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          firstName: {
            contains: normalized,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          lastName: {
            contains: normalized,
            mode: Prisma.QueryMode.insensitive,
          },
        },
      ],
    };
  }
}

export function mapUserTypeFromApi(userType: UserTypeApiValue): UserType {
  return userType.toUpperCase() as UserType;
}

export function isDisabledCredentialTarget(status: UserStatus): boolean {
  return status === UserStatus.DISABLED || status === UserStatus.SUSPENDED;
}
