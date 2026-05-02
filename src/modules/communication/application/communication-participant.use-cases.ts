import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  CommunicationInviteStatus,
  CommunicationJoinRequestStatus,
  CommunicationParticipantRole,
  CommunicationParticipantStatus,
} from '@prisma/client';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import {
  CommunicationScope,
  requireCommunicationScope,
} from '../communication-context';
import { hasOwn } from '../domain/communication-conversation-domain';
import {
  assertCanAcceptInvite,
  assertCanAddParticipant,
  assertCanApproveJoinRequest,
  assertCanCreateInvite,
  assertCanCreateJoinRequest,
  assertCanDemoteParticipant,
  assertCanLeaveConversation,
  assertCanPromoteParticipant,
  assertCanRejectInvite,
  assertCanRejectJoinRequest,
  assertCanRemoveParticipant,
  assertCanUpdateParticipant,
  CommunicationParticipantAlreadyExistsException,
  isActiveCommunicationParticipantStatus,
  normalizeCommunicationParticipantRole,
  normalizeCommunicationParticipantStatus,
  ParticipantMutationConversationStatus,
  PlainCommunicationInvite,
  PlainCommunicationJoinRequest,
  PlainCommunicationParticipant,
} from '../domain/communication-participant-domain';
import { buildDefaultCommunicationPolicy } from '../domain/communication-policy-domain';
import {
  AddCommunicationParticipantDto,
  ApproveCommunicationJoinRequestDto,
  CreateCommunicationInviteDto,
  CreateCommunicationJoinRequestDto,
  DemoteCommunicationParticipantDto,
  PromoteCommunicationParticipantDto,
  RejectCommunicationInviteDto,
  RejectCommunicationJoinRequestDto,
  UpdateCommunicationParticipantDto,
} from '../dto/communication-participant.dto';
import {
  CommunicationConversationParticipantReferenceRecord,
  CommunicationInviteRecord,
  CommunicationJoinRequestRecord,
  CommunicationParticipantAuditInput,
  CommunicationParticipantPersistenceData,
  CommunicationParticipantRecord,
  CommunicationParticipantRepository,
} from '../infrastructure/communication-participant.repository';
import { CommunicationPolicyRepository } from '../infrastructure/communication-policy.repository';
import {
  presentCommunicationInvite,
  presentCommunicationInviteList,
  summarizeCommunicationInviteForAudit,
} from '../presenters/communication-invite.presenter';
import {
  presentCommunicationJoinRequest,
  presentCommunicationJoinRequestList,
  summarizeCommunicationJoinRequestForAudit,
} from '../presenters/communication-join-request.presenter';
import {
  presentCommunicationParticipant,
  presentCommunicationParticipantList,
  summarizeCommunicationParticipantForAudit,
} from '../presenters/communication-participant.presenter';

@Injectable()
export class ListCommunicationParticipantsUseCase {
  constructor(
    private readonly communicationParticipantRepository: CommunicationParticipantRepository,
  ) {}

  async execute(conversationId: string) {
    requireCommunicationScope();
    await requireConversation(
      this.communicationParticipantRepository,
      conversationId,
    );
    const participants =
      await this.communicationParticipantRepository.listCurrentSchoolParticipants(
        conversationId,
      );

    return presentCommunicationParticipantList(participants);
  }
}

@Injectable()
export class AddCommunicationParticipantUseCase {
  constructor(
    private readonly communicationParticipantRepository: CommunicationParticipantRepository,
    private readonly communicationPolicyRepository: CommunicationPolicyRepository,
  ) {}

