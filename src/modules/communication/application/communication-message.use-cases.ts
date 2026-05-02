import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  CommunicationMessageKind,
  CommunicationMessageStatus,
} from '@prisma/client';
import { getRequestContext } from '../../../common/context/request-context';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import {
  CommunicationScope,
  requireCommunicationScope,
} from '../communication-context';
import {
  assertConversationAllowsMessageSend,
  assertMessageCanBeDeleted,
  assertMessageCanBeEdited,
  assertMessageCanBeRead,
  assertMessageCreatePayload,
  assertMessageLength,
  assertMessageSendAllowedByPolicy,
  assertParticipantAllowsMessageAccess,
  assertParticipantAllowsMessageRead,
  assertParticipantAllowsMessageSend,
  assertReplyTargetIsValid,
  normalizeCommunicationMessageStatus,
  normalizeCommunicationMessageType,
  normalizeMessageBody,
  PlainCommunicationMessage,
  PlainMessageConversation,
  PlainMessageParticipant,
} from '../domain/communication-message-domain';
import { CommunicationConversationNotMemberException } from '../domain/communication-participant-domain';
import { buildDefaultCommunicationPolicy } from '../domain/communication-policy-domain';
import {
  CreateCommunicationMessageDto,
  ListCommunicationMessagesQueryDto,
  MarkConversationReadDto,
  ReadSummaryQueryDto,
  UpdateCommunicationMessageDto,
} from '../dto/communication-message.dto';
import {
  CommunicationMessageAuditInput,
  CommunicationMessageConversationAccessRecord,
  CommunicationMessageParticipantAccessRecord,
  CommunicationMessageRecord,
  CommunicationMessageRepository,
} from '../infrastructure/communication-message.repository';
import { CommunicationPolicyRepository } from '../infrastructure/communication-policy.repository';
import {
  presentCommunicationMessage,
  presentCommunicationMessageList,
  summarizeCommunicationMessageForAudit,
} from '../presenters/communication-message.presenter';
import {
  presentCommunicationConversationReadResult,
  presentCommunicationMessageReadReceipt,
  presentCommunicationReadSummary,
} from '../presenters/communication-message-read.presenter';

@Injectable()
export class ListCommunicationMessagesUseCase {
  constructor(
    private readonly communicationMessageRepository: CommunicationMessageRepository,
  ) {}

  async execute(
    conversationId: string,
    query: ListCommunicationMessagesQueryDto,
  ) {
    const scope = requireCommunicationScope();
    const conversation = await requireConversationForAccess(
      this.communicationMessageRepository,
      conversationId,
    );
    await assertActorCanViewConversation({
      repository: this.communicationMessageRepository,
      conversationId: conversation.id,
      actorId: scope.actorId,
    });

    const result =
      await this.communicationMessageRepository.listCurrentSchoolMessages({
        conversationId: conversation.id,
        filters: {
          ...(query.type
            ? {
                kind: normalizeCommunicationMessageType(
                  query.type,
                ) as CommunicationMessageKind,
              }
            : {}),
          ...(query.status
            ? {
                status: normalizeCommunicationMessageStatus(
                  query.status,
                ) as CommunicationMessageStatus,
              }
            : {}),
          ...(query.before ? { before: new Date(query.before) } : {}),
          ...(query.after ? { after: new Date(query.after) } : {}),
          ...(query.limit !== undefined ? { limit: query.limit } : {}),
          ...(query.page !== undefined ? { page: query.page } : {}),
        },
      });

    return presentCommunicationMessageList(result);
  }
}

@Injectable()
export class CreateCommunicationMessageUseCase {
  constructor(
    private readonly communicationMessageRepository: CommunicationMessageRepository,
    private readonly communicationPolicyRepository: CommunicationPolicyRepository,
  ) {}

