import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  CommunicationConversationStatus,
  CommunicationInviteStatus,
  CommunicationJoinRequestStatus,
  CommunicationParticipantRole,
  CommunicationParticipantStatus,
  MembershipStatus,
  Prisma,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

const USER_DISPLAY_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  userType: true,
} satisfies Prisma.UserSelect;

const COMMUNICATION_PARTICIPANT_ARGS =
  Prisma.validator<Prisma.CommunicationConversationParticipantDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      conversationId: true,
      userId: true,
      role: true,
      status: true,
      joinedAt: true,
      invitedById: true,
      leftAt: true,
      removedById: true,
      removedAt: true,
      mutedUntil: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: USER_DISPLAY_SELECT,
      },
    },
  });

const COMMUNICATION_INVITE_ARGS =
  Prisma.validator<Prisma.CommunicationConversationInviteDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      conversationId: true,
      invitedUserId: true,
      invitedById: true,
      status: true,
      expiresAt: true,
      respondedAt: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
      invitedUser: {
        select: USER_DISPLAY_SELECT,
      },
    },
  });

const COMMUNICATION_JOIN_REQUEST_ARGS =
  Prisma.validator<Prisma.CommunicationConversationJoinRequestDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      conversationId: true,
      requestedById: true,
      reviewedById: true,
      status: true,
      reviewedAt: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
      requestedBy: {
        select: USER_DISPLAY_SELECT,
      },
    },
  });

const COMMUNICATION_CONVERSATION_REFERENCE_ARGS =
  Prisma.validator<Prisma.CommunicationConversationDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      status: true,
    },
  });

const PARTICIPANT_TARGET_USER_ARGS =
  Prisma.validator<Prisma.MembershipDefaultArgs>()({
    select: {
      id: true,
      userId: true,
      schoolId: true,
      userType: true,
      user: {
        select: USER_DISPLAY_SELECT,
      },
    },
  });

export type CommunicationParticipantRecord =
  Prisma.CommunicationConversationParticipantGetPayload<
    typeof COMMUNICATION_PARTICIPANT_ARGS
  >;

export type CommunicationInviteRecord =
  Prisma.CommunicationConversationInviteGetPayload<
    typeof COMMUNICATION_INVITE_ARGS
  >;

export type CommunicationJoinRequestRecord =
  Prisma.CommunicationConversationJoinRequestGetPayload<
    typeof COMMUNICATION_JOIN_REQUEST_ARGS
  >;

export type CommunicationConversationParticipantReferenceRecord =
  Prisma.CommunicationConversationGetPayload<
    typeof COMMUNICATION_CONVERSATION_REFERENCE_ARGS
  >;

export type CommunicationParticipantTargetUserRecord =
  Prisma.MembershipGetPayload<typeof PARTICIPANT_TARGET_USER_ARGS>;

export interface CommunicationParticipantAuditInput {
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

export interface CommunicationParticipantPersistenceData {
  role?: CommunicationParticipantRole;
  status?: CommunicationParticipantStatus;
  mutedUntil?: Date | null;
  metadata?: Record<string, unknown> | null;
}

export interface CommunicationInvitePersistenceData {
  expiresAt?: Date | null;
  metadata?: Record<string, unknown> | null;
}

export interface CommunicationJoinRequestPersistenceData {
  note?: string | null;
  reviewNote?: string | null;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class CommunicationParticipantRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findCurrentSchoolConversationById(
    conversationId: string,
  ): Promise<CommunicationConversationParticipantReferenceRecord | null> {
    return this.scopedPrisma.communicationConversation.findFirst({
      where: { id: conversationId },
      ...COMMUNICATION_CONVERSATION_REFERENCE_ARGS,
    });
  }