  async execute(
    conversationId: string,
    command: AddCommunicationParticipantDto,
  ) {
    const scope = requireCommunicationScope();
    const conversation = await requireConversation(
      this.communicationParticipantRepository,
      conversationId,
    );
    const policy = await loadPolicy(this.communicationPolicyRepository);
    await requireTargetUser(
      this.communicationParticipantRepository,
      command.userId,
    );

    const existing =
      await this.communicationParticipantRepository.findCurrentSchoolParticipantByUserId(
        { conversationId, userId: command.userId },
      );
    const role = normalizeCommunicationParticipantRole(
      command.role ?? 'member',
    ) as CommunicationParticipantRole;
    const status = normalizeCommunicationParticipantStatus(
      command.status ?? 'active',
    ) as CommunicationParticipantStatus;

    assertCanAddParticipant({
      policy,
      conversationStatus: conversation.status as ParticipantMutationConversationStatus,
      existingParticipant: existing ? toPlainParticipant(existing) : null,
      role,
      status,
    });

    const data: CommunicationParticipantPersistenceData = {
      role,
      status,
      mutedUntil: parseOptionalDate(command.mutedUntil),
      metadata: command.metadata ?? null,
    };

    const participant =
      await this.communicationParticipantRepository.addCurrentSchoolParticipant({
        schoolId: scope.schoolId,
        conversationId,
        userId: command.userId,
        actorId: scope.actorId,
        data,
        buildAuditEntry: (created, before) =>
          buildParticipantAuditEntry({
            scope,
            action: 'communication.participant.add',
            participant: created,
            before,
            changedFields: ['role', 'status', 'mutedUntil', 'metadata'],
          }),
      });

    return presentCommunicationParticipant(participant);
  }
}

@Injectable()
export class UpdateCommunicationParticipantUseCase {
  constructor(
    private readonly communicationParticipantRepository: CommunicationParticipantRepository,
    private readonly communicationPolicyRepository: CommunicationPolicyRepository,
  ) {}

  async execute(
    conversationId: string,
    participantId: string,
    command: UpdateCommunicationParticipantDto,
  ) {
    const scope = requireCommunicationScope();
    const conversation = await requireConversation(
      this.communicationParticipantRepository,
      conversationId,
    );
    const existing = await requireParticipant(
      this.communicationParticipantRepository,
      conversationId,
      participantId,
    );
    const policy = await loadPolicy(this.communicationPolicyRepository);
    const activeOwnerCount =
      await this.communicationParticipantRepository.countActiveOwners(
        conversationId,
      );

    const role = command.role
      ? (normalizeCommunicationParticipantRole(
          command.role,
        ) as CommunicationParticipantRole)
      : undefined;
    const status = command.status
      ? (normalizeCommunicationParticipantStatus(
          command.status,
        ) as CommunicationParticipantStatus)
      : undefined;

    assertCanUpdateParticipant({
      policy,
      conversationStatus: conversation.status as ParticipantMutationConversationStatus,
      participant: toPlainParticipant(existing),
      activeOwnerCount,
      role,
      status,
      metadata: command.metadata,
    });

    const data = buildParticipantUpdateData(existing, command, role, status);
    const updated =
      await this.communicationParticipantRepository.updateCurrentSchoolParticipant(
        {
          participantId,
          data,
          buildAuditEntry: (participant) =>
            buildParticipantAuditEntry({
              scope,
              action: 'communication.participant.update',
              participant,
              before: existing,
              changedFields: buildParticipantChangedFields(command),
            }),
        },
      );

    return presentCommunicationParticipant(updated);
  }
}

@Injectable()
export class RemoveCommunicationParticipantUseCase {
  constructor(
    private readonly communicationParticipantRepository: CommunicationParticipantRepository,
    private readonly communicationPolicyRepository: CommunicationPolicyRepository,
  ) {}

  async execute(conversationId: string, participantId: string) {
    const scope = requireCommunicationScope();
    const conversation = await requireConversation(
      this.communicationParticipantRepository,
      conversationId,
    );
    const existing = await requireParticipant(
      this.communicationParticipantRepository,
      conversationId,
      participantId,
    );
    const policy = await loadPolicy(this.communicationPolicyRepository);
    const activeOwnerCount =
      await this.communicationParticipantRepository.countActiveOwners(
        conversationId,
      );

    assertCanRemoveParticipant({
      policy,
      conversationStatus: conversation.status as ParticipantMutationConversationStatus,
      participant: toPlainParticipant(existing),
      activeOwnerCount,
    });

    const removed =
      await this.communicationParticipantRepository.removeCurrentSchoolParticipant(
        {
          participantId,
          actorId: scope.actorId,
          buildAuditEntry: (participant) =>
            buildParticipantAuditEntry({
              scope,
              action: 'communication.participant.remove',
              participant,
              before: existing,
              changedFields: ['status', 'removedAt', 'removedById'],
            }),
        },
      );

    return presentCommunicationParticipant(removed);
  }
}