  async execute(
    conversationId: string,
    command: CreateCommunicationMessageDto,
  ) {
    const scope = requireCommunicationScope();
    const [conversation, policy] = await Promise.all([
      requireConversationForAccess(
        this.communicationMessageRepository,
        conversationId,
      ),
      loadPolicy(this.communicationPolicyRepository),
    ]);
    const participant = await requireActorParticipant({
      repository: this.communicationMessageRepository,
      conversationId,
      actorId: scope.actorId,
    });
    const body = normalizeMessageBody(command.body ?? command.content);
    const kind = normalizeCommunicationMessageType(
      command.type ?? 'text',
    ) as CommunicationMessageKind;

    assertMessageSendAllowedByPolicy(policy);
    assertParticipantAllowsMessageSend(toPlainParticipant(participant));
    assertConversationAllowsMessageSend({
      conversation: toPlainConversation(conversation),
      participant: toPlainParticipant(participant),
      canBypassReadOnly: canManageMessages(),
    });
    assertMessageCreatePayload({
      kind,
      body,
      metadata: command.metadata,
      clientMessageId: command.clientMessageId,
    });
    assertMessageLength(body, policy.maxMessageLength);

    const replyTarget = command.replyToMessageId
      ? await requireReplyTarget({
          repository: this.communicationMessageRepository,
          conversationId,
          replyToMessageId: command.replyToMessageId,
        })
      : null;
    if (replyTarget) {
      assertReplyTargetIsValid({
        conversationId,
        replyTarget: toPlainMessage(replyTarget),
      });
    }

    const message =
      await this.communicationMessageRepository.createCurrentSchoolMessage({
        schoolId: scope.schoolId,
        conversationId,
        data: {
          senderUserId: scope.actorId,
          kind,
          status: CommunicationMessageStatus.SENT,
          body,
          clientMessageId: normalizeOptionalText(command.clientMessageId),
          replyToMessageId: command.replyToMessageId ?? null,
          metadata: command.metadata ?? null,
        },
        buildAuditEntry: (created) =>
          buildCommunicationMessageAuditEntry({
            scope,
            action: 'communication.message.create',
            message: created,
            changedFields: [
              'kind',
              'body',
              'clientMessageId',
              'replyToMessageId',
              'metadata',
            ],
          }),
      });

    return presentCommunicationMessage(message);
  }
}

@Injectable()
export class GetCommunicationMessageUseCase {
  constructor(
    private readonly communicationMessageRepository: CommunicationMessageRepository,
  ) {}

  async execute(messageId: string) {
    const scope = requireCommunicationScope();
    const message = await requireMessage(
      this.communicationMessageRepository,
      messageId,
    );
    await assertActorCanViewConversation({
      repository: this.communicationMessageRepository,
      conversationId: message.conversationId,
      actorId: scope.actorId,
    });

    return presentCommunicationMessage(message);
  }
}

@Injectable()
export class UpdateCommunicationMessageUseCase {
  constructor(
    private readonly communicationMessageRepository: CommunicationMessageRepository,
    private readonly communicationPolicyRepository: CommunicationPolicyRepository,
  ) {}

  async execute(messageId: string, command: UpdateCommunicationMessageDto) {
    const scope = requireCommunicationScope();
    const [message, policy] = await Promise.all([
      requireMessage(this.communicationMessageRepository, messageId),
      loadPolicy(this.communicationPolicyRepository),
    ]);
    const [conversation, participant] = await Promise.all([
      requireConversationForAccess(
        this.communicationMessageRepository,
        message.conversationId,
      ),
      requireActorParticipant({
        repository: this.communicationMessageRepository,
        conversationId: message.conversationId,
        actorId: scope.actorId,
      }),
    ]);
    const body = normalizeMessageBody(command.body ?? command.content);

    assertMessageCanBeEdited({
      message: toPlainMessage(message),
      conversation: toPlainConversation(conversation),
      participant: toPlainParticipant(participant),
      actorId: scope.actorId,
      canManageMessage: canModerateMessages(),
      body,
      maxMessageLength: policy.maxMessageLength,
    });

    const updated =
      await this.communicationMessageRepository.updateCurrentSchoolMessage({
        messageId: message.id,
        data: { body },
        buildAuditEntry: (next) =>
          buildCommunicationMessageAuditEntry({
            scope,
            action: 'communication.message.update',
            message: next,
            before: message,
            changedFields: ['body', 'editedAt'],
          }),
      });

    return presentCommunicationMessage(updated);
  }
}

