import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../common/exceptions/domain-exception';
import {
  CommunicationConversationArchivedException,
  CommunicationConversationClosedException,
  CommunicationPolicyDisabledException,
} from './communication-conversation-domain';
import {
  CommunicationMessageDeletedException,
  CommunicationMessageHiddenException,
  CommunicationMessageSendForbiddenException,
} from './communication-message-domain';
import {
  CommunicationConversationNotMemberException,
  CommunicationParticipantNotActiveException,
  CommunicationParticipantRoleForbiddenException,
} from './communication-participant-domain';
import { PlainCommunicationPolicy } from './communication-policy-domain';

export type AttachmentConversationStatusValue =
  | 'ACTIVE'
  | 'ARCHIVED'
  | 'CLOSED';

export type AttachmentMessageStatusValue = 'SENT' | 'HIDDEN' | 'DELETED';

export type AttachmentParticipantRoleValue =
  | 'OWNER'
  | 'ADMIN'
  | 'MODERATOR'
  | 'MEMBER'
  | 'READ_ONLY'
  | 'SYSTEM';

export type AttachmentParticipantStatusValue =
  | 'ACTIVE'
  | 'INVITED'
  | 'LEFT'
  | 'REMOVED'
  | 'MUTED'
  | 'BLOCKED';

export interface PlainAttachmentConversation {
  id: string;
  status: AttachmentConversationStatusValue;
}

export interface PlainAttachmentMessage {
  id: string;
  conversationId: string;
  senderUserId: string | null;
  status: AttachmentMessageStatusValue;
  hiddenAt?: Date | null;
  deletedAt?: Date | null;
}

export interface PlainAttachmentParticipant {
  id: string;
  conversationId: string;
  userId: string;
  role: AttachmentParticipantRoleValue;
  status: AttachmentParticipantStatusValue;
  mutedUntil?: Date | null;
}

export interface PlainAttachmentFile {
  id: string;
  schoolId: string | null;
  sizeBytes: bigint | number;
  deletedAt?: Date | null;
}

export interface PlainCommunicationMessageAttachment {
  id: string;
  messageId: string;
  fileId: string;
  uploadedById: string | null;
}

export class CommunicationAttachmentNotAllowedException extends DomainException {
  constructor(message = 'Attachments are not allowed', details?: Record<string, unknown>) {
    super({
      code: 'communication.attachment.not_allowed',
      message,
      httpStatus: HttpStatus.FORBIDDEN,
      details,
    });
  }
}

export class CommunicationAttachmentInvalidFileException extends DomainException {
  constructor(message = 'Attachment file is invalid', details?: Record<string, unknown>) {
    super({
      code: 'communication.attachment.invalid_file',
      message,
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export function assertAttachmentAllowedByPolicy(
  policy: Pick<
    PlainCommunicationPolicy,
    'isEnabled' | 'allowAttachments' | 'maxAttachmentSizeMb'
  >,
): void {
  if (!policy.isEnabled) {
    throw new CommunicationPolicyDisabledException();
  }

  if (!policy.allowAttachments) {
    throw new CommunicationAttachmentNotAllowedException(
      'Attachments are disabled by communication policy',
    );
  }
}

export function assertMessageAllowsAttachment(params: {
  conversation: PlainAttachmentConversation;
  message: PlainAttachmentMessage;
}): void {
  assertAttachmentConversationIsOpen(params.conversation);
  assertAttachmentMessageIsVisible(params.message);
}

export function assertParticipantAllowsAttachment(
  participant: PlainAttachmentParticipant,
  now = new Date(),
): void {
  if (participant.status !== 'ACTIVE') {
    throw new CommunicationParticipantNotActiveException({
      participantId: participant.id,
      status: participant.status,
    });
  }

  if (participant.role === 'READ_ONLY') {
    throw new CommunicationParticipantRoleForbiddenException(
      'Read-only participants cannot manage message attachments',
      { participantId: participant.id },
    );
  }

  if (
    participant.mutedUntil &&
    participant.mutedUntil.getTime() > now.getTime()
  ) {
    throw new CommunicationMessageSendForbiddenException(
      'Participant is muted',
      {
        conversationId: participant.conversationId,
        participantId: participant.id,
        mutedUntil: participant.mutedUntil.toISOString(),
      },
    );
  }
}

export function assertAttachmentFileIsSafe(params: {
  file: PlainAttachmentFile;
  maxAttachmentSizeMb: number;
  expectedSchoolId?: string;
}): void {
  if (params.file.deletedAt) {
    throw new CommunicationAttachmentInvalidFileException(
      'Attachment file is not available',
      { fileId: params.file.id },
    );
  }

  if (
    params.expectedSchoolId &&
    params.file.schoolId !== params.expectedSchoolId
  ) {
    throw new CommunicationAttachmentInvalidFileException(
      'Attachment file is not available in this school',
      { fileId: params.file.id },
    );
  }

  const maxBytes = BigInt(params.maxAttachmentSizeMb) * 1024n * 1024n;
  if (BigInt(params.file.sizeBytes) > maxBytes) {
    throw new CommunicationAttachmentInvalidFileException(
      'Attachment file exceeds the communication policy limit',
      {
        fileId: params.file.id,
        maxAttachmentSizeMb: params.maxAttachmentSizeMb,
      },
    );
  }
}

export function assertCanDeleteMessageAttachment(params: {
  attachment: PlainCommunicationMessageAttachment;
  message: PlainAttachmentMessage;
  actorId: string;
  canManageAttachment: boolean;
}): void {
  if (
    params.canManageAttachment ||
    params.attachment.uploadedById === params.actorId ||
    params.message.senderUserId === params.actorId
  ) {
    return;
  }

  throw new CommunicationConversationNotMemberException({
    attachmentId: params.attachment.id,
  });
}

function assertAttachmentConversationIsOpen(
  conversation: PlainAttachmentConversation,
): void {
  if (conversation.status === 'ARCHIVED') {
    throw new CommunicationConversationArchivedException();
  }
  if (conversation.status === 'CLOSED') {
    throw new CommunicationConversationClosedException();
  }
}

function assertAttachmentMessageIsVisible(
  message: PlainAttachmentMessage,
): void {
  if (message.status === 'DELETED' || Boolean(message.deletedAt)) {
    throw new CommunicationMessageDeletedException({
      messageId: message.id,
    });
  }

  if (message.status === 'HIDDEN' || Boolean(message.hiddenAt)) {
    throw new CommunicationMessageHiddenException({
      messageId: message.id,
    });
  }
}