@Injectable()
export class LeaveCommunicationConversationUseCase {
  constructor(
    private readonly communicationParticipantRepository: CommunicationParticipantRepository,
    private readonly communicationPolicyRepository: CommunicationPolicyRepository,
  ) {}

  async execute(conversationId: string) {
    const scope = requireCommunicationScope();
    const conversation = await requireConversation(
      this.communicationParticipantRepository,
      conversationId,
    );
    const existing =
      await this.communicationParticipantRepository.findCurrentSchoolParticipantByUserId(
        { conversationId, userId: scope.actorId },
      );
    if (!existing) {
      throw new NotFoundDomainException('Participant not found', {
        conversationId,
      });
    }
    const policy = await loadPolicy(this.communicationPolicyRepository);
    const activeOwnerCount =
      await this.communicationParticipantRepository.countActiveOwners(
        conversationId,
      );

    assertCanLeaveConversation({
      policy,
      conversationStatus: conversation.status as ParticipantMutationConversationStatus,
      participant: toPlainParticipant(existing),
      activeOwnerCount,
    });

    const left =
      await this.communicationParticipantRepository.leaveCurrentSchoolConversation(
        {
          participantId: existing.id,
          buildAuditEntry: (participant) =>
            buildParticipantAuditEntry({
              scope,
              action: 'communication.participant.leave',
              participant,
              before: existing,
              changedFields: ['status', 'leftAt'],
            }),
        },
      );

    return presentCommunicationParticipant(left);
  }
}

@Injectable()
export class PromoteCommunicationParticipantUseCase {
  constructor(
    private readonly communicationParticipantRepository: CommunicationParticipantRepository,
    private readonly communicationPolicyRepository: CommunicationPolicyRepository,
  ) {}

  async execute(
    conversationId: string,
    participantId: string,
    command: PromoteCommunicationParticipantDto,
  ) {
    const scope = requireCommunicationScope();
    const conversation = await requireConversation(
      this.communicationParticipantRepository,
      conversationId,
    );
    const existing = await requireParticipant(
      this.communicationParticipantRepository,
      conversationId,
      participantId,
    );
    const policy = await loadPolicy(this.communicationPolicyRepository);
    const targetRole = command.targetRole
      ? normalizeCommunicationParticipantRole(command.targetRole)
      : undefined;
    const role = assertCanPromoteParticipant({
      policy,
      conversationStatus: conversation.status as ParticipantMutationConversationStatus,
      participant: toPlainParticipant(existing),
      targetRole,
    }) as CommunicationParticipantRole;

    const promoted =
      await this.communicationParticipantRepository.promoteCurrentSchoolParticipant(
        {
          participantId,
          role,
          buildAuditEntry: (participant) =>
            buildParticipantAuditEntry({
              scope,
              action: 'communication.participant.promote',
              participant,
              before: existing,
              changedFields: ['role'],
            }),
        },
      );

    return presentCommunicationParticipant(promoted);
  }
}

@Injectable()
export class DemoteCommunicationParticipantUseCase {
  constructor(
    private readonly communicationParticipantRepository: CommunicationParticipantRepository,
    private readonly communicationPolicyRepository: CommunicationPolicyRepository,
  ) {}

