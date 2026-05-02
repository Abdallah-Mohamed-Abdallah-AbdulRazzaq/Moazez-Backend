import { Injectable, Optional } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import { getRequestContext } from '../../../common/context/request-context';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { FilesNotFoundException } from '../../files/uploads/domain/file-upload.exceptions';
import {
  CommunicationScope,
  requireCommunicationScope,
} from '../communication-context';
import {
  assertAttachmentAllowedByPolicy,
  assertAttachmentFileIsSafe,
  assertCanDeleteMessageAttachment,
  assertMessageAllowsAttachment,
  assertParticipantAllowsAttachment,
  PlainAttachmentConversation,
  PlainAttachmentFile,
  PlainAttachmentMessage,
  PlainAttachmentParticipant,
  PlainCommunicationMessageAttachment,
} from '../domain/communication-message-attachment-domain';
import { CommunicationConversationNotMemberException } from '../domain/communication-participant-domain';
import { buildDefaultCommunicationPolicy } from '../domain/communication-policy-domain';
import { LinkCommunicationMessageAttachmentDto } from '../dto/communication-message-attachment.dto';
import {
  CommunicationAttachmentAuditInput,
  CommunicationMessageAttachmentAccessRecord,
  CommunicationMessageAttachmentFileReference,
  CommunicationMessageAttachmentParticipantAccessRecord,
  CommunicationMessageAttachmentRecord,
  CommunicationMessageAttachmentRepository,
} from '../infrastructure/communication-message-attachment.repository';
import { CommunicationPolicyRepository } from '../infrastructure/communication-policy.repository';
import {
  presentCommunicationMessageAttachment,
  presentCommunicationMessageAttachmentList,
  summarizeCommunicationMessageAttachmentForAudit,
} from '../presenters/communication-message-attachment.presenter';
import { CommunicationRealtimeEventsService } from './communication-realtime-events.service';

@Injectable()
export class ListCommunicationMessageAttachmentsUseCase {
  constructor(
    private readonly communicationMessageAttachmentRepository: CommunicationMessageAttachmentRepository,
  ) {}

  async execute(messageId: string) {
    const scope = requireCommunicationScope();
    const message = await requireMessageForAttachmentAccess(
      this.communicationMessageAttachmentRepository,
      messageId,
    );
    await assertActorCanViewMessageAttachments({
      repository: this.communicationMessageAttachmentRepository,
      conversationId: message.conversationId,
      actorId: scope.actorId,
    });

    const result =
      await this.communicationMessageAttachmentRepository.listCurrentSchoolMessageAttachments(
        {
          messageId: message.id,
        },
      );

    return presentCommunicationMessageAttachmentList(result);
  }
}

@Injectable()
export class LinkCommunicationMessageAttachmentUseCase {
  constructor(
    private readonly communicationMessageAttachmentRepository: CommunicationMessageAttachmentRepository,
    private readonly communicationPolicyRepository: CommunicationPolicyRepository,
    @Optional()
    private readonly realtimeEvents?: CommunicationRealtimeEventsService,
  ) {}

  async execute(
    messageId: string,
    command: LinkCommunicationMessageAttachmentDto,
  ) {
    const scope = requireCommunicationScope();
    const [message, policy, file] = await Promise.all([
      requireMessageForAttachmentAccess(
        this.communicationMessageAttachmentRepository,
        messageId,
      ),
      loadPolicy(this.communicationPolicyRepository),
      this.communicationMessageAttachmentRepository.findCurrentSchoolFileOrAttachmentReference(
        command.fileId,
      ),
    ]);

    if (!file) {
      throw new FilesNotFoundException({ fileId: command.fileId });
    }

    const participant = await requireActorParticipantForAttachment({
      repository: this.communicationMessageAttachmentRepository,
      conversationId: message.conversationId,
      actorId: scope.actorId,
    });

    assertAttachmentAllowedByPolicy(policy);
    assertMessageAllowsAttachment({
      conversation: toPlainConversation(message.conversation),
      message: toPlainMessage(message),
    });
    assertParticipantAllowsAttachment(toPlainParticipant(participant));
    assertAttachmentFileIsSafe({
      file: toPlainFile(file),
      maxAttachmentSizeMb: policy.maxAttachmentSizeMb,
      expectedSchoolId: scope.schoolId,
    });

    const attachment =
      await this.communicationMessageAttachmentRepository.linkCurrentSchoolMessageAttachment(
        {
          schoolId: scope.schoolId,
          conversationId: message.conversationId,
          messageId: message.id,
          fileId: file.id,
          uploadedById: scope.actorId,
          caption: command.caption,
          sortOrder: command.sortOrder,
          buildAuditEntry: (next, before) =>
            buildCommunicationAttachmentAuditEntry({
              scope,
              action: 'communication.message_attachment.link',
              attachment: next,
              before,
              changedFields: ['fileId', 'caption', 'sortOrder'],
            }),
        },
      );

    this.realtimeEvents?.publishAttachmentLinked(scope.schoolId, attachment);

    return presentCommunicationMessageAttachment(attachment);
  }
}

@Injectable()
export class DeleteCommunicationMessageAttachmentUseCase {
  constructor(
    private readonly communicationMessageAttachmentRepository: CommunicationMessageAttachmentRepository,
    private readonly communicationPolicyRepository: CommunicationPolicyRepository,
    @Optional()
    private readonly realtimeEvents?: CommunicationRealtimeEventsService,
  ) {}

