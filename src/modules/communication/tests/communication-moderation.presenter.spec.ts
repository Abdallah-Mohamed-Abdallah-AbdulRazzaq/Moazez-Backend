import {
  CommunicationMessageKind,
  CommunicationMessageStatus,
  CommunicationModerationActionType,
} from '@prisma/client';
import {
  presentCommunicationModerationAction,
  presentCommunicationModerationMutation,
} from '../presenters/communication-moderation.presenter';

describe('communication moderation presenter', () => {
  it('maps action enum values and omits schoolId and message body', () => {
    const action = actionRecord();
    const response = presentCommunicationModerationAction(action);
    const mutation = presentCommunicationModerationMutation({
      action,
      message: messageRecord(),
    });
    const json = JSON.stringify({ response, mutation });

    expect(response).toMatchObject({
      id: 'action-1',
      action: 'hide',
      actionType: 'hide',
      messageId: 'message-1',
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('body');
    expect(json).not.toContain('hidden text');
  });
});

function actionRecord() {
  const now = new Date('2026-05-02T08:00:00.000Z');
  return {
    id: 'action-1',
    schoolId: 'school-1',
    conversationId: 'conversation-1',
    messageId: 'message-1',
    targetUserId: 'sender-1',
    actorUserId: 'moderator-1',
    actionType: CommunicationModerationActionType.MESSAGE_HIDDEN,
    reason: 'Unsafe',
    metadata: { schoolId: 'school-1', body: 'hidden text' },
    createdAt: now,
    updatedAt: now,
  } as any;
}

function messageRecord() {
  const now = new Date('2026-05-02T08:00:00.000Z');
  return {
    id: 'message-1',
    schoolId: 'school-1',
    conversationId: 'conversation-1',
    senderUserId: 'sender-1',
    kind: CommunicationMessageKind.TEXT,
    status: CommunicationMessageStatus.HIDDEN,
    hiddenById: 'moderator-1',
    hiddenAt: now,
    hiddenReason: 'Unsafe',
    deletedById: null,
    deletedAt: null,
    sentAt: now,
    createdAt: now,
    updatedAt: now,
    body: 'hidden text',
    conversation: {
      id: 'conversation-1',
      schoolId: 'school-1',
      status: 'ACTIVE',
    },
  } as any;
}