  async execute(
    conversationId: string,
    participantId: string,
    command: DemoteCommunicationParticipantDto,
  ) {
    const scope = requireCommunicationScope();
    const conversation = await requireConversation(
      this.communicationParticipantRepository,
      conversationId,
    );
    const existing = await requireParticipant(
      this.communicationParticipantRepository,
      conversationId,
      participantId,
    );
    const policy = await loadPolicy(this.communicationPolicyRepository);
    const activeOwnerCount =
      await this.communicationParticipantRepository.countActiveOwners(
        conversationId,
      );
    const targetRole = command.targetRole
      ? normalizeCommunicationParticipantRole(command.targetRole)
      : undefined;
    const role = assertCanDemoteParticipant({
      policy,
      conversationStatus: conversation.status as ParticipantMutationConversationStatus,
      participant: toPlainParticipant(existing),
      activeOwnerCount,
      targetRole,
    }) as CommunicationParticipantRole;

    const demoted =
      await this.communicationParticipantRepository.demoteCurrentSchoolParticipant(
        {
          participantId,
          role,
          buildAuditEntry: (participant) =>
            buildParticipantAuditEntry({
              scope,
              action: 'communication.participant.demote',
              participant,
              before: existing,
              changedFields: ['role'],
            }),
        },
      );

    return presentCommunicationParticipant(demoted);
  }
}

@Injectable()
export class ListCommunicationInvitesUseCase {
  constructor(
    private readonly communicationParticipantRepository: CommunicationParticipantRepository,
  ) {}

  async execute(conversationId: string) {
    requireCommunicationScope();
    await requireConversation(
      this.communicationParticipantRepository,
      conversationId,
    );
    const invites =
      await this.communicationParticipantRepository.listCurrentSchoolInvites(
        conversationId,
      );

    return presentCommunicationInviteList(invites);
  }
}

@Injectable()
export class CreateCommunicationInviteUseCase {
  constructor(
    private readonly communicationParticipantRepository: CommunicationParticipantRepository,
    private readonly communicationPolicyRepository: CommunicationPolicyRepository,
  ) {}

  async execute(conversationId: string, command: CreateCommunicationInviteDto) {
    const scope = requireCommunicationScope();
    const conversation = await requireConversation(
      this.communicationParticipantRepository,
      conversationId,
    );
    const policy = await loadPolicy(this.communicationPolicyRepository);
    await requireTargetUser(
      this.communicationParticipantRepository,
      command.invitedUserId,
    );
    const [existingParticipant, hasPendingInvite] = await Promise.all([
      this.communicationParticipantRepository.findCurrentSchoolParticipantByUserId(
        { conversationId, userId: command.invitedUserId },
      ),
      this.communicationParticipantRepository.hasPendingCurrentSchoolInvite({
        conversationId,
        invitedUserId: command.invitedUserId,
      }),
    ]);

    assertCanCreateInvite({
      policy,
      conversationStatus: conversation.status as ParticipantMutationConversationStatus,
      existingParticipant: existingParticipant
        ? toPlainParticipant(existingParticipant)
        : null,
      hasPendingInvite,
    });

    const invite =
      await this.communicationParticipantRepository.createCurrentSchoolInvite({
        schoolId: scope.schoolId,
        conversationId,
        invitedUserId: command.invitedUserId,
        invitedById: scope.actorId,
        data: {
          expiresAt: parseOptionalDate(command.expiresAt),
          metadata: command.metadata ?? null,
        },
        buildAuditEntry: (created) =>
          buildInviteAuditEntry({
            scope,
            action: 'communication.invite.create',
            invite: created,
            changedFields: ['status', 'expiresAt', 'metadata'],
          }),
      });

    return presentCommunicationInvite(invite);
  }
}

@Injectable()
export class AcceptCommunicationInviteUseCase {
  constructor(
    private readonly communicationParticipantRepository: CommunicationParticipantRepository,
    private readonly communicationPolicyRepository: CommunicationPolicyRepository,
  ) {}

