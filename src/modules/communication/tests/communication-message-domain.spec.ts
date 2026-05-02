import {
  CommunicationConversationArchivedException,
  CommunicationConversationClosedException,
  CommunicationPolicyDisabledException,
} from '../domain/communication-conversation-domain';
import {
  assertConversationAllowsMessageSend,
  assertMessageCanBeEdited,
  assertMessageCreatePayload,
  assertMessageLength,
  assertMessageSendAllowedByPolicy,
  assertParticipantAllowsMessageRead,
  assertParticipantAllowsMessageSend,
  CommunicationMessageDeletedException,
  CommunicationMessageEmptyException,
  CommunicationMessageHiddenException,
  CommunicationMessageKindInvalidException,
  CommunicationMessageNotEditableException,
  CommunicationMessageSendForbiddenException,
  CommunicationMessageTooLongException,
  CommunicationReceiptInvalidRecipientException,
  PlainCommunicationMessage,
  PlainMessageConversation,
  PlainMessageParticipant,
  normalizeCommunicationMessageStatus,
  normalizeCommunicationMessageType,
  sanitizeDeletedOrHiddenMessageForViewer,
  summarizeReadState,
} from '../domain/communication-message-domain';
import { buildDefaultCommunicationPolicy } from '../domain/communication-policy-domain';

