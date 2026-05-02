import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../common/exceptions/domain-exception';
import {
  CommunicationConversationArchivedException,
  CommunicationConversationClosedException,
  CommunicationConversationScopeInvalidException,
  CommunicationPolicyDisabledException,
} from './communication-conversation-domain';
import {
  CommunicationConversationNotMemberException,
} from './communication-participant-domain';
import { PlainCommunicationPolicy } from './communication-policy-domain';

export type CommunicationMessageKindValue =
  | 'TEXT'
  | 'IMAGE'
  | 'FILE'
  | 'AUDIO'
  | 'VIDEO'
  | 'SYSTEM';

export type CommunicationMessageStatusValue = 'SENT' | 'HIDDEN' | 'DELETED';

export type MessageParticipantRoleValue =
  | 'OWNER'
  | 'ADMIN'
  | 'MODERATOR'
  | 'MEMBER'
  | 'READ_ONLY'
  | 'SYSTEM';

export type MessageParticipantStatusValue =
  | 'ACTIVE'
  | 'INVITED'
  | 'LEFT'
  | 'REMOVED'
  | 'MUTED'
  | 'BLOCKED';

export interface PlainMessageConversation {
  id: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'CLOSED';
  metadata?: Record<string, unknown> | null;
}

export interface PlainMessageParticipant {
  id: string;
  conversationId: string;
  userId: string;
  role: MessageParticipantRoleValue;
  status: MessageParticipantStatusValue;
  mutedUntil?: Date | null;
}

export interface PlainCommunicationMessage {
  id: string;
  conversationId: string;
  senderUserId: string | null;
  kind: CommunicationMessageKindValue;
  status: CommunicationMessageStatusValue;
  body: string | null;
  replyToMessageId?: string | null;
  clientMessageId?: string | null;
  editedAt?: Date | null;
  hiddenAt?: Date | null;
  deletedAt?: Date | null;
}

export interface MessageCreatePayload {
  kind: CommunicationMessageKindValue;
  body?: string | null;
  metadata?: Record<string, unknown> | null;
  clientMessageId?: string | null;
}

export interface MessageReadSummaryInput {
  messages: Array<{
    id: string;
    readCount: number;
  }>;
}

export interface MessageReadSummary {
  totalMessages: number;
  totalReads: number;
  messages: Array<{
    messageId: string;
    readCount: number;
  }>;
}

const MESSAGE_KIND_MAP: Record<string, CommunicationMessageKindValue> = {
  text: 'TEXT',
  image: 'IMAGE',
  file: 'FILE',
  audio: 'AUDIO',
  video: 'VIDEO',
  system: 'SYSTEM',
};

const MESSAGE_STATUS_MAP: Record<string, CommunicationMessageStatusValue> = {
  sent: 'SENT',
  hidden: 'HIDDEN',
  deleted: 'DELETED',
};

const PARTICIPANT_ACCESS_STATUSES = new Set<MessageParticipantStatusValue>([
  'ACTIVE',
  'MUTED',
]);

const MESSAGE_MANAGEMENT_ROLES = new Set<MessageParticipantRoleValue>([
  'OWNER',
  'ADMIN',
  'MODERATOR',
  'SYSTEM',
]);

export class CommunicationMessageEmptyException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'communication.message.empty',
      message: 'Message cannot be empty',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class CommunicationMessageTooLongException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'communication.message.too_long',
      message: 'Message exceeds maximum length',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class CommunicationMessageHiddenException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'communication.message.hidden',
      message: 'Message is hidden',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class CommunicationMessageDeletedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'communication.message.deleted',
      message: 'Message is deleted',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class CommunicationMessageNotEditableException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'communication.message.not_editable',
      message: 'Message cannot be edited',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class CommunicationMessageNotSenderException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'communication.message.not_sender',
      message: 'Only the sender can perform this message action',
      httpStatus: HttpStatus.FORBIDDEN,
      details,
    });
  }
}

export class CommunicationMessageSendForbiddenException extends DomainException {
  constructor(message = 'Sending messages is not allowed', details?: Record<string, unknown>) {
    super({
      code: 'communication.message.send_forbidden',
      message,
      httpStatus: HttpStatus.FORBIDDEN,
      details,
    });
  }
}

export class CommunicationMessageKindInvalidException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'communication.message.kind_invalid',
      message: 'Message kind is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class CommunicationReceiptInvalidRecipientException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'communication.receipt.invalid_recipient',
      message: 'Receipt recipient is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export function normalizeCommunicationMessageType(
  value: string,
): CommunicationMessageKindValue {
  const normalized = value.trim().toLowerCase();
  const mapped = MESSAGE_KIND_MAP[normalized];
  if (!mapped) {
    throw new CommunicationMessageKindInvalidException({
      field: 'type',
      value,
    });
  }

  return mapped;
}