  listCurrentSchoolParticipants(
    conversationId: string,
  ): Promise<CommunicationParticipantRecord[]> {
    return this.scopedPrisma.communicationConversationParticipant.findMany({
      where: { conversationId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...COMMUNICATION_PARTICIPANT_ARGS,
    });
  }

  findCurrentSchoolParticipantById(input: {
    conversationId: string;
    participantId: string;
  }): Promise<CommunicationParticipantRecord | null> {
    return this.scopedPrisma.communicationConversationParticipant.findFirst({
      where: {
        id: input.participantId,
        conversationId: input.conversationId,
      },
      ...COMMUNICATION_PARTICIPANT_ARGS,
    });
  }

  findCurrentSchoolParticipantByUserId(input: {
    conversationId: string;
    userId: string;
  }): Promise<CommunicationParticipantRecord | null> {
    return this.scopedPrisma.communicationConversationParticipant.findFirst({
      where: {
        conversationId: input.conversationId,
        userId: input.userId,
      },
      ...COMMUNICATION_PARTICIPANT_ARGS,
    });
  }

  async addCurrentSchoolParticipant(input: {
    schoolId: string;
    conversationId: string;
    userId: string;
    actorId: string;
    data: CommunicationParticipantPersistenceData;
    buildAuditEntry: (
      participant: CommunicationParticipantRecord,
      before?: CommunicationParticipantRecord | null,
    ) => CommunicationParticipantAuditInput;
  }): Promise<CommunicationParticipantRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      const existing = await tx.communicationConversationParticipant.findFirst({
        where: {
          conversationId: input.conversationId,
          userId: input.userId,
        },
        ...COMMUNICATION_PARTICIPANT_ARGS,
      });

      const participantId = existing
        ? await this.updateParticipantInTransaction(tx, existing.id, {
            ...input.data,
            status: input.data.status ?? CommunicationParticipantStatus.ACTIVE,
            invitedById: input.actorId,
            joinedAt: new Date(),
            leftAt: null,
            removedAt: null,
            removedById: null,
          })
        : await this.createParticipantInTransaction(tx, {
            schoolId: input.schoolId,
            conversationId: input.conversationId,
            userId: input.userId,
            invitedById: input.actorId,
            data: input.data,
          });

      const participant = await this.findParticipantInTransaction(
        tx,
        participantId,
      );
      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(participant, existing),
      );

