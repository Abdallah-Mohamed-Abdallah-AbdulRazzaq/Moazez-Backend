import {
  CommunicationConversationArchivedException,
  CommunicationConversationClosedException,
  CommunicationPolicyDisabledException,
} from '../domain/communication-conversation-domain';
import {
  CommunicationAttachmentInvalidFileException,
  CommunicationAttachmentNotAllowedException,
  assertAttachmentAllowedByPolicy,
  assertAttachmentFileIsSafe,
  assertMessageAllowsAttachment,
  assertParticipantAllowsAttachment,
  PlainAttachmentConversation,
  PlainAttachmentMessage,
  PlainAttachmentParticipant,
} from '../domain/communication-message-attachment-domain';
import {
  CommunicationMessageDeletedException,
  CommunicationMessageHiddenException,
  CommunicationMessageSendForbiddenException,
} from '../domain/communication-message-domain';
import { CommunicationParticipantNotActiveException } from '../domain/communication-participant-domain';
import { buildDefaultCommunicationPolicy } from '../domain/communication-policy-domain';

describe('communication message attachment domain', () => {
  it('rejects attachment mutations when policy is disabled or attachments are disabled', () => {
    expect(() =>
      assertAttachmentAllowedByPolicy({
        ...buildDefaultCommunicationPolicy(),
        isEnabled: false,
      }),
    ).toThrow(CommunicationPolicyDisabledException);
    expect(() =>
      assertAttachmentAllowedByPolicy({
        ...buildDefaultCommunicationPolicy(),
        allowAttachments: false,
      }),
    ).toThrow(CommunicationAttachmentNotAllowedException);
  });

  it('rejects files over maxAttachmentSizeMb', () => {
    expect(() =>
      assertAttachmentFileIsSafe({
        file: {
          id: 'file-1',
          schoolId: 'school-1',
          sizeBytes: 3n * 1024n * 1024n,
          deletedAt: null,
        },
        maxAttachmentSizeMb: 2,
        expectedSchoolId: 'school-1',
      }),
    ).toThrow(CommunicationAttachmentInvalidFileException);
  });

  it('rejects archived closed hidden and deleted message targets', () => {
    expect(() =>
      assertMessageAllowsAttachment({
        conversation: conversationPlain({ status: 'ARCHIVED' }),
        message: messagePlain(),
      }),
    ).toThrow(CommunicationConversationArchivedException);
    expect(() =>
      assertMessageAllowsAttachment({
        conversation: conversationPlain({ status: 'CLOSED' }),
        message: messagePlain(),
      }),
    ).toThrow(CommunicationConversationClosedException);
    expect(() =>
      assertMessageAllowsAttachment({
        conversation: conversationPlain(),
        message: messagePlain({ status: 'HIDDEN' }),
      }),
    ).toThrow(CommunicationMessageHiddenException);
    expect(() =>
      assertMessageAllowsAttachment({
        conversation: conversationPlain(),
        message: messagePlain({ status: 'DELETED' }),
      }),
    ).toThrow(CommunicationMessageDeletedException);
  });

  it('rejects non-active and muted participants', () => {
    expect(() =>
      assertParticipantAllowsAttachment(
        participantPlain({ status: 'REMOVED' }),
      ),
    ).toThrow(CommunicationParticipantNotActiveException);
    expect(() =>
      assertParticipantAllowsAttachment(
        participantPlain({
          mutedUntil: new Date('2026-05-03T00:00:00.000Z'),
        }),
        new Date('2026-05-02T00:00:00.000Z'),
      ),
    ).toThrow(CommunicationMessageSendForbiddenException);
  });
});

function conversationPlain(
  overrides?: Partial<PlainAttachmentConversation>,
): PlainAttachmentConversation {
  return {
    id: 'conversation-1',
    status: 'ACTIVE',
    ...(overrides ?? {}),
  };
}

function messagePlain(
  overrides?: Partial<PlainAttachmentMessage>,
): PlainAttachmentMessage {
  return {
    id: 'message-1',
    conversationId: 'conversation-1',
    senderUserId: 'sender-1',
    status: 'SENT',
    hiddenAt: null,
    deletedAt: null,
    ...(overrides ?? {}),
  };
}

function participantPlain(
  overrides?: Partial<PlainAttachmentParticipant>,
): PlainAttachmentParticipant {
  return {
    id: 'participant-1',
    conversationId: 'conversation-1',
    userId: 'actor-1',
    role: 'MEMBER',
    status: 'ACTIVE',
    mutedUntil: null,
    ...(overrides ?? {}),
  };
}