export function normalizeCommunicationMessageStatus(
  value: string,
): CommunicationMessageStatusValue {
  const normalized = value.trim().toLowerCase();
  const mapped = MESSAGE_STATUS_MAP[normalized];
  if (!mapped) {
    throw new CommunicationConversationScopeInvalidException(
      'Message status is invalid',
      { field: 'status', value },
    );
  }

  return mapped;
}

export function normalizeMessageBody(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function assertMessageSendAllowedByPolicy(
  policy: Pick<PlainCommunicationPolicy, 'isEnabled'>,
): void {
  if (!policy.isEnabled) {
    throw new CommunicationPolicyDisabledException();
  }
}

export function assertConversationAllowsMessageSend(params: {
  conversation: PlainMessageConversation;
  participant: Pick<PlainMessageParticipant, 'role'>;
  canBypassReadOnly: boolean;
}): void {
  if (params.conversation.status === 'ARCHIVED') {
    throw new CommunicationConversationArchivedException();
  }
  if (params.conversation.status === 'CLOSED') {
    throw new CommunicationConversationClosedException();
  }

  if (
    isConversationReadOnly(params.conversation.metadata) &&
    !params.canBypassReadOnly &&
    !MESSAGE_MANAGEMENT_ROLES.has(params.participant.role)
  ) {
    throw new CommunicationMessageSendForbiddenException(
      'Conversation is read-only',
      { conversationId: params.conversation.id },
    );
  }
}

export function assertConversationAllowsMessageMutation(
  conversation: PlainMessageConversation,
): void {
  if (conversation.status === 'ARCHIVED') {
    throw new CommunicationConversationArchivedException();
  }
  if (conversation.status === 'CLOSED') {
    throw new CommunicationConversationClosedException();
  }
}

export function assertParticipantAllowsMessageAccess(
  participant: PlainMessageParticipant,
): void {
  if (!PARTICIPANT_ACCESS_STATUSES.has(participant.status)) {
    throw new CommunicationConversationNotMemberException({
      conversationId: participant.conversationId,
      participantId: participant.id,
      status: participant.status,
    });
  }
}

export function assertParticipantAllowsMessageSend(
  participant: PlainMessageParticipant,
  now = new Date(),
): void {
  assertParticipantAllowsMessageAccess(participant);

  if (
    participant.status === 'MUTED' ||
    (participant.mutedUntil && participant.mutedUntil.getTime() > now.getTime())
  ) {
    throw new CommunicationMessageSendForbiddenException(
      'Participant is muted',
      {
        conversationId: participant.conversationId,
        participantId: participant.id,
        mutedUntil: participant.mutedUntil?.toISOString() ?? null,
      },
    );
  }

  if (participant.role === 'READ_ONLY') {
    throw new CommunicationMessageSendForbiddenException(
      'Read-only participants cannot send messages',
      { participantId: participant.id },
    );
  }
}

export function assertParticipantAllowsMessageRead(
  participant: PlainMessageParticipant,
): void {
  if (!PARTICIPANT_ACCESS_STATUSES.has(participant.status)) {
    throw new CommunicationReceiptInvalidRecipientException({
      conversationId: participant.conversationId,
      participantId: participant.id,
      status: participant.status,
    });
  }
}

export function assertMessageCreatePayload(
  payload: MessageCreatePayload,
): void {
  if (payload.kind !== 'TEXT') {
    throw new CommunicationMessageKindInvalidException({
      kind: payload.kind,
    });
  }

  assertMessageBodyRequired(payload.body);
  assertPlainObjectMetadata(payload.metadata);
  assertOptionalTextLength('clientMessageId', payload.clientMessageId, 128);
}

export function assertMessageLength(
  body: string | null | undefined,
  maxMessageLength: number,
): void {
  if (!Number.isInteger(maxMessageLength) || maxMessageLength < 1) {
    throw new CommunicationMessageTooLongException({
      maxMessageLength,
    });
  }

  if ((body ?? '').length > maxMessageLength) {
    throw new CommunicationMessageTooLongException({
      maxMessageLength,
      length: (body ?? '').length,
    });
  }
}

export function assertMessageCanBeEdited(params: {
  message: PlainCommunicationMessage;
  conversation: PlainMessageConversation;
  participant: PlainMessageParticipant;
  actorId: string;
  canManageMessage: boolean;
  body: string | null;
  maxMessageLength: number;
}): void {
  assertConversationAllowsMessageMutation(params.conversation);
  assertParticipantAllowsMessageAccess(params.participant);
  assertSenderOrMessageManager({
    message: params.message,
    actorId: params.actorId,
    canManageMessage: params.canManageMessage,
  });

  if (params.message.kind !== 'TEXT') {
    throw new CommunicationMessageNotEditableException({
      messageId: params.message.id,
      kind: params.message.kind,
    });
  }

  assertMessageIsVisible(params.message);
  assertMessageBodyRequired(params.body);
  assertMessageLength(params.body, params.maxMessageLength);
}

export function assertMessageCanBeDeleted(params: {
  message: PlainCommunicationMessage;
  conversation: PlainMessageConversation;
  participant: PlainMessageParticipant;
  actorId: string;
  canManageMessage: boolean;
}): void {
  assertConversationAllowsMessageMutation(params.conversation);
  assertParticipantAllowsMessageAccess(params.participant);
  assertSenderOrMessageManager({
    message: params.message,
    actorId: params.actorId,
    canManageMessage: params.canManageMessage,
  });

  if (isDeletedMessage(params.message)) {
    throw new CommunicationMessageDeletedException({
      messageId: params.message.id,
    });
  }
}

export function assertMessageCanBeRead(
  message: PlainCommunicationMessage,
): void {
  assertMessageIsVisible(message);
}

export function assertReplyTargetIsValid(params: {
  conversationId: string;
  replyTarget: PlainCommunicationMessage;
}): void {
  if (params.replyTarget.conversationId !== params.conversationId) {
    throw new CommunicationConversationScopeInvalidException(
      'Reply target must belong to the same conversation',
      {
        conversationId: params.conversationId,
        replyToMessageId: params.replyTarget.id,
      },
    );
  }

  assertMessageIsVisible(params.replyTarget);
}

export function sanitizeDeletedOrHiddenMessageForViewer<
  T extends { status: CommunicationMessageStatusValue; body: string | null; hiddenAt?: Date | null; deletedAt?: Date | null },
>(message: T): T {
  if (!isVisibleMessage(message)) {
    return { ...message, body: null };
  }

  return message;
}

export function summarizeReadState(
  input: MessageReadSummaryInput,
): MessageReadSummary {
  const totalReads = input.messages.reduce(
    (total, message) => total + message.readCount,
    0,
  );

  return {
    totalMessages: input.messages.length,
    totalReads,
    messages: input.messages.map((message) => ({
      messageId: message.id,
      readCount: message.readCount,
    })),
  };
}

export function isConversationReadOnly(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return metadata?.isReadOnly === true;
}

export function isMessageManagerRole(role: MessageParticipantRoleValue): boolean {
  return MESSAGE_MANAGEMENT_ROLES.has(role);
}

function assertSenderOrMessageManager(params: {
  message: PlainCommunicationMessage;
  actorId: string;
  canManageMessage: boolean;
}): void {
  if (params.canManageMessage) return;
  if (params.message.senderUserId === params.actorId) return;

  throw new CommunicationMessageNotSenderException({
    messageId: params.message.id,
  });
}

function assertMessageIsVisible(message: PlainCommunicationMessage): void {
  if (isDeletedMessage(message)) {
    throw new CommunicationMessageDeletedException({
      messageId: message.id,
    });
  }
  if (isHiddenMessage(message)) {
    throw new CommunicationMessageHiddenException({
      messageId: message.id,
    });
  }
}

function assertMessageBodyRequired(body: string | null | undefined): void {
  if (!body || body.trim().length === 0) {
    throw new CommunicationMessageEmptyException();
  }
}

function assertPlainObjectMetadata(
  value: Record<string, unknown> | null | undefined,
): void {
  if (value === undefined || value === null) return;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new CommunicationConversationScopeInvalidException(
      'Message metadata must be an object',
      { field: 'metadata' },
    );
  }
}

function assertOptionalTextLength(
  field: string,
  value: string | null | undefined,
  maxLength: number,
): void {
  if (value === undefined || value === null) return;
  if (value.trim().length > maxLength) {
    throw new CommunicationConversationScopeInvalidException(
      'Message text field is too long',
      { field, maxLength },
    );
  }
}

function isVisibleMessage(
  message: {
    status: CommunicationMessageStatusValue;
    hiddenAt?: Date | null;
    deletedAt?: Date | null;
  },
): boolean {
  return !isHiddenMessage(message) && !isDeletedMessage(message);
}

function isHiddenMessage(message: {
  status: CommunicationMessageStatusValue;
  hiddenAt?: Date | null;
}): boolean {
  return message.status === 'HIDDEN' || Boolean(message.hiddenAt);
}

function isDeletedMessage(message: {
  status: CommunicationMessageStatusValue;
  deletedAt?: Date | null;
}): boolean {
  return message.status === 'DELETED' || Boolean(message.deletedAt);
}