@Injectable()
export class DeleteCommunicationMessageUseCase {
  constructor(
    private readonly communicationMessageRepository: CommunicationMessageRepository,
  ) {}

  async execute(messageId: string) {
    const scope = requireCommunicationScope();
    const message = await requireMessage(
      this.communicationMessageRepository,
      messageId,
    );
    const [conversation, participant] = await Promise.all([
      requireConversationForAccess(
        this.communicationMessageRepository,
        message.conversationId,
      ),
      requireActorParticipant({
        repository: this.communicationMessageRepository,
        conversationId: message.conversationId,
        actorId: scope.actorId,
      }),
    ]);

    assertMessageCanBeDeleted({
      message: toPlainMessage(message),
      conversation: toPlainConversation(conversation),
      participant: toPlainParticipant(participant),
      actorId: scope.actorId,
      canManageMessage: canModerateMessages(),
    });

    const deleted =
      await this.communicationMessageRepository.deleteOrHideCurrentSchoolMessage({
        messageId: message.id,
        actorId: scope.actorId,
        buildAuditEntry: (next) =>
          buildCommunicationMessageAuditEntry({
            scope,
            action: 'communication.message.delete',
            message: next,
            before: message,
            changedFields: ['status', 'deletedAt', 'deletedById'],
          }),
      });

    return presentCommunicationMessage(deleted);
  }
}

@Injectable()
export class MarkCommunicationMessageReadUseCase {
  constructor(
    private readonly communicationMessageRepository: CommunicationMessageRepository,
  ) {}

  async execute(messageId: string) {
    const scope = requireCommunicationScope();
    const message = await requireMessage(
      this.communicationMessageRepository,
      messageId,
    );
    const participant = await requireActorParticipant({
      repository: this.communicationMessageRepository,
      conversationId: message.conversationId,
      actorId: scope.actorId,
    });

    assertParticipantAllowsMessageRead(toPlainParticipant(participant));
    assertMessageCanBeRead(toPlainMessage(message));

    const read =
      await this.communicationMessageRepository.markCurrentSchoolMessageRead({
        schoolId: scope.schoolId,
        conversationId: message.conversationId,
        messageId: message.id,
        userId: scope.actorId,
        participantId: participant.id,
        readAt: new Date(),
      });

    return presentCommunicationMessageReadReceipt(read);
  }
}

@Injectable()
export class MarkCommunicationConversationReadUseCase {
  constructor(
    private readonly communicationMessageRepository: CommunicationMessageRepository,
  ) {}

  async execute(conversationId: string, command?: MarkConversationReadDto) {
    const scope = requireCommunicationScope();
    await requireConversationForAccess(
      this.communicationMessageRepository,
      conversationId,
    );
    const participant = await requireActorParticipant({
      repository: this.communicationMessageRepository,
      conversationId,
      actorId: scope.actorId,
    });

    assertParticipantAllowsMessageRead(toPlainParticipant(participant));

    const result =
      await this.communicationMessageRepository.markCurrentSchoolConversationRead(
        {
          schoolId: scope.schoolId,
          conversationId,
          userId: scope.actorId,
          participantId: participant.id,
          readAt: command?.readAt ? new Date(command.readAt) : new Date(),
        },
      );

    return presentCommunicationConversationReadResult(result);
  }
}

@Injectable()
export class GetCommunicationReadSummaryUseCase {
  constructor(
    private readonly communicationMessageRepository: CommunicationMessageRepository,
  ) {}

  async execute(conversationId: string, query: ReadSummaryQueryDto) {
    const scope = requireCommunicationScope();
    const conversation = await requireConversationForAccess(
      this.communicationMessageRepository,
      conversationId,
    );
    await assertActorCanViewConversation({
      repository: this.communicationMessageRepository,
      conversationId: conversation.id,
      actorId: scope.actorId,
    });

    const summary =
      await this.communicationMessageRepository.loadCurrentSchoolConversationReadSummary(
        {
          conversationId: conversation.id,
          limit: query.limit,
          page: query.page,
        },
      );

    return presentCommunicationReadSummary(summary);
  }
}

