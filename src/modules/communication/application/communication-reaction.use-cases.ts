import { Injectable } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import { getRequestContext } from '../../../common/context/request-context';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import {
  CommunicationScope,
  requireCommunicationScope,
} from '../communication-context';
import {
  assertCanDeleteReaction,
  assertMessageAllowsReaction,
  assertParticipantAllowsReaction,
  assertReactionAllowedByPolicy,
  normalizeCommunicationReactionType,
  PlainCommunicationReaction,
  PlainReactionConversation,
  PlainReactionMessage,
  PlainReactionParticipant,
} from '../domain/communication-reaction-domain';
import { CommunicationConversationNotMemberException } from '../domain/communication-participant-domain';
import { buildDefaultCommunicationPolicy } from '../domain/communication-policy-domain';
import { UpsertCommunicationReactionDto } from '../dto/communication-reaction.dto';
import {
  CommunicationMessageReactionAccessRecord,
  CommunicationMessageReactionParticipantAccessRecord,
  CommunicationMessageReactionRecord,
  CommunicationReactionAuditInput,
  CommunicationReactionRepository,
} from '../infrastructure/communication-reaction.repository';
import { CommunicationPolicyRepository } from '../infrastructure/communication-policy.repository';
import {
  presentCommunicationReaction,
  presentCommunicationReactionList,
  summarizeCommunicationReactionForAudit,
} from '../presenters/communication-reaction.presenter';

@Injectable()
export class ListCommunicationMessageReactionsUseCase {
  constructor(
    private readonly communicationReactionRepository: CommunicationReactionRepository,
  ) {}

  async execute(messageId: string) {
    const scope = requireCommunicationScope();
    const message = await requireMessageForReactionAccess(
      this.communicationReactionRepository,
      messageId,
    );
    await assertActorCanViewMessageReactions({
      repository: this.communicationReactionRepository,
      conversationId: message.conversationId,
      actorId: scope.actorId,
    });

    const result =
      await this.communicationReactionRepository.listCurrentSchoolMessageReactions(
        {
          messageId: message.id,
        },
      );

    return presentCommunicationReactionList(result);
  }
}

@Injectable()
export class UpsertCommunicationMessageReactionUseCase {
  constructor(
    private readonly communicationReactionRepository: CommunicationReactionRepository,
    private readonly communicationPolicyRepository: CommunicationPolicyRepository,
  ) {}

  async execute(messageId: string, command: UpsertCommunicationReactionDto) {
    const scope = requireCommunicationScope();
    const [message, policy] = await Promise.all([
      requireMessageForReactionAccess(
        this.communicationReactionRepository,
        messageId,
      ),
      loadPolicy(this.communicationPolicyRepository),
    ]);
    const participant = await requireActorParticipantForReaction({
      repository: this.communicationReactionRepository,
      conversationId: message.conversationId,
      actorId: scope.actorId,
    });
    const reactionKey = normalizeCommunicationReactionType(command.type);

    assertReactionAllowedByPolicy(policy);
    assertMessageAllowsReaction({
      conversation: toPlainConversation(message.conversation),
      message: toPlainMessage(message),
    });
    assertParticipantAllowsReaction(toPlainParticipant(participant));

    const reaction =
      await this.communicationReactionRepository.upsertCurrentSchoolMessageReaction(
        {
          schoolId: scope.schoolId,
          conversationId: message.conversationId,
          messageId: message.id,
          actorId: scope.actorId,
          reactionKey,
          emoji: null,
          buildAuditEntry: (next, before) =>
            buildCommunicationReactionAuditEntry({
              scope,
              action: 'communication.message_reaction.upsert',
              reaction: next,
              before,
              changedFields: ['reactionKey', 'emoji'],
            }),
        },
      );

    return presentCommunicationReaction(reaction);
  }
}

@Injectable()
export class DeleteCommunicationMessageReactionUseCase {
  constructor(
    private readonly communicationReactionRepository: CommunicationReactionRepository,
    private readonly communicationPolicyRepository: CommunicationPolicyRepository,
  ) {}

  async execute(messageId: string) {
    const scope = requireCommunicationScope();
    const [message, policy] = await Promise.all([
      requireMessageForReactionAccess(
        this.communicationReactionRepository,
        messageId,
      ),
      loadPolicy(this.communicationPolicyRepository),
    ]);
    const [participant, reaction] = await Promise.all([
      requireActorParticipantForReaction({
        repository: this.communicationReactionRepository,
        conversationId: message.conversationId,
        actorId: scope.actorId,
      }),
      this.communicationReactionRepository.findCurrentSchoolReactionForActor({
        messageId: message.id,
        actorId: scope.actorId,
      }),
    ]);

    if (!reaction) {
      throw new NotFoundDomainException('Reaction not found', {
        messageId: message.id,
      });
    }

    assertReactionAllowedByPolicy(policy);
    assertMessageAllowsReaction({
      conversation: toPlainConversation(message.conversation),
      message: toPlainMessage(message),
    });
    assertParticipantAllowsReaction(toPlainParticipant(participant));
    assertCanDeleteReaction({
      reaction: toPlainReaction(reaction),
      actorId: scope.actorId,
      canManageReaction: canManageMessageReactions(),
    });

    return this.communicationReactionRepository.deleteCurrentSchoolMessageReaction(
      {
        reactionId: reaction.id,
        buildAuditEntry: (deleted) =>
          buildCommunicationReactionAuditEntry({
            scope,
            action: 'communication.message_reaction.delete',
            reaction: deleted,
            before: deleted,
            changedFields: ['deleted'],
          }),
      },
    );
  }
}

