import {
  CommunicationMessageKind,
  CommunicationMessageStatus,
} from '@prisma/client';
import { ParentMessagesPresenter } from '../presenters/parent-messages.presenter';
import type { ParentMessageRecord } from '../infrastructure/parent-messages-read.adapter';

describe('ParentMessagesPresenter', () => {
  it('hides hidden and deleted message body/content from parent responses', () => {
    const hidden = ParentMessagesPresenter.presentMessage({
      message: messageFixture({
        status: CommunicationMessageStatus.HIDDEN,
        hiddenAt: new Date('2026-01-01T00:01:00.000Z'),
      }),
      parentUserId: 'parent-user-1',
    });
    const deleted = ParentMessagesPresenter.presentMessage({
      message: messageFixture({
        status: CommunicationMessageStatus.DELETED,
        deletedAt: new Date('2026-01-01T00:02:00.000Z'),
      }),
      parentUserId: 'parent-user-1',
    });

    expect(hidden.message.body).toBeNull();
    expect(hidden.message.content).toBeNull();
    expect(deleted.message.body).toBeNull();
    expect(deleted.message.content).toBeNull();
  });

  it('does not expose internal moderation, report, tenant, schedule, or storage fields', () => {
    const serialized = JSON.stringify(
      ParentMessagesPresenter.presentMessage({
        message: messageFixture(),
        parentUserId: 'parent-user-1',
      }),
    );

    for (const forbidden of [
      'schoolId',
      'organizationId',
      'scheduleId',
      'hiddenReason',
      'report',
      'moderation',
      'bucket',
      'objectKey',
      'storageKey',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

function messageFixture(
  overrides?: Partial<ParentMessageRecord>,
): ParentMessageRecord {
  return {
    id: 'message-1',
    conversationId: 'conversation-1',
    senderUserId: 'parent-user-1',
    kind: CommunicationMessageKind.TEXT,
    status: CommunicationMessageStatus.SENT,
    body: 'Visible text',
    replyToMessageId: null,
    editedAt: null,
    hiddenAt: null,
    deletedAt: null,
    sentAt: new Date('2026-01-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    senderUser: {
      id: 'parent-user-1',
      firstName: 'Mona',
      lastName: 'Parent',
      userType: 'PARENT',
      status: 'ACTIVE',
    },
    reads: [],
    _count: { reads: 0 },
    ...overrides,
  } as unknown as ParentMessageRecord;
}
