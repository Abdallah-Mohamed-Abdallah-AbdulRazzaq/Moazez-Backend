import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  CommunicationRestrictionType,
  MembershipStatus,
  Prisma,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

const COMMUNICATION_RESTRICTION_ARGS =
  Prisma.validator<Prisma.CommunicationUserRestrictionDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      targetUserId: true,
      restrictedById: true,
      restrictionType: true,
      reason: true,
      startsAt: true,
      expiresAt: true,
      liftedById: true,
      liftedAt: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
    },
  });

const SCHOOL_MEMBERSHIP_REFERENCE_ARGS =
  Prisma.validator<Prisma.MembershipDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      organizationId: true,
      userId: true,
      userType: true,
      status: true,
    },
  });

export type CommunicationUserRestrictionRecord =
  Prisma.CommunicationUserRestrictionGetPayload<
    typeof COMMUNICATION_RESTRICTION_ARGS
  >;

export type CommunicationRestrictionSchoolMembershipReference =
  Prisma.MembershipGetPayload<typeof SCHOOL_MEMBERSHIP_REFERENCE_ARGS>;

export interface CommunicationRestrictionListFilters {
  targetUserId?: string;
  restrictionType?: CommunicationRestrictionType;
  status?: 'ACTIVE' | 'LIFTED' | 'EXPIRED';
  activeOnly?: boolean;
  now?: Date;
  limit?: number;
  page?: number;
}

export interface CommunicationRestrictionListResult {
  items: CommunicationUserRestrictionRecord[];
  total: number;
  limit: number;
  page: number;
}

export interface CommunicationRestrictionAuditInput {
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
}