async function requireConversationForAccess(
  repository: CommunicationMessageRepository,
  conversationId: string,
): Promise<CommunicationMessageConversationAccessRecord> {
  const conversation = await repository.findConversationForMessageAccess(
    conversationId,
  );
  if (!conversation) {
    throw new NotFoundDomainException('Conversation not found', {
      conversationId,
    });
  }

  return conversation;
}

async function requireMessage(
  repository: CommunicationMessageRepository,
  messageId: string,
): Promise<CommunicationMessageRecord> {
  const message = await repository.findCurrentSchoolMessageById(messageId);
  if (!message) {
    throw new NotFoundDomainException('Message not found', { messageId });
  }

  return message;
}

async function requireReplyTarget(params: {
  repository: CommunicationMessageRepository;
  conversationId: string;
  replyToMessageId: string;
}): Promise<CommunicationMessageRecord> {
  const message = await params.repository.findCurrentSchoolReplyTarget({
    conversationId: params.conversationId,
    messageId: params.replyToMessageId,
  });
  if (!message) {
    throw new NotFoundDomainException('Reply target not found', {
      replyToMessageId: params.replyToMessageId,
    });
  }

  return message;
}

async function requireActorParticipant(params: {
  repository: CommunicationMessageRepository;
  conversationId: string;
  actorId: string;
}): Promise<CommunicationMessageParticipantAccessRecord> {
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

async function assertActorCanViewConversation(params: {
  repository: CommunicationMessageRepository;
  conversationId: string;
  actorId: string;
}): Promise<void> {
  const participant = await params.repository.findActiveParticipantForActor({
    conversationId: params.conversationId,
    actorId: params.actorId,
  });

  if (participant) {
    if (canViewMessagesWithoutParticipant()) return;
    assertParticipantAllowsMessageAccess(toPlainParticipant(participant));
    return;
  }

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

function canManageMessages(): boolean {
  return hasAnyPermission(
    'communication.messages.moderate',
    'communication.admin.manage',
  );
}

function canModerateMessages(): boolean {
  return canManageMessages();
}

function hasAnyPermission(...permissions: string[]): boolean {
  const ctx = getRequestContext();
  const granted = new Set(ctx?.activeMembership?.permissions ?? []);
  return permissions.some((permission) => granted.has(permission));
}

function toPlainConversation(
  conversation: CommunicationMessageConversationAccessRecord,
): PlainMessageConversation {
  return {
    id: conversation.id,
    status: conversation.status,
    metadata: asPlainMetadata(conversation.metadata),
  };
}

function toPlainParticipant(
  participant: CommunicationMessageParticipantAccessRecord,
): PlainMessageParticipant {
  return {
    id: participant.id,
    conversationId: participant.conversationId,
    userId: participant.userId,
    role: participant.role,
    status: participant.status,
    mutedUntil: participant.mutedUntil,
  };
}

function toPlainMessage(
  message: CommunicationMessageRecord,
): PlainCommunicationMessage {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderUserId: message.senderUserId,
    kind: message.kind,
    status: message.status,
    body: message.body,
    replyToMessageId: message.replyToMessageId,
    clientMessageId: message.clientMessageId,
    editedAt: message.editedAt,
    hiddenAt: message.hiddenAt,
    deletedAt: message.deletedAt,
  };
}

function buildCommunicationMessageAuditEntry(params: {
  scope: CommunicationScope;
  action:
    | 'communication.message.create'
    | 'communication.message.update'
    | 'communication.message.delete';
  message: CommunicationMessageRecord;
  before?: CommunicationMessageRecord | null;
  changedFields: string[];
}): CommunicationMessageAuditInput {
  return {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'communication',
    action: params.action,
    resourceType: 'communication_message',
    resourceId: params.message.id,
    outcome: AuditOutcome.SUCCESS,
    before: params.before
      ? {
          targetSchoolId: params.scope.schoolId,
          message: summarizeCommunicationMessageForAudit(params.before),
        }
      : undefined,
    after: {
      targetSchoolId: params.scope.schoolId,
      actorId: params.scope.actorId,
      changedFields: params.changedFields,
      conversationId: params.message.conversationId,
      messageId: params.message.id,
      message: summarizeCommunicationMessageForAudit(params.message),
    },
  };
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asPlainMetadata(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
