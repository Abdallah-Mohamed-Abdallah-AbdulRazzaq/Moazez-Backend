import { CommunicationMessageStatus } from '@prisma/client';
import {
  CommunicationMessageDeletedException,
  CommunicationMessageHiddenException,
} from '../domain/communication-message-domain';
import {
  assertModerationActionCanAffectMessage,
  CommunicationModerationForbiddenException,
  normalizeCommunicationModerationAction,
} from '../domain/communication-moderation-domain';

describe('communication moderation domain', () => {
  it('normalizes supported lowercase actions to Prisma enum values', () => {
    expect(normalizeCommunicationModerationAction('hide')).toBe(
      'MESSAGE_HIDDEN',
    );
    expect(normalizeCommunicationModerationAction('unhide')).toBe(
      'MESSAGE_UNHIDDEN',
    );
    expect(normalizeCommunicationModerationAction('delete')).toBe(
      'MESSAGE_DELETED',
    );
    expect(normalizeCommunicationModerationAction('restrict_sender')).toBe(
      'USER_RESTRICTED',
    );
  });

  it('enforces safe message state transitions', () => {
    expect(() =>
      assertModerationActionCanAffectMessage({
        action: 'MESSAGE_HIDDEN',
        message: messagePlain({ status: CommunicationMessageStatus.HIDDEN }),
      }),
    ).toThrow(CommunicationMessageHiddenException);

    expect(() =>
      assertModerationActionCanAffectMessage({
        action: 'MESSAGE_UNHIDDEN',
        message: messagePlain({ status: CommunicationMessageStatus.SENT }),
      }),
    ).toThrow(CommunicationModerationForbiddenException);

    expect(() =>
      assertModerationActionCanAffectMessage({
        action: 'MESSAGE_DELETED',
        message: messagePlain({ status: CommunicationMessageStatus.DELETED }),
      }),
    ).toThrow(CommunicationMessageDeletedException);

    expect(() =>
      assertModerationActionCanAffectMessage({
        action: 'USER_RESTRICTED',
        message: messagePlain({ senderUserId: null }),
      }),
    ).toThrow(CommunicationModerationForbiddenException);
  });
});

function messagePlain(overrides?: Record<string, unknown>) {
  return {
    id: 'message-1',
    conversationId: 'conversation-1',
    senderUserId: 'sender-1',
    status: CommunicationMessageStatus.SENT,
    hiddenAt: null,
    deletedAt: null,
    ...(overrides ?? {}),
  } as any;
}