  async execute(messageId: string, attachmentId: string) {
    const scope = requireCommunicationScope();
    const [message, policy, attachment] = await Promise.all([
      requireMessageForAttachmentAccess(
        this.communicationMessageAttachmentRepository,
        messageId,
      ),
      loadPolicy(this.communicationPolicyRepository),
      this.communicationMessageAttachmentRepository.findCurrentSchoolMessageAttachment(
        {
          messageId,
          attachmentId,
        },
      ),
    ]);

    if (!attachment) {
      throw new NotFoundDomainException('Attachment not found', {
        attachmentId,
        messageId,
      });
    }

    const participant =
      await this.communicationMessageAttachmentRepository.findActiveParticipantForActor(
        {
          conversationId: message.conversationId,
          actorId: scope.actorId,
        },
      );

    assertAttachmentAllowedByPolicy(policy);
    assertMessageAllowsAttachment({
      conversation: toPlainConversation(message.conversation),
      message: toPlainMessage(message),
    });

    if (participant) {
      assertParticipantAllowsAttachment(toPlainParticipant(participant));
    } else if (!canManageMessageAttachments()) {
      throw new CommunicationConversationNotMemberException({
        conversationId: message.conversationId,
      });
    }

    assertCanDeleteMessageAttachment({
      attachment: toPlainAttachment(attachment),
      message: toPlainMessage(message),
      actorId: scope.actorId,
      canManageAttachment: canManageMessageAttachments(),
    });

    const result =
      await this.communicationMessageAttachmentRepository.deleteCurrentSchoolMessageAttachment(
        {
          attachmentId: attachment.id,
          buildAuditEntry: (deleted) =>
            buildCommunicationAttachmentAuditEntry({
              scope,
              action: 'communication.message_attachment.delete',
              attachment: deleted,
              before: deleted,
              changedFields: ['deletedAt'],
            }),
        },
      );

    this.realtimeEvents?.publishAttachmentDeleted(scope.schoolId, attachment);

    return result;
  }
}

async function requireMessageForAttachmentAccess(
  repository: CommunicationMessageAttachmentRepository,
  messageId: string,
): Promise<CommunicationMessageAttachmentAccessRecord> {
  const message =
    await repository.findMessageForReactionOrAttachmentAccess(messageId);
  if (!message) {
    throw new NotFoundDomainException('Message not found', { messageId });
  }

  return message;
}

async function requireActorParticipantForAttachment(params: {
  repository: CommunicationMessageAttachmentRepository;
  conversationId: string;
  actorId: string;
}): Promise<CommunicationMessageAttachmentParticipantAccessRecord> {
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

async function assertActorCanViewMessageAttachments(params: {
  repository: CommunicationMessageAttachmentRepository;
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

function canManageMessageAttachments(): boolean {
  return hasAnyPermission(
    'communication.messages.attachments.manage',
    'communication.messages.moderate',
    'communication.conversations.manage',
    'communication.admin.manage',
  );
}

function hasAnyPermission(...permissions: string[]): boolean {
  const ctx = getRequestContext();
  const granted = new Set(ctx?.activeMembership?.permissions ?? []);
  return permissions.some((permission) => granted.has(permission));
}

function toPlainConversation(
  conversation: CommunicationMessageAttachmentAccessRecord['conversation'],
): PlainAttachmentConversation {
  return {
    id: conversation.id,
    status: conversation.status,
  };
}

function toPlainMessage(
  message: CommunicationMessageAttachmentAccessRecord,
): PlainAttachmentMessage {
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
  participant: CommunicationMessageAttachmentParticipantAccessRecord,
): PlainAttachmentParticipant {
  return {
    id: participant.id,
    conversationId: participant.conversationId,
    userId: participant.userId,
    role: participant.role,
    status: participant.status,
    mutedUntil: participant.mutedUntil,
  };
}

function toPlainFile(
  file: CommunicationMessageAttachmentFileReference,
): PlainAttachmentFile {
  return {
    id: file.id,
    schoolId: file.schoolId,
    sizeBytes: file.sizeBytes,
    deletedAt: file.deletedAt,
  };
}

function toPlainAttachment(
  attachment: CommunicationMessageAttachmentRecord,
): PlainCommunicationMessageAttachment {
  return {
    id: attachment.id,
    messageId: attachment.messageId,
    fileId: attachment.fileId,
    uploadedById: attachment.uploadedById,
  };
}

function buildCommunicationAttachmentAuditEntry(params: {
  scope: CommunicationScope;
  action:
    | 'communication.message_attachment.link'
    | 'communication.message_attachment.delete';
  attachment: CommunicationMessageAttachmentRecord;
  before?: CommunicationMessageAttachmentRecord | null;
  changedFields: string[];
}): CommunicationAttachmentAuditInput {
  return {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'communication',
    action: params.action,
    resourceType: 'communication_message_attachment',
    resourceId: params.attachment.id,
    outcome: AuditOutcome.SUCCESS,
    before: params.before
      ? {
          targetSchoolId: params.scope.schoolId,
          attachment: summarizeCommunicationMessageAttachmentForAudit(
            params.before,
          ),
        }
      : undefined,
    after: {
      targetSchoolId: params.scope.schoolId,
      actorId: params.scope.actorId,
      changedFields: params.changedFields,
      conversationId: params.attachment.conversationId,
      messageId: params.attachment.messageId,
      attachmentId: params.attachment.id,
      fileId: params.attachment.fileId,
      attachment: summarizeCommunicationMessageAttachmentForAudit(
        params.attachment,
      ),
    },
  };
}