  async execute(inviteId: string) {
    const scope = requireCommunicationScope();
    const invite = await requireInvite(
      this.communicationParticipantRepository,
      inviteId,
    );
    const conversation = await requireConversation(
      this.communicationParticipantRepository,
      invite.conversationId,
    );
    const policy = await loadPolicy(this.communicationPolicyRepository);
    const existingParticipant =
      await this.communicationParticipantRepository.findCurrentSchoolParticipantByUserId(
        { conversationId: invite.conversationId, userId: invite.invitedUserId },
      );
    if (
      existingParticipant &&
      !isActiveCommunicationParticipantStatus(existingParticipant.status)
    ) {
      assertCanAddParticipant({
        policy,
        conversationStatus: conversation.status as ParticipantMutationConversationStatus,
        existingParticipant: toPlainParticipant(existingParticipant),
        role: 'MEMBER',
        status: 'ACTIVE',
      });
    }

    assertCanAcceptInvite({
      policy,
      conversationStatus: conversation.status as ParticipantMutationConversationStatus,
      invite: toPlainInvite(invite),
      actorId: scope.actorId,
    });

    const participant =
      await this.communicationParticipantRepository.acceptCurrentSchoolInvite({
        inviteId,
        actorId: scope.actorId,
        buildAuditEntry: (createdParticipant, acceptedInvite) =>
          buildInviteAuditEntry({
            scope,
            action: 'communication.invite.accept',
            invite: acceptedInvite,
            participant: createdParticipant,
            before: invite,
            changedFields: ['status', 'respondedAt'],
          }),
      });

    return presentCommunicationParticipant(participant);
  }
}

@Injectable()
export class RejectCommunicationInviteUseCase {
  constructor(
    private readonly communicationParticipantRepository: CommunicationParticipantRepository,
    private readonly communicationPolicyRepository: CommunicationPolicyRepository,
  ) {}

  async execute(inviteId: string, command: RejectCommunicationInviteDto) {
    const scope = requireCommunicationScope();
    const invite = await requireInvite(
      this.communicationParticipantRepository,
      inviteId,
    );
    const conversation = await requireConversation(
      this.communicationParticipantRepository,
      invite.conversationId,
    );
    const policy = await loadPolicy(this.communicationPolicyRepository);

    assertCanRejectInvite({
      policy,
      conversationStatus: conversation.status as ParticipantMutationConversationStatus,
      invite: toPlainInvite(invite),
      actorId: scope.actorId,
    });

    const rejected =
      await this.communicationParticipantRepository.rejectCurrentSchoolInvite({
        inviteId,
        metadata: command.reason
          ? mergeMetadata(invite.metadata, {
              rejectionReason: command.reason.trim(),
            })
          : undefined,
        buildAuditEntry: (updated) =>
          buildInviteAuditEntry({
            scope,
            action: 'communication.invite.reject',
            invite: updated,
            before: invite,
            changedFields: ['status', 'respondedAt', 'metadata'],
          }),
      });

    return presentCommunicationInvite(rejected);
  }
}

@Injectable()
export class ListCommunicationJoinRequestsUseCase {
  constructor(
    private readonly communicationParticipantRepository: CommunicationParticipantRepository,
  ) {}

  async execute(conversationId: string) {
    requireCommunicationScope();
    await requireConversation(
      this.communicationParticipantRepository,
      conversationId,
    );
    const requests =
      await this.communicationParticipantRepository.listCurrentSchoolJoinRequests(
        conversationId,
      );

    return presentCommunicationJoinRequestList(requests);
  }
}

@Injectable()
export class CreateCommunicationJoinRequestUseCase {
  constructor(
    private readonly communicationParticipantRepository: CommunicationParticipantRepository,
    private readonly communicationPolicyRepository: CommunicationPolicyRepository,
  ) {}

  async execute(
    conversationId: string,
    command: CreateCommunicationJoinRequestDto,
  ) {
    const scope = requireCommunicationScope();
    const conversation = await requireConversation(
      this.communicationParticipantRepository,
      conversationId,
    );
    const policy = await loadPolicy(this.communicationPolicyRepository);
    const [existingParticipant, hasPendingJoinRequest] = await Promise.all([
      this.communicationParticipantRepository.findCurrentSchoolParticipantByUserId(
        { conversationId, userId: scope.actorId },
      ),
      this.communicationParticipantRepository.hasPendingCurrentSchoolJoinRequest({
        conversationId,
        requestedById: scope.actorId,
      }),
    ]);

    assertCanCreateJoinRequest({
      policy,
      conversationStatus: conversation.status as ParticipantMutationConversationStatus,
      existingParticipant: existingParticipant
        ? toPlainParticipant(existingParticipant)
        : null,
      hasPendingJoinRequest,
    });

    const request =
      await this.communicationParticipantRepository.createCurrentSchoolJoinRequest(
        {
          schoolId: scope.schoolId,
          conversationId,
          requestedById: scope.actorId,
          data: {
            note: normalizeOptionalText(command.note),
            metadata: command.metadata ?? null,
          },
          buildAuditEntry: (created) =>
            buildJoinRequestAuditEntry({
              scope,
              action: 'communication.join_request.create',
              joinRequest: created,
              changedFields: ['status', 'note', 'metadata'],
            }),
        },
      );

    return presentCommunicationJoinRequest(request);
  }
}