async function requireMessageForReactionAccess(
  repository: CommunicationReactionRepository,
  messageId: string,
): Promise<CommunicationMessageReactionAccessRecord> {
  const message =
    await repository.findMessageForReactionOrAttachmentAccess(messageId);
  if (!message) {
    throw new NotFoundDomainException('Message not found', { messageId });
  }

  return message;
}

async function requireActorParticipantForReaction(params: {
  repository: CommunicationReactionRepository;
  conversationId: string;
  actorId: string;
}): Promise<CommunicationMessageReactionParticipantAccessRecord> {
  const participant = await params.repository.findActiveParticipantForActor({
    conversationId: params.conversationId,
    actorId: params.actorId,
  });

  if (!participant) {
    throw new CommunicationConversationNotMemberException({
      conversationId: params.conversationId,
    });
  }

  return participant;
}

async function assertActorCanViewMessageReactions(params: {
  repository: CommunicationReactionRepository;
  conversationId: string;
  actorId: string;
}): Promise<void> {
  const participant = await params.repository.findActiveParticipantForActor({
    conversationId: params.conversationId,
    actorId: params.actorId,
  });

  if (participant) return;
  if (canViewMessagesWithoutParticipant()) return;

  throw new CommunicationConversationNotMemberException({
    conversationId: params.conversationId,
  });
}

async function loadPolicy(repository: CommunicationPolicyRepository) {
  return (
    (await repository.findCurrentSchoolPolicy()) ??
    buildDefaultCommunicationPolicy()
  );
}

function canViewMessagesWithoutParticipant(): boolean {
  return hasAnyPermission(
    'communication.messages.moderate',
    'communication.conversations.manage',
    'communication.admin.view',
    'communication.admin.manage',
  );
}

function canManageMessageReactions(): boolean {
  return hasAnyPermission(
    'communication.messages.moderate',
    'communication.admin.manage',
  );
}

function hasAnyPermission(...permissions: string[]): boolean {
  const ctx = getRequestContext();
  const granted = new Set(ctx?.activeMembership?.permissions ?? []);
  return permissions.some((permission) => granted.has(permission));
}

function toPlainConversation(
  conversation: CommunicationMessageReactionAccessRecord['conversation'],
): PlainReactionConversation {
  return {
    id: conversation.id,
    status: conversation.status,
  };
}

function toPlainMessage(
  message: CommunicationMessageReactionAccessRecord,
): PlainReactionMessage {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderUserId: message.senderUserId,
    status: message.status,
    hiddenAt: message.hiddenAt,
    deletedAt: message.deletedAt,
  };
}

function toPlainParticipant(
  participant: CommunicationMessageReactionParticipantAccessRecord,
): PlainReactionParticipant {
  return {
    id: participant.id,
    conversationId: participant.conversationId,
    userId: participant.userId,
    role: participant.role,
    status: participant.status,
    mutedUntil: participant.mutedUntil,
  };
}

function toPlainReaction(
  reaction: CommunicationMessageReactionRecord,
): PlainCommunicationReaction {
  return {
    id: reaction.id,
    messageId: reaction.messageId,
    userId: reaction.userId,
    reactionKey: reaction.reactionKey,
  };
}

function buildCommunicationReactionAuditEntry(params: {
  scope: CommunicationScope;
  action:
    | 'communication.message_reaction.upsert'
    | 'communication.message_reaction.delete';
  reaction: CommunicationMessageReactionRecord;
  before?: CommunicationMessageReactionRecord | null;
  changedFields: string[];
}): CommunicationReactionAuditInput {
  return {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'communication',
    action: params.action,
    resourceType: 'communication_message_reaction',
    resourceId: params.reaction.id,
    outcome: AuditOutcome.SUCCESS,
    before: params.before
      ? {
          targetSchoolId: params.scope.schoolId,
          reaction: summarizeCommunicationReactionForAudit(params.before),
        }
      : undefined,
    after: {
      targetSchoolId: params.scope.schoolId,
      actorId: params.scope.actorId,
      changedFields: params.changedFields,
      conversationId: params.reaction.conversationId,
      messageId: params.reaction.messageId,
      reactionId: params.reaction.id,
      reaction: summarizeCommunicationReactionForAudit(params.reaction),
    },
  };
}
