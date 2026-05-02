import {
  CommunicationConversationArchivedException,
  CommunicationConversationClosedException,
  CommunicationPolicyDisabledException,
} from '../domain/communication-conversation-domain';
import {
  CommunicationMessageDeletedException,
  CommunicationMessageHiddenException,
} from '../domain/communication-message-domain';
import { CommunicationParticipantNotActiveException } from '../domain/communication-participant-domain';
import {
  assertMessageAllowsReaction,
  assertParticipantAllowsReaction,
  assertReactionAllowedByPolicy,
  CommunicationReactionNotAllowedException,
  normalizeCommunicationReactionType,
  PlainReactionConversation,
  PlainReactionMessage,
  PlainReactionParticipant,
} from '../domain/communication-reaction-domain';
import { buildDefaultCommunicationPolicy } from '../domain/communication-policy-domain';

describe('communication reaction domain', () => {
  it('normalizes lowercase reaction types and rejects unsupported values', () => {
    expect(normalizeCommunicationReactionType('like')).toBe('like');
    expect(normalizeCommunicationReactionType('thumbs_down')).toBe(
      'thumbs_down',
    );
    expect(() => normalizeCommunicationReactionType('LIKE')).toThrow();
    expect(() => normalizeCommunicationReactionType('custom text')).toThrow();
  });

  it('rejects reaction mutations when policy is disabled or reactions are disabled', () => {
    expect(() =>
      assertReactionAllowedByPolicy({
        ...buildDefaultCommunicationPolicy(),
        isEnabled: false,
      }),
    ).toThrow(CommunicationPolicyDisabledException);

    expect(() =>
      assertReactionAllowedByPolicy({
        ...buildDefaultCommunicationPolicy(),
        allowReactions: false,
      }),
    ).toThrow(CommunicationReactionNotAllowedException);
  });

  it('rejects archived closed hidden and deleted message targets', () => {
    expect(() =>
      assertMessageAllowsReaction({
        conversation: conversationPlain({ status: 'ARCHIVED' }),
        message: messagePlain(),
      }),
    ).toThrow(CommunicationConversationArchivedException);
    expect(() =>
      assertMessageAllowsReaction({
        conversation: conversationPlain({ status: 'CLOSED' }),
        message: messagePlain(),
      }),
    ).toThrow(CommunicationConversationClosedException);
    expect(() =>
      assertMessageAllowsReaction({
        conversation: conversationPlain(),
        message: messagePlain({ status: 'HIDDEN' }),
      }),
    ).toThrow(CommunicationMessageHiddenException);
    expect(() =>
      assertMessageAllowsReaction({
        conversation: conversationPlain(),
        message: messagePlain({ status: 'DELETED' }),
      }),
    ).toThrow(CommunicationMessageDeletedException);
  });

  it('rejects non-active participants', () => {
    expect(() =>
      assertParticipantAllowsReaction(
        participantPlain({ status: 'REMOVED' }),
      ),
    ).toThrow(CommunicationParticipantNotActiveException);
    expect(() =>
      assertParticipantAllowsReaction(participantPlain({ status: 'MUTED' })),
    ).toThrow(CommunicationParticipantNotActiveException);
  });
});

function conversationPlain(
  overrides?: Partial<PlainReactionConversation>,
): PlainReactionConversation {
  return {
    id: 'conversation-1',
    status: 'ACTIVE',
    ...(overrides ?? {}),
  };
}

function messagePlain(
  overrides?: Partial<PlainReactionMessage>,
): PlainReactionMessage {
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
  overrides?: Partial<PlainReactionParticipant>,
): PlainReactionParticipant {
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