@Injectable()
export class ApproveCommunicationJoinRequestUseCase {
  constructor(
    private readonly communicationParticipantRepository: CommunicationParticipantRepository,
    private readonly communicationPolicyRepository: CommunicationPolicyRepository,
  ) {}

  async execute(
    requestId: string,
    command: ApproveCommunicationJoinRequestDto,
  ) {
    const scope = requireCommunicationScope();
    const joinRequest = await requireJoinRequest(
      this.communicationParticipantRepository,
      requestId,
    );
    const conversation = await requireConversation(
      this.communicationParticipantRepository,
      joinRequest.conversationId,
    );
    const policy = await loadPolicy(this.communicationPolicyRepository);
    const existingParticipant =
      await this.communicationParticipantRepository.findCurrentSchoolParticipantByUserId(
        {
          conversationId: joinRequest.conversationId,
          userId: joinRequest.requestedById,
        },
      );
    if (
      existingParticipant &&
      !isActiveCommunicationParticipantStatus(existingParticipant.status)
    ) {
      assertCanAddParticipant({
        policy,
        conversationStatus: conversation.status as ParticipantMutationConversationStatus,
        existingParticipant: toPlainParticipant(existingParticipant),
        role: 'MEMBER',
        status: 'ACTIVE',
      });
    }

    assertCanApproveJoinRequest({
      policy,
      conversationStatus: conversation.status as ParticipantMutationConversationStatus,
      joinRequest: toPlainJoinRequest(joinRequest),
    });

    const participant =
      await this.communicationParticipantRepository.approveCurrentSchoolJoinRequest(
        {
          requestId,
          actorId: scope.actorId,
          reviewNote: normalizeOptionalText(command.reason),
          buildAuditEntry: (createdParticipant, approvedRequest) =>
            buildJoinRequestAuditEntry({
              scope,
              action: 'communication.join_request.approve',
              joinRequest: approvedRequest,
              participant: createdParticipant,
              before: joinRequest,
              changedFields: ['status', 'reviewedAt', 'reviewedById'],
            }),
        },
      );

    return presentCommunicationParticipant(participant);
  }
}

@Injectable()
export class RejectCommunicationJoinRequestUseCase {
  constructor(
    private readonly communicationParticipantRepository: CommunicationParticipantRepository,
    private readonly communicationPolicyRepository: CommunicationPolicyRepository,
  ) {}

  async execute(
    requestId: string,
    command: RejectCommunicationJoinRequestDto,
  ) {
    const scope = requireCommunicationScope();
    const joinRequest = await requireJoinRequest(
      this.communicationParticipantRepository,
      requestId,
    );
    const conversation = await requireConversation(
      this.communicationParticipantRepository,
      joinRequest.conversationId,
    );
    const policy = await loadPolicy(this.communicationPolicyRepository);

    assertCanRejectJoinRequest({
      policy,
      conversationStatus: conversation.status as ParticipantMutationConversationStatus,
      joinRequest: toPlainJoinRequest(joinRequest),
    });

    const rejected =
      await this.communicationParticipantRepository.rejectCurrentSchoolJoinRequest(
        {
          requestId,
          actorId: scope.actorId,
          reviewNote: normalizeOptionalText(command.reason),
          buildAuditEntry: (updated) =>
            buildJoinRequestAuditEntry({
              scope,
              action: 'communication.join_request.reject',
              joinRequest: updated,
              before: joinRequest,
              changedFields: ['status', 'reviewedAt', 'reviewedById'],
            }),
        },
      );

    return presentCommunicationJoinRequest(rejected);
  }
}

