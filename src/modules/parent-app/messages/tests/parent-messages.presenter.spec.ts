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

  it('adds readCount aliases and ignores sender self-read rows', () => {
    const ownMessage = ParentMessagesPresenter.presentMessage({
      message: messageFixture({
        senderUserId: 'parent-user-1',
        reads: [
          { userId: 'parent-user-1' },
          { userId: 'teacher-user-1' },
        ],
        _count: { reads: 2 },
      }),
      parentUserId: 'parent-user-1',
    });
    const receivedMessage = ParentMessagesPresenter.presentMessage({
      message: messageFixture({
        senderUserId: 'teacher-user-1',
        reads: [{ userId: 'parent-user-1' }],
        _count: { reads: 1 },
      }),
      parentUserId: 'parent-user-1',
    });

    expect(ownMessage.message).toMatchObject({
      readCount: 1,
      read_count: 1,
      isRead: true,
      is_read: true,
    });
    expect(receivedMessage.message).toMatchObject({
      readCount: 1,
      read_count: 1,
      isRead: true,
      is_read: true,
    });
  });

  it('keeps own sent messages unread when only the sender has a historical read row', () => {
    const ownMessage = ParentMessagesPresenter.presentMessage({
      message: messageFixture({
        senderUserId: 'parent-user-1',
        reads: [{ userId: 'parent-user-1' }],
        _count: { reads: 1 },
      }),
      parentUserId: 'parent-user-1',
    });

    expect(ownMessage.message.readCount).toBe(0);
    expect(ownMessage.message.read_count).toBe(0);
    expect(ownMessage.message.isRead).toBe(false);
    expect(ownMessage.message.is_read).toBe(false);
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
