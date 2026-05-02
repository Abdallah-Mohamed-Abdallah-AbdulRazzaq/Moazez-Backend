import { Injectable } from '@nestjs/common';
import { AuditOutcome, MembershipStatus, Prisma, UserType } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

const COMMUNICATION_BLOCK_ARGS =
  Prisma.validator<Prisma.CommunicationUserBlockDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      blockerUserId: true,
      blockedUserId: true,
      reason: true,
      unblockedAt: true,
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

export type CommunicationUserBlockRecord =
  Prisma.CommunicationUserBlockGetPayload<typeof COMMUNICATION_BLOCK_ARGS>;

export type CommunicationSchoolMembershipReference =
  Prisma.MembershipGetPayload<typeof SCHOOL_MEMBERSHIP_REFERENCE_ARGS>;

export interface CommunicationBlockAuditInput {
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
export class CommunicationBlockRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  listCurrentActorBlocks(input: {
    actorId: string;
  }): Promise<CommunicationUserBlockRecord[]> {
    return this.scopedPrisma.communicationUserBlock.findMany({
      where: {
        blockerUserId: input.actorId,
        unblockedAt: null,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      ...COMMUNICATION_BLOCK_ARGS,
    });
  }

  findCurrentSchoolActiveBlock(input: {
    blockerUserId: string;
    blockedUserId: string;
  }): Promise<CommunicationUserBlockRecord | null> {
    return this.scopedPrisma.communicationUserBlock.findFirst({
      where: {
        blockerUserId: input.blockerUserId,
        blockedUserId: input.blockedUserId,
        unblockedAt: null,
      },
      ...COMMUNICATION_BLOCK_ARGS,
    });
  }

  findCurrentActorBlockById(input: {
    blockId: string;
    actorId: string;
  }): Promise<CommunicationUserBlockRecord | null> {
    return this.scopedPrisma.communicationUserBlock.findFirst({
      where: {
        id: input.blockId,
        blockerUserId: input.actorId,
      },
      ...COMMUNICATION_BLOCK_ARGS,
    });
  }

  findCurrentSchoolUserMembership(
    userId: string,
  ): Promise<CommunicationSchoolMembershipReference | null> {
    return this.scopedPrisma.membership.findFirst({
      where: {
        userId,
        status: MembershipStatus.ACTIVE,
      },
      ...SCHOOL_MEMBERSHIP_REFERENCE_ARGS,
    });
  }

  async createCurrentSchoolUserBlock(input: {
    schoolId: string;
    blockerUserId: string;
    blockedUserId: string;
    reason?: string | null;
    metadata?: Record<string, unknown> | null;
    buildAuditEntry: (
      block: CommunicationUserBlockRecord,
    ) => CommunicationBlockAuditInput;
  }): Promise<CommunicationUserBlockRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      const created = await tx.communicationUserBlock.create({
        data: {
          schoolId: input.schoolId,
          blockerUserId: input.blockerUserId,
          blockedUserId: input.blockedUserId,
          reason: normalizeOptionalText(input.reason),
          metadata: toNullableJson(input.metadata),
        },
        select: { id: true },
      });

      const block = await this.findBlockInTransaction(tx, created.id);
      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(block),
      );

      return block;
    });
  }

  async deleteCurrentSchoolUserBlock(input: {
    blockId: string;
    buildAuditEntry: (
      block: CommunicationUserBlockRecord,
    ) => CommunicationBlockAuditInput;
  }): Promise<CommunicationUserBlockRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      await tx.communicationUserBlock.updateMany({
        where: {
          id: input.blockId,
          unblockedAt: null,
        },
        data: { unblockedAt: new Date() },
      });

      const block = await this.findBlockInTransaction(tx, input.blockId);
      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(block),
      );

      return block;
    });
  }

  private async findBlockInTransaction(
    tx: Prisma.TransactionClient,
    blockId: string,
  ): Promise<CommunicationUserBlockRecord> {
    const block = await tx.communicationUserBlock.findFirst({
      where: { id: blockId },
      ...COMMUNICATION_BLOCK_ARGS,
    });

    if (!block) {
      throw new Error('Communication user block mutation result was not found');
    }

    return block;
  }

  private createAuditLogInTransaction(
    tx: Prisma.TransactionClient,
    entry: CommunicationBlockAuditInput,
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