describe('communication message domain', () => {
  it('normalizes lowercase message types to Prisma enum values', () => {
    expect(normalizeCommunicationMessageType('text')).toBe('TEXT');
    expect(normalizeCommunicationMessageType('system')).toBe('SYSTEM');
    expect(normalizeCommunicationMessageType('AUDIO')).toBe('AUDIO');
  });

  it('rejects unsupported message types', () => {
    expect(() => normalizeCommunicationMessageType('announcement')).toThrow(
      CommunicationMessageKindInvalidException,
    );
  });

  it('normalizes lowercase message statuses to Prisma enum values', () => {
    expect(normalizeCommunicationMessageStatus('sent')).toBe('SENT');
    expect(normalizeCommunicationMessageStatus('hidden')).toBe('HIDDEN');
    expect(normalizeCommunicationMessageStatus('DELETED')).toBe('DELETED');
  });

  it('send rejects when policy is disabled', () => {
    expect(() =>
      assertMessageSendAllowedByPolicy({
        ...buildDefaultCommunicationPolicy(),
        isEnabled: false,
      }),
    ).toThrow(CommunicationPolicyDisabledException);
  });

  it('send rejects archived closed and read-only conversations for regular members', () => {
    const participant = participantPlain();

    expect(() =>
      assertConversationAllowsMessageSend({
        conversation: conversationPlain({ status: 'ARCHIVED' }),
        participant,
        canBypassReadOnly: false,
      }),
    ).toThrow(CommunicationConversationArchivedException);
    expect(() =>
      assertConversationAllowsMessageSend({
        conversation: conversationPlain({ status: 'CLOSED' }),
        participant,
        canBypassReadOnly: false,
      }),
    ).toThrow(CommunicationConversationClosedException);
    expect(() =>
      assertConversationAllowsMessageSend({
        conversation: conversationPlain({ metadata: { isReadOnly: true } }),
        participant,
        canBypassReadOnly: false,
      }),
    ).toThrow(CommunicationMessageSendForbiddenException);
  });

  it('send rejects muted removed left blocked and read-only participants', () => {
    expect(() =>
      assertParticipantAllowsMessageSend(
        participantPlain({
          status: 'MUTED',
          mutedUntil: new Date('2026-05-03T00:00:00.000Z'),
        }),
        new Date('2026-05-02T00:00:00.000Z'),
      ),
    ).toThrow(CommunicationMessageSendForbiddenException);
    expect(() =>
      assertParticipantAllowsMessageSend(
        participantPlain({ status: 'REMOVED' }),
      ),
    ).toThrow();
    expect(() =>
      assertParticipantAllowsMessageSend(
        participantPlain({ status: 'LEFT' }),
      ),
    ).toThrow();
    expect(() =>
      assertParticipantAllowsMessageSend(
        participantPlain({ status: 'BLOCKED' }),
      ),
    ).toThrow();
    expect(() =>
      assertParticipantAllowsMessageSend(
        participantPlain({ role: 'READ_ONLY' }),
      ),
    ).toThrow(CommunicationMessageSendForbiddenException);
  });

  it('send rejects empty or too-long text content', () => {
    expect(() =>
      assertMessageCreatePayload({ kind: 'TEXT', body: '   ' }),
    ).toThrow(CommunicationMessageEmptyException);
    expect(() => assertMessageLength('hello', 4)).toThrow(
      CommunicationMessageTooLongException,
    );
  });

  it('public create payload accepts text only', () => {
    expect(() =>
      assertMessageCreatePayload({ kind: 'TEXT', body: 'Hello' }),
    ).not.toThrow();
    expect(() =>
      assertMessageCreatePayload({ kind: 'SYSTEM', body: 'Internal' }),
    ).toThrow(CommunicationMessageKindInvalidException);
  });

  it('edit rejects non-editable deleted and hidden messages', () => {
    const base = {
      conversation: conversationPlain(),
      participant: participantPlain(),
      actorId: 'actor-1',
      canManageMessage: false,
      body: 'Updated',
      maxMessageLength: 4000,
    };

    expect(() =>
      assertMessageCanBeEdited({
        ...base,
        message: messagePlain({ kind: 'AUDIO' }),
      }),
    ).toThrow(CommunicationMessageNotEditableException);
    expect(() =>
      assertMessageCanBeEdited({
        ...base,
        message: messagePlain({ status: 'DELETED' }),
      }),
    ).toThrow(CommunicationMessageDeletedException);
    expect(() =>
      assertMessageCanBeEdited({
        ...base,
        message: messagePlain({ status: 'HIDDEN' }),
      }),
    ).toThrow(CommunicationMessageHiddenException);
  });

  it('read rejects inactive participants and summarizes counts', () => {
    expect(() =>
      assertParticipantAllowsMessageRead(
        participantPlain({ status: 'REMOVED' }),
      ),
    ).toThrow(CommunicationReceiptInvalidRecipientException);

    expect(
      summarizeReadState({
        messages: [
          { id: 'message-1', readCount: 2 },
          { id: 'message-2', readCount: 3 },
        ],
      }),
    ).toEqual({
      totalMessages: 2,
      totalReads: 5,
      messages: [
        { messageId: 'message-1', readCount: 2 },
        { messageId: 'message-2', readCount: 3 },
      ],
    });
  });

  it('sanitizes deleted or hidden body content', () => {
    expect(
      sanitizeDeletedOrHiddenMessageForViewer(
        messagePlain({ status: 'DELETED', body: 'secret' }),
      ).body,
    ).toBeNull();
    expect(
      sanitizeDeletedOrHiddenMessageForViewer(
        messagePlain({ status: 'SENT', body: 'visible' }),
      ).body,
    ).toBe('visible');
  });
});

function conversationPlain(
  overrides?: Partial<PlainMessageConversation>,
): PlainMessageConversation {
  return {
    id: 'conversation-1',
    status: 'ACTIVE' as const,
    metadata: null,
    ...(overrides ?? {}),
  };
}

function participantPlain(
  overrides?: Partial<PlainMessageParticipant>,
): PlainMessageParticipant {
  return {
    id: 'participant-1',
    conversationId: 'conversation-1',
    userId: 'actor-1',
    role: 'MEMBER' as const,
    status: 'ACTIVE' as const,
    mutedUntil: null,
    ...(overrides ?? {}),
  };
}

function messagePlain(
  overrides?: Partial<PlainCommunicationMessage>,
): PlainCommunicationMessage {
  return {
    id: 'message-1',
    conversationId: 'conversation-1',
    senderUserId: 'actor-1',
    kind: 'TEXT' as const,
    status: 'SENT' as const,
    body: 'Hello',
    replyToMessageId: null,
    clientMessageId: null,
    editedAt: null,
    hiddenAt: null,
    deletedAt: null,
    ...(overrides ?? {}),
  };
}