@Injectable()
export class CommunicationRestrictionRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listCurrentSchoolUserRestrictions(
    filters: CommunicationRestrictionListFilters,
  ): Promise<CommunicationRestrictionListResult> {
    const limit = filters.limit ?? 50;
    const page = filters.page ?? 1;
    const where = this.buildRestrictionWhere(filters);

    const [items, total] = await Promise.all([
      this.scopedPrisma.communicationUserRestriction.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: limit,
        skip: (page - 1) * limit,
        ...COMMUNICATION_RESTRICTION_ARGS,
      }),
      this.scopedPrisma.communicationUserRestriction.count({ where }),
    ]);

    return { items, total, limit, page };
  }

  findCurrentSchoolUserRestrictionById(
    restrictionId: string,
  ): Promise<CommunicationUserRestrictionRecord | null> {
    return this.scopedPrisma.communicationUserRestriction.findFirst({
      where: { id: restrictionId },
      ...COMMUNICATION_RESTRICTION_ARGS,
    });
  }

  findCurrentSchoolActiveRestriction(input: {
    targetUserId: string;
    restrictionType: CommunicationRestrictionType;
  }): Promise<CommunicationUserRestrictionRecord | null> {
    return this.scopedPrisma.communicationUserRestriction.findFirst({
      where: {
        targetUserId: input.targetUserId,
        restrictionType: input.restrictionType,
        liftedAt: null,
      },
      ...COMMUNICATION_RESTRICTION_ARGS,
    });
  }

  findCurrentSchoolUserMembership(
    userId: string,
  ): Promise<CommunicationRestrictionSchoolMembershipReference | null> {
    return this.scopedPrisma.membership.findFirst({
      where: {
        userId,
        status: MembershipStatus.ACTIVE,
      },
      ...SCHOOL_MEMBERSHIP_REFERENCE_ARGS,
    });
  }

  async createCurrentSchoolUserRestriction(input: {
    schoolId: string;
    targetUserId: string;
    restrictedById: string;
    restrictionType: CommunicationRestrictionType;
    reason?: string | null;
    startsAt?: Date | null;
    expiresAt?: Date | null;
    metadata?: Record<string, unknown> | null;
    buildAuditEntry: (
      restriction: CommunicationUserRestrictionRecord,
    ) => CommunicationRestrictionAuditInput;
  }): Promise<CommunicationUserRestrictionRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      const created = await tx.communicationUserRestriction.create({
        data: {
          schoolId: input.schoolId,
          targetUserId: input.targetUserId,
          restrictedById: input.restrictedById,
          restrictionType: input.restrictionType,
          reason: normalizeOptionalText(input.reason),
          startsAt: input.startsAt ?? undefined,
          expiresAt: input.expiresAt ?? null,
          metadata: toNullableJson(input.metadata),
        },
        select: { id: true },
      });

      const restriction = await this.findRestrictionInTransaction(
        tx,
        created.id,
      );
      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(restriction),
      );

      return restriction;
    });
  }

  async updateCurrentSchoolUserRestriction(input: {
    restrictionId: string;
    reason?: string | null;
    startsAt?: Date | null;
    expiresAt?: Date | null;
    metadata?: Record<string, unknown> | null;
    buildAuditEntry: (
      restriction: CommunicationUserRestrictionRecord,
    ) => CommunicationRestrictionAuditInput;
  }): Promise<CommunicationUserRestrictionRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      await tx.communicationUserRestriction.updateMany({
        where: { id: input.restrictionId },
        data: {
          ...(input.reason !== undefined
            ? { reason: normalizeOptionalText(input.reason) }
            : {}),
          ...(input.startsAt !== undefined
            ? { startsAt: input.startsAt ?? undefined }
            : {}),
          ...(input.expiresAt !== undefined
            ? { expiresAt: input.expiresAt ?? null }
            : {}),
          ...(input.metadata !== undefined
            ? { metadata: toNullableJson(input.metadata) }
            : {}),
        },
      });

      const restriction = await this.findRestrictionInTransaction(
        tx,
        input.restrictionId,
      );
      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(restriction),
      );

      return restriction;
    });
  }

  async revokeCurrentSchoolUserRestriction(input: {
    restrictionId: string;
    liftedById: string;
    buildAuditEntry: (
      restriction: CommunicationUserRestrictionRecord,
    ) => CommunicationRestrictionAuditInput;
  }): Promise<CommunicationUserRestrictionRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      await tx.communicationUserRestriction.updateMany({
        where: {
          id: input.restrictionId,
          liftedAt: null,
        },
        data: {
          liftedAt: new Date(),
          liftedById: input.liftedById,
        },
      });

      const restriction = await this.findRestrictionInTransaction(
        tx,
        input.restrictionId,
      );
      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(restriction),
      );

      return restriction;
    });
  }

  private buildRestrictionWhere(
    filters: CommunicationRestrictionListFilters,
  ): Prisma.CommunicationUserRestrictionWhereInput {
    const now = filters.now ?? new Date();
    const statusWhere =
      filters.activeOnly || filters.status === 'ACTIVE'
        ? {
            liftedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          }
        : filters.status === 'LIFTED'
          ? { liftedAt: { not: null } }
          : filters.status === 'EXPIRED'
            ? { liftedAt: null, expiresAt: { lte: now } }
            : {};

    return {
      ...(filters.targetUserId ? { targetUserId: filters.targetUserId } : {}),
      ...(filters.restrictionType
        ? { restrictionType: filters.restrictionType }
        : {}),
      ...statusWhere,
    };
  }

  private async findRestrictionInTransaction(
    tx: Prisma.TransactionClient,
    restrictionId: string,
  ): Promise<CommunicationUserRestrictionRecord> {
    const restriction = await tx.communicationUserRestriction.findFirst({
      where: { id: restrictionId },
      ...COMMUNICATION_RESTRICTION_ARGS,
    });

    if (!restriction) {
      throw new Error(
        'Communication user restriction mutation result was not found',
      );
    }

    return restriction;
  }

  private createAuditLogInTransaction(
    tx: Prisma.TransactionClient,
    entry: CommunicationRestrictionAuditInput,
  ): Promise<unknown> {
    return tx.auditLog.create({
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

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNullableJson(
  value: unknown,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}