async function requireConversation(
  repository: CommunicationParticipantRepository,
  conversationId: string,
): Promise<CommunicationConversationParticipantReferenceRecord> {
  const conversation = await repository.findCurrentSchoolConversationById(
    conversationId,
  );
  if (!conversation) {
    throw new NotFoundDomainException('Conversation not found', {
      conversationId,
    });
  }

  return conversation;
}

async function requireParticipant(
  repository: CommunicationParticipantRepository,
  conversationId: string,
  participantId: string,
): Promise<CommunicationParticipantRecord> {
  const participant = await repository.findCurrentSchoolParticipantById({
    conversationId,
    participantId,
  });
  if (!participant) {
    throw new NotFoundDomainException('Participant not found', {
      participantId,
    });
  }

  return participant;
}

async function requireInvite(
  repository: CommunicationParticipantRepository,
  inviteId: string,
): Promise<CommunicationInviteRecord> {
  const invite = await repository.findCurrentSchoolInviteById(inviteId);
  if (!invite) {
    throw new NotFoundDomainException('Invite not found', { inviteId });
  }

  return invite;
}

async function requireJoinRequest(
  repository: CommunicationParticipantRepository,
  requestId: string,
): Promise<CommunicationJoinRequestRecord> {
  const request = await repository.findCurrentSchoolJoinRequestById(requestId);
  if (!request) {
    throw new NotFoundDomainException('Join request not found', { requestId });
  }

  return request;
}

async function requireTargetUser(
  repository: CommunicationParticipantRepository,
  userId: string,
): Promise<void> {
  const target = await repository.findCurrentSchoolUserForParticipantTarget(
    userId,
  );
  if (!target) {
    throw new NotFoundDomainException('User not found', { userId });
  }
}

async function loadPolicy(repository: CommunicationPolicyRepository) {
  return (
    (await repository.findCurrentSchoolPolicy()) ??
    buildDefaultCommunicationPolicy()
  );
}

function buildParticipantUpdateData(
  existing: CommunicationParticipantRecord,
  command: UpdateCommunicationParticipantDto,
  role?: CommunicationParticipantRole,
  status?: CommunicationParticipantStatus,
): CommunicationParticipantPersistenceData {
  const data: CommunicationParticipantPersistenceData = {};

  if (role) data.role = role;
  if (status) data.status = status;
  if (hasOwn(command, 'mutedUntil')) {
    data.mutedUntil = parseOptionalDate(command.mutedUntil);
  }
  if (hasOwn(command, 'metadata')) {
    data.metadata = mergeMetadata(existing.metadata, command.metadata ?? null);
  }

  return data;
}

function buildParticipantChangedFields(
  command: UpdateCommunicationParticipantDto,
): string[] {
  const fields: string[] = [];
  if (hasOwn(command, 'role')) fields.push('role');
  if (hasOwn(command, 'status')) fields.push('status');
  if (hasOwn(command, 'mutedUntil')) fields.push('mutedUntil');
  if (hasOwn(command, 'metadata')) fields.push('metadata');
  return fields;
}

function buildParticipantAuditEntry(params: {
  scope: CommunicationScope;
  action:
    | 'communication.participant.add'
    | 'communication.participant.update'
    | 'communication.participant.remove'
    | 'communication.participant.leave'
    | 'communication.participant.promote'
    | 'communication.participant.demote';
  participant: CommunicationParticipantRecord;
  before?: CommunicationParticipantRecord | null;
  changedFields: string[];
}): CommunicationParticipantAuditInput {
  return {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'communication',
    action: params.action,
    resourceType: 'communication_participant',
    resourceId: params.participant.id,
    outcome: AuditOutcome.SUCCESS,
    before: params.before
      ? {
          targetSchoolId: params.scope.schoolId,
          participant: summarizeCommunicationParticipantForAudit(
            params.before,
          ),
        }
      : undefined,
    after: {
      targetSchoolId: params.scope.schoolId,
      actorId: params.scope.actorId,
      changedFields: params.changedFields,
      conversationId: params.participant.conversationId,
      participantId: params.participant.id,
      targetUserId: params.participant.userId,
      participant: summarizeCommunicationParticipantForAudit(
        params.participant,
      ),
    },
  };
}

