import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  MembershipStatus,
  Prisma,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const USER_WITH_ACTIVE_MEMBERSHIP = {
  include: {
    memberships: {
      where: { status: MembershipStatus.ACTIVE, deletedAt: null },
      include: {
        role: {
          include: {
            rolePermissions: { include: { permission: true } },
          },
        },
      },
      orderBy: { startedAt: 'desc' },
    },
  },
} satisfies Prisma.UserDefaultArgs;

export type UserWithActiveMembership = Prisma.UserGetPayload<
  typeof USER_WITH_ACTIVE_MEMBERSHIP
>;

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findUserByEmail(email: string): Promise<UserWithActiveMembership | null> {
    return this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      ...USER_WITH_ACTIVE_MEMBERSHIP,
    });
  }

  findUserById(userId: string): Promise<UserWithActiveMembership | null> {
    return this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      ...USER_WITH_ACTIVE_MEMBERSHIP,
    });
  }

  async findSystemRolePermissionCodes(roleKey: string): Promise<string[]> {
    const role = await this.prisma.role.findFirst({
      where: {
        key: roleKey,
        schoolId: null,
        isSystem: true,
        deletedAt: null,
      },
      select: {
        rolePermissions: {
          select: {
            permission: { select: { code: true } },
          },
        },
      },
    });

    return role?.rolePermissions.map((rp) => rp.permission.code) ?? [];
  }

  createSession(data: {
    sessionId: string;
    userId: string;
    refreshTokenHash: string;
    userAgent?: string | null;
    ipAddress?: string | null;
    expiresAt: Date;
  }) {
    return this.prisma.session.create({
      data: {
        id: data.sessionId,
        userId: data.userId,
        refreshTokenHash: data.refreshTokenHash,
        userAgent: data.userAgent ?? null,
        ipAddress: data.ipAddress ?? null,
        expiresAt: data.expiresAt,
      },
    });
  }

  findActiveSessionByHash(refreshTokenHash: string) {
    return this.prisma.session.findFirst({
      where: { refreshTokenHash, revokedAt: null },
    });
  }

  findSessionById(sessionId: string) {
    return this.prisma.session.findUnique({ where: { id: sessionId } });
  }

  revokeSession(sessionId: string): Promise<unknown> {
    return this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  revokeUserSessions(
    userId: string,
    options?: { exceptSessionId?: string | null },
  ): Promise<unknown> {
    return this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(options?.exceptSessionId
          ? { id: { not: options.exceptSessionId } }
          : {}),
      },
      data: { revokedAt: new Date() },
    });
  }

  updatePasswordCredential(data: {
    userId: string;
    passwordHash: string;
    mustChangePassword: boolean;
    passwordChangedAt: Date;
  }): Promise<unknown> {
    return this.prisma.user.update({
      where: { id: data.userId },
      data: {
        passwordHash: data.passwordHash,
        mustChangePassword: data.mustChangePassword,
        passwordChangedAt: data.passwordChangedAt,
        credentialVersion: { increment: 1 },
      },
    });
  }

  updateUserLastLogin(userId: string): Promise<unknown> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  }

  createAuditLog(entry: {
    actorId?: string | null;
    userType?: UserType | null;
    organizationId?: string | null;
    schoolId?: string | null;
    module: string;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    outcome: AuditOutcome;
    ipAddress?: string | null;
    userAgent?: string | null;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  }): Promise<unknown> {
    return this.prisma.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        userType: entry.userType ?? null,
        organizationId: entry.organizationId ?? null,
        schoolId: entry.schoolId ?? null,
        module: entry.module,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        outcome: entry.outcome,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
        before: entry.before
          ? (entry.before as Prisma.InputJsonValue)
          : undefined,
        after: entry.after ? (entry.after as Prisma.InputJsonValue) : undefined,
      },
    });
  }
}
