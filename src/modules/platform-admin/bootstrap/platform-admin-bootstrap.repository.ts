import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  MembershipStatus,
  Prisma,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  PLATFORM_ADMIN_BOOTSTRAP_AUDIT_ACTION,
  PLATFORM_ADMIN_BOOTSTRAP_AUDIT_MODULE,
  PLATFORM_ADMIN_BOOTSTRAP_MAX_TRANSACTION_ATTEMPTS,
  PLATFORM_ADMIN_ROLE_CODE,
  type PlatformAdminBootstrapEnvironment,
} from './platform-admin-bootstrap.constants';
import { PlatformAdminBootstrapError } from './platform-admin-bootstrap.errors';

export interface CreateInitialPlatformAdministratorInput {
  environment: PlatformAdminBootstrapEnvironment;
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
}

export interface InitialPlatformAdministratorRecord {
  userId: string;
  roleCode: typeof PLATFORM_ADMIN_ROLE_CODE;
}

@Injectable()
export class PlatformAdminBootstrapRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createInitialPlatformAdministrator(
    input: CreateInitialPlatformAdministratorInput,
  ): Promise<InitialPlatformAdministratorRecord> {
    for (
      let attempt = 1;
      attempt <= PLATFORM_ADMIN_BOOTSTRAP_MAX_TRANSACTION_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await this.prisma.$transaction(
          (transaction) => this.createInTransaction(transaction, input),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (error instanceof PlatformAdminBootstrapError) throw error;

        if (
          isRetryableBootstrapConflict(error) &&
          attempt < PLATFORM_ADMIN_BOOTSTRAP_MAX_TRANSACTION_ATTEMPTS
        ) {
          continue;
        }

        if (isSerializationConflict(error)) {
          throw new PlatformAdminBootstrapError(
            'CONCURRENT_BOOTSTRAP_CONFLICT',
          );
        }
        if (isUniqueConstraintConflict(error)) {
          throw new PlatformAdminBootstrapError('EMAIL_IN_USE');
        }
        throw error;
      }
    }

    throw new PlatformAdminBootstrapError('CONCURRENT_BOOTSTRAP_CONFLICT');
  }

  private async createInTransaction(
    transaction: Prisma.TransactionClient,
    input: CreateInitialPlatformAdministratorInput,
  ): Promise<InitialPlatformAdministratorRecord> {
    const priorSuccessfulBootstrap = await transaction.auditLog.findFirst({
      where: {
        module: PLATFORM_ADMIN_BOOTSTRAP_AUDIT_MODULE,
        action: PLATFORM_ADMIN_BOOTSTRAP_AUDIT_ACTION,
        outcome: AuditOutcome.SUCCESS,
      },
      select: { id: true },
    });
    if (priorSuccessfulBootstrap) {
      throw new PlatformAdminBootstrapError('ALREADY_INITIALIZED');
    }

    const existingPlatformAdministrator = await transaction.user.findFirst({
      where: {
        userType: UserType.PLATFORM_USER,
        status: UserStatus.ACTIVE,
        passwordHash: { not: null },
        deletedAt: null,
        memberships: {
          none: {
            status: MembershipStatus.ACTIVE,
            deletedAt: null,
          },
        },
      },
      select: { id: true },
    });
    if (existingPlatformAdministrator) {
      throw new PlatformAdminBootstrapError('ALREADY_INITIALIZED');
    }

    const [roles, permissionCount] = await Promise.all([
      transaction.role.findMany({
        where: {
          key: PLATFORM_ADMIN_ROLE_CODE,
          schoolId: null,
          isSystem: true,
          deletedAt: null,
        },
        select: {
          id: true,
          _count: { select: { rolePermissions: true } },
        },
        take: 2,
      }),
      transaction.permission.count(),
    ]);
    if (
      roles.length !== 1 ||
      permissionCount === 0 ||
      roles[0]._count.rolePermissions !== permissionCount
    ) {
      throw new PlatformAdminBootstrapError('REFERENCE_DATA_INVALID');
    }

    const existingEmailOwner = await transaction.user.findFirst({
      where: {
        email: { equals: input.email, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (existingEmailOwner) {
      throw new PlatformAdminBootstrapError('EMAIL_IN_USE');
    }

    const initializedAt = new Date();
    const user = await transaction.user.create({
      data: {
        email: input.email,
        contactEmail: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        userType: UserType.PLATFORM_USER,
        status: UserStatus.ACTIVE,
        passwordHash: input.passwordHash,
        mustChangePassword: false,
        passwordChangedAt: initializedAt,
        passwordProvisionedAt: initializedAt,
        credentialVersion: 1,
      },
      select: { id: true },
    });

    await transaction.auditLog.create({
      data: {
        actorId: null,
        userType: null,
        organizationId: null,
        schoolId: null,
        module: PLATFORM_ADMIN_BOOTSTRAP_AUDIT_MODULE,
        action: PLATFORM_ADMIN_BOOTSTRAP_AUDIT_ACTION,
        resourceType: 'user',
        resourceId: user.id,
        outcome: AuditOutcome.SUCCESS,
        after: {
          userType: UserType.PLATFORM_USER,
          status: UserStatus.ACTIVE,
          roleCode: PLATFORM_ADMIN_ROLE_CODE,
          credentialVersion: 1,
          environment: input.environment,
        },
      },
    });

    return { userId: user.id, roleCode: PLATFORM_ADMIN_ROLE_CODE };
  }
}

function isRetryableBootstrapConflict(error: unknown): boolean {
  return isSerializationConflict(error) || isUniqueConstraintConflict(error);
}

function isSerializationConflict(error: unknown): boolean {
  return hasPrismaErrorCode(error, 'P2034');
}

function isUniqueConstraintConflict(error: unknown): boolean {
  return hasPrismaErrorCode(error, 'P2002');
}

function hasPrismaErrorCode(error: unknown, code: string): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === code,
  );
}