      return participant;
    });
  }

  async updateCurrentSchoolParticipant(input: {
    participantId: string;
    data: CommunicationParticipantPersistenceData;
    buildAuditEntry: (
      participant: CommunicationParticipantRecord,
    ) => CommunicationParticipantAuditInput;
  }): Promise<CommunicationParticipantRecord> {
    return this.updateParticipantWithAudit(input);
  }

  async removeCurrentSchoolParticipant(input: {
    participantId: string;
    actorId: string;
    buildAuditEntry: (
      participant: CommunicationParticipantRecord,
    ) => CommunicationParticipantAuditInput;
  }): Promise<CommunicationParticipantRecord> {
    return this.updateParticipantWithAudit({
      participantId: input.participantId,
      data: {
        status: CommunicationParticipantStatus.REMOVED,
        mutedUntil: null,
        metadata: undefined,
      },
      extraData: {
        removedAt: new Date(),
        removedById: input.actorId,
      },
      buildAuditEntry: input.buildAuditEntry,
    });
  }

  async leaveCurrentSchoolConversation(input: {
    participantId: string;
    buildAuditEntry: (
      participant: CommunicationParticipantRecord,
    ) => CommunicationParticipantAuditInput;
  }): Promise<CommunicationParticipantRecord> {
    return this.updateParticipantWithAudit({
      participantId: input.participantId,
      data: {
        status: CommunicationParticipantStatus.LEFT,
        mutedUntil: null,
        metadata: undefined,
      },
      extraData: {
        leftAt: new Date(),
      },
      buildAuditEntry: input.buildAuditEntry,
    });
  }

  promoteCurrentSchoolParticipant(input: {
    participantId: string;
    role: CommunicationParticipantRole;
    buildAuditEntry: (
      participant: CommunicationParticipantRecord,
    ) => CommunicationParticipantAuditInput;
  }): Promise<CommunicationParticipantRecord> {
    return this.updateParticipantWithAudit({
      participantId: input.participantId,
      data: { role: input.role },
      buildAuditEntry: input.buildAuditEntry,
    });
  }

  demoteCurrentSchoolParticipant(input: {
    participantId: string;
    role: CommunicationParticipantRole;
    buildAuditEntry: (
      participant: CommunicationParticipantRecord,
    ) => CommunicationParticipantAuditInput;
  }): Promise<CommunicationParticipantRecord> {
    return this.updateParticipantWithAudit({
      participantId: input.participantId,
      data: { role: input.role },
      buildAuditEntry: input.buildAuditEntry,
    });
  }

  countActiveOwners(conversationId: string): Promise<number> {
    return this.scopedPrisma.communicationConversationParticipant.count({
      where: {
        conversationId,
        role: CommunicationParticipantRole.OWNER,
        status: {
          in: [
            CommunicationParticipantStatus.ACTIVE,
            CommunicationParticipantStatus.MUTED,
          ],
        },
      },
    });
  }

  findCurrentSchoolUserForParticipantTarget(
    userId: string,
  ): Promise<CommunicationParticipantTargetUserRecord | null> {
    return this.scopedPrisma.membership.findFirst({
      where: {
        userId,
        status: MembershipStatus.ACTIVE,
        endedAt: null,
        deletedAt: null,
        user: { is: { deletedAt: null } },
      },
      ...PARTICIPANT_TARGET_USER_ARGS,
    });
  }

  listCurrentSchoolInvites(
    conversationId: string,
  ): Promise<CommunicationInviteRecord[]> {
    return this.scopedPrisma.communicationConversationInvite.findMany({
      where: { conversationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      ...COMMUNICATION_INVITE_ARGS,
    });
  }

  findCurrentSchoolInviteById(
    inviteId: string,
  ): Promise<CommunicationInviteRecord | null> {
    return this.scopedPrisma.communicationConversationInvite.findFirst({
      where: { id: inviteId },
      ...COMMUNICATION_INVITE_ARGS,
    });
  }

  hasPendingCurrentSchoolInvite(input: {
    conversationId: string;
    invitedUserId: string;
  }): Promise<boolean> {
    return this.scopedPrisma.communicationConversationInvite
      .count({
        where: {
          conversationId: input.conversationId,
          invitedUserId: input.invitedUserId,
          status: CommunicationInviteStatus.PENDING,
        },
      })
      .then((count) => count > 0);
  }

  async createCurrentSchoolInvite(input: {
    schoolId: string;
    conversationId: string;
    invitedUserId: string;
    invitedById: string;
    data: CommunicationInvitePersistenceData;
    buildAuditEntry: (
      invite: CommunicationInviteRecord,
    ) => CommunicationParticipantAuditInput;
  }): Promise<CommunicationInviteRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      const created = await tx.communicationConversationInvite.create({
        data: {
          schoolId: input.schoolId,
          conversationId: input.conversationId,
          invitedUserId: input.invitedUserId,
          invitedById: input.invitedById,
          status: CommunicationInviteStatus.PENDING,
          expiresAt: input.data.expiresAt ?? null,
          metadata: toNullableJson(input.data.metadata),
        },
        select: { id: true },
      });

      const invite = await this.findInviteInTransaction(tx, created.id);
      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(invite),
      );

      return invite;
    });
  }

  async acceptCurrentSchoolInvite(input: {
    inviteId: string;
    actorId: string;
    buildAuditEntry: (
      participant: CommunicationParticipantRecord,
      invite: CommunicationInviteRecord,
    ) => CommunicationParticipantAuditInput;
  }): Promise<CommunicationParticipantRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      const invite = await this.findInviteInTransaction(tx, input.inviteId);
      await tx.communicationConversationInvite.updateMany({
        where: { id: invite.id },
        data: {
          status: CommunicationInviteStatus.ACCEPTED,
          respondedAt: new Date(),
        },
      });

      const participantId = await this.ensureParticipantInTransaction(tx, {
        schoolId: invite.schoolId,
        conversationId: invite.conversationId,
        userId: invite.invitedUserId,
        invitedById: invite.invitedById ?? input.actorId,
      });
      const participant = await this.findParticipantInTransaction(
        tx,
        participantId,
      );
      const updatedInvite = await this.findInviteInTransaction(tx, invite.id);
      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(participant, updatedInvite),
      );

      return participant;
    });
  }

  async rejectCurrentSchoolInvite(input: {
    inviteId: string;
    metadata?: Record<string, unknown> | null;
    buildAuditEntry: (
      invite: CommunicationInviteRecord,
    ) => CommunicationParticipantAuditInput;
  }): Promise<CommunicationInviteRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      await tx.communicationConversationInvite.updateMany({
        where: { id: input.inviteId },
        data: {
          status: CommunicationInviteStatus.REJECTED,
          respondedAt: new Date(),
          ...(input.metadata !== undefined
            ? { metadata: toNullableJson(input.metadata) }
            : {}),
        },
      });

      const invite = await this.findInviteInTransaction(tx, input.inviteId);
      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(invite),
      );

      return invite;
    });
  }

  listCurrentSchoolJoinRequests(
    conversationId: string,
  ): Promise<CommunicationJoinRequestRecord[]> {
    return this.scopedPrisma.communicationConversationJoinRequest.findMany({
      where: { conversationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      ...COMMUNICATION_JOIN_REQUEST_ARGS,
    });
  }

  findCurrentSchoolJoinRequestById(
    requestId: string,
  ): Promise<CommunicationJoinRequestRecord | null> {
    return this.scopedPrisma.communicationConversationJoinRequest.findFirst({
      where: { id: requestId },
      ...COMMUNICATION_JOIN_REQUEST_ARGS,
    });
  }

  hasPendingCurrentSchoolJoinRequest(input: {
    conversationId: string;
    requestedById: string;
  }): Promise<boolean> {
    return this.scopedPrisma.communicationConversationJoinRequest
      .count({
        where: {
          conversationId: input.conversationId,
          requestedById: input.requestedById,
          status: CommunicationJoinRequestStatus.PENDING,
        },
      })
      .then((count) => count > 0);
  }

  async createCurrentSchoolJoinRequest(input: {
    schoolId: string;
    conversationId: string;
    requestedById: string;
    data: CommunicationJoinRequestPersistenceData;
    buildAuditEntry: (
      request: CommunicationJoinRequestRecord,
    ) => CommunicationParticipantAuditInput;
  }): Promise<CommunicationJoinRequestRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      const created = await tx.communicationConversationJoinRequest.create({
        data: {
          schoolId: input.schoolId,
          conversationId: input.conversationId,
          requestedById: input.requestedById,
          status: CommunicationJoinRequestStatus.PENDING,
          note: input.data.note ?? null,
          metadata: toNullableJson(input.data.metadata),
        },
        select: { id: true },
      });

      const request = await this.findJoinRequestInTransaction(tx, created.id);
      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(request),
      );

      return request;
    });
  }

  async approveCurrentSchoolJoinRequest(input: {
    requestId: string;
    actorId: string;
    reviewNote?: string | null;
    buildAuditEntry: (
      participant: CommunicationParticipantRecord,
      request: CommunicationJoinRequestRecord,
    ) => CommunicationParticipantAuditInput;
  }): Promise<CommunicationParticipantRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      const request = await this.findJoinRequestInTransaction(
        tx,
        input.requestId,
      );
      await tx.communicationConversationJoinRequest.updateMany({
        where: { id: request.id },
        data: {
          status: CommunicationJoinRequestStatus.APPROVED,
          reviewedById: input.actorId,
          reviewedAt: new Date(),
          reviewNote: input.reviewNote ?? null,
        },
      });

      const participantId = await this.ensureParticipantInTransaction(tx, {
        schoolId: request.schoolId,
        conversationId: request.conversationId,
        userId: request.requestedById,
        invitedById: input.actorId,
      });
      const participant = await this.findParticipantInTransaction(
        tx,
        participantId,
      );
      const updatedRequest = await this.findJoinRequestInTransaction(
        tx,
        request.id,
      );
      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(participant, updatedRequest),
      );

      return participant;
    });
  }

  async rejectCurrentSchoolJoinRequest(input: {
    requestId: string;
    actorId: string;
    reviewNote?: string | null;
    buildAuditEntry: (
      request: CommunicationJoinRequestRecord,
    ) => CommunicationParticipantAuditInput;
  }): Promise<CommunicationJoinRequestRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      await tx.communicationConversationJoinRequest.updateMany({
        where: { id: input.requestId },
        data: {
          status: CommunicationJoinRequestStatus.REJECTED,
          reviewedById: input.actorId,
          reviewedAt: new Date(),
          reviewNote: input.reviewNote ?? null,
        },
      });

      const request = await this.findJoinRequestInTransaction(
        tx,
        input.requestId,
      );
      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(request),
      );

      return request;
    });
  }

  private async updateParticipantWithAudit(input: {
    participantId: string;
    data: CommunicationParticipantPersistenceData;
    extraData?: Prisma.CommunicationConversationParticipantUncheckedUpdateManyInput;
    buildAuditEntry: (
      participant: CommunicationParticipantRecord,
    ) => CommunicationParticipantAuditInput;
  }): Promise<CommunicationParticipantRecord> {
    return this.scopedPrisma.$transaction(async (tx) => {
      const updateData = this.toParticipantUpdateInput(input.data);
      await tx.communicationConversationParticipant.updateMany({
        where: { id: input.participantId },
        data: {
          ...updateData,
          ...(input.extraData ?? {}),
        },
      });

      const participant = await this.findParticipantInTransaction(
        tx,
        input.participantId,
      );
      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(participant),
      );

      return participant;
    });
  }

  private async createParticipantInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      schoolId: string;
      conversationId: string;
      userId: string;
      invitedById?: string | null;
      data: CommunicationParticipantPersistenceData;
    },
  ): Promise<string> {
    const created = await tx.communicationConversationParticipant.create({
      data: {
        schoolId: input.schoolId,
        conversationId: input.conversationId,
        userId: input.userId,
        role: input.data.role ?? CommunicationParticipantRole.MEMBER,
        status: input.data.status ?? CommunicationParticipantStatus.ACTIVE,
        invitedById: input.invitedById ?? null,
        mutedUntil: input.data.mutedUntil ?? null,
        metadata: toNullableJson(input.data.metadata),
      },
      select: { id: true },
    });

    return created.id;
  }

  private async ensureParticipantInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      schoolId: string;
      conversationId: string;
      userId: string;
      invitedById?: string | null;
    },
  ): Promise<string> {
    const existing = await tx.communicationConversationParticipant.findFirst({
      where: {
        conversationId: input.conversationId,
        userId: input.userId,
      },
      select: { id: true, status: true },
    });

    if (!existing) {
      return this.createParticipantInTransaction(tx, {
        schoolId: input.schoolId,
        conversationId: input.conversationId,
        userId: input.userId,
        invitedById: input.invitedById,
        data: {
          role: CommunicationParticipantRole.MEMBER,
          status: CommunicationParticipantStatus.ACTIVE,
        },
      });
    }

    if (
      existing.status === CommunicationParticipantStatus.ACTIVE ||
      existing.status === CommunicationParticipantStatus.MUTED
    ) {
      return existing.id;
    }

    return this.updateParticipantInTransaction(tx, existing.id, {
      role: CommunicationParticipantRole.MEMBER,
      status: CommunicationParticipantStatus.ACTIVE,
      invitedById: input.invitedById ?? null,
      joinedAt: new Date(),
      leftAt: null,
      removedAt: null,
      removedById: null,
      mutedUntil: null,
    });
  }

  private async updateParticipantInTransaction(
    tx: Prisma.TransactionClient,
    participantId: string,
    data: CommunicationParticipantPersistenceData &
      Pick<
        Prisma.CommunicationConversationParticipantUncheckedUpdateManyInput,
        | 'invitedById'
        | 'joinedAt'
        | 'leftAt'
        | 'removedAt'
        | 'removedById'
      >,
  ): Promise<string> {
    const extraData: Prisma.CommunicationConversationParticipantUncheckedUpdateManyInput =
      {};
    if (Object.prototype.hasOwnProperty.call(data, 'invitedById')) {
      extraData.invitedById = data.invitedById;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'joinedAt')) {
      extraData.joinedAt = data.joinedAt;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'leftAt')) {
      extraData.leftAt = data.leftAt;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'removedAt')) {
      extraData.removedAt = data.removedAt;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'removedById')) {
      extraData.removedById = data.removedById;
    }

    await tx.communicationConversationParticipant.updateMany({
      where: { id: participantId },
      data: {
        ...this.toParticipantUpdateInput(data),
        ...extraData,
      },
    });

    return participantId;
  }

  private async findParticipantInTransaction(
    tx: Prisma.TransactionClient,
    participantId: string,
  ): Promise<CommunicationParticipantRecord> {
    const participant =
      await tx.communicationConversationParticipant.findFirst({
        where: { id: participantId },
        ...COMMUNICATION_PARTICIPANT_ARGS,
      });

    if (!participant) {
      throw new Error('Communication participant mutation result was not found');
    }

    return participant;
  }

  private async findInviteInTransaction(
    tx: Prisma.TransactionClient,
    inviteId: string,
  ): Promise<CommunicationInviteRecord> {
    const invite = await tx.communicationConversationInvite.findFirst({
      where: { id: inviteId },
      ...COMMUNICATION_INVITE_ARGS,
    });

    if (!invite) {
      throw new Error('Communication invite mutation result was not found');
    }

    return invite;
  }

  private async findJoinRequestInTransaction(
    tx: Prisma.TransactionClient,
    requestId: string,
  ): Promise<CommunicationJoinRequestRecord> {
    const request = await tx.communicationConversationJoinRequest.findFirst({
      where: { id: requestId },
      ...COMMUNICATION_JOIN_REQUEST_ARGS,
    });

    if (!request) {
      throw new Error(
        'Communication join request mutation result was not found',
      );
    }

    return request;
  }

  private createAuditLogInTransaction(
    tx: Prisma.TransactionClient,
    entry: CommunicationParticipantAuditInput,
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

  private toParticipantUpdateInput(
    data: CommunicationParticipantPersistenceData,
  ): Prisma.CommunicationConversationParticipantUncheckedUpdateManyInput {
    const output: Prisma.CommunicationConversationParticipantUncheckedUpdateManyInput =
      {};

    if (Object.prototype.hasOwnProperty.call(data, 'role')) {
      output.role = data.role;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'status')) {
      output.status = data.status;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'mutedUntil')) {
      output.mutedUntil = data.mutedUntil ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'metadata')) {
      output.metadata = toNullableJson(data.metadata);
    }

    return output;
  }
}

function toNullableJson(
  value: unknown,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}