function buildInviteAuditEntry(params: {
  scope: CommunicationScope;
  action:
    | 'communication.invite.create'
    | 'communication.invite.accept'
    | 'communication.invite.reject';
  invite: CommunicationInviteRecord;
  participant?: CommunicationParticipantRecord;
  before?: CommunicationInviteRecord | null;
  changedFields: string[];
}): CommunicationParticipantAuditInput {
  return {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'communication',
    action: params.action,
    resourceType: 'communication_invite',
    resourceId: params.invite.id,
    outcome: AuditOutcome.SUCCESS,
    before: params.before
      ? {
          targetSchoolId: params.scope.schoolId,
          invite: summarizeCommunicationInviteForAudit(params.before),
        }
      : undefined,
    after: {
      targetSchoolId: params.scope.schoolId,
      actorId: params.scope.actorId,
      changedFields: params.changedFields,
      conversationId: params.invite.conversationId,
      inviteId: params.invite.id,
      targetUserId: params.invite.invitedUserId,
      invite: summarizeCommunicationInviteForAudit(params.invite),
      ...(params.participant
        ? {
            participant: summarizeCommunicationParticipantForAudit(
              params.participant,
            ),
          }
        : {}),
    },
  };
}

function buildJoinRequestAuditEntry(params: {
  scope: CommunicationScope;
  action:
    | 'communication.join_request.create'
    | 'communication.join_request.approve'
    | 'communication.join_request.reject';
  joinRequest: CommunicationJoinRequestRecord;
  participant?: CommunicationParticipantRecord;
  before?: CommunicationJoinRequestRecord | null;
  changedFields: string[];
}): CommunicationParticipantAuditInput {
  return {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'communication',
    action: params.action,
    resourceType: 'communication_join_request',
    resourceId: params.joinRequest.id,
    outcome: AuditOutcome.SUCCESS,
    before: params.before
      ? {
          targetSchoolId: params.scope.schoolId,
          joinRequest: summarizeCommunicationJoinRequestForAudit(
            params.before,
          ),
        }
      : undefined,
    after: {
      targetSchoolId: params.scope.schoolId,
      actorId: params.scope.actorId,
      changedFields: params.changedFields,
      conversationId: params.joinRequest.conversationId,
      joinRequestId: params.joinRequest.id,
      targetUserId: params.joinRequest.requestedById,
      joinRequest: summarizeCommunicationJoinRequestForAudit(
        params.joinRequest,
      ),
      ...(params.participant
        ? {
            participant: summarizeCommunicationParticipantForAudit(
              params.participant,
            ),
          }
        : {}),
    },
  };
}

function toPlainParticipant(
  participant: CommunicationParticipantRecord,
): PlainCommunicationParticipant {
  return {
    id: participant.id,
    conversationId: participant.conversationId,
    userId: participant.userId,
    role: participant.role,
    status: participant.status,
    metadata: asPlainMetadata(participant.metadata),
  };
}

function toPlainInvite(invite: CommunicationInviteRecord): PlainCommunicationInvite {
  return {
    id: invite.id,
    conversationId: invite.conversationId,
    invitedUserId: invite.invitedUserId,
    invitedById: invite.invitedById,
    status: invite.status,
  };
}

function toPlainJoinRequest(
  request: CommunicationJoinRequestRecord,
): PlainCommunicationJoinRequest {
  return {
    id: request.id,
    conversationId: request.conversationId,
    requestedById: request.requestedById,
    reviewedById: request.reviewedById,
    status: request.status,
  };
}

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (value === undefined || value === null || value === '') return null;
  return new Date(value);
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function mergeMetadata(
  existing: unknown,
  patch: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (patch === null) return null;
  return {
    ...(asPlainMetadata(existing) ?? {}),
    ...patch,
  };
}

function asPlainMetadata(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
