import {
  CommunicationConversationStatus,
  CommunicationConversationType,
  CommunicationMessageKind,
  CommunicationMessageStatus,
  CommunicationParticipantRole,
  CommunicationParticipantStatus,
  FileVisibility,
  UserStatus,
  UserType,
} from '@prisma/client';
import type {
  TeacherMessageConversationRecord,
  TeacherMessageRecord,
} from '../infrastructure/teacher-messages-read.adapter';
import { TeacherMessagesPresenter } from '../presenters/teacher-messages.presenter';

const TEACHER_ID = 'teacher-1';
const CONVERSATION_ID = 'conversation-1';

describe('TeacherMessagesPresenter', () => {
  it('presents conversation cards and details without school or participant internals', () => {
    const conversation = conversationFixture();

    const list = TeacherMessagesPresenter.presentConversationList({
      result: {
        items: [conversation],
        total: 1,
        page: 1,
        limit: 20,
        unreadCounts: new Map([[CONVERSATION_ID, 2]]),
      },
      teacherUserId: TEACHER_ID,
    });
    const detail = TeacherMessagesPresenter.presentConversation({
      conversation,
      teacherUserId: TEACHER_ID,
      unreadCount: 2,
    });
    const json = JSON.stringify({ list, detail });

    expect(list.conversations[0]).toMatchObject({
      conversationId: CONVERSATION_ID,
      displayName: 'Mona Parent',
      unreadCount: 2,
      participantsCount: 2,
    });
    expect(detail.conversation.ownReadState).toEqual({
      lastReadMessageId: 'message-0',
      lastReadAt: '2026-09-18T09:30:00.000Z',
    });
    expect(detail.conversation.participants).toEqual([
      expect.objectContaining({
        userId: TEACHER_ID,
        displayName: 'Test Teacher',
        isMe: true,
      }),
      expect.objectContaining({
        userId: 'parent-1',
        displayName: 'Mona Parent',
        isMe: false,
      }),
    ]);
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('scheduleId');
    expect(json).not.toContain('mutedUntil');
    expect(json).not.toContain('email');
  });

  it('hides hidden and deleted message bodies and does not expose moderation fields', () => {
    const result = TeacherMessagesPresenter.presentMessageList({
      result: {
        conversationId: CONVERSATION_ID,
        items: [
          messageFixture({ id: 'visible-message', body: 'Visible body' }),
          messageFixture({
            id: 'hidden-message',
            status: CommunicationMessageStatus.HIDDEN,
            body: 'Hidden body should not leak',
            hiddenAt: new Date('2026-09-18T10:05:00.000Z'),
          }),
          messageFixture({
            id: 'deleted-message',
            status: CommunicationMessageStatus.DELETED,
            body: 'Deleted body should not leak',
            deletedAt: new Date('2026-09-18T10:10:00.000Z'),
          }),
        ],
        total: 3,
        page: 1,
        limit: 50,
      },
      teacherUserId: TEACHER_ID,
    });
    const json = JSON.stringify(result);

    expect(result.messages[0].body).toBe('Visible body');
    expect(result.messages[1].body).toBeNull();
    expect(result.messages[1].content).toBeNull();
    expect(result.messages[2].body).toBeNull();
    expect(result.messages[2].content).toBeNull();
    expect(json).not.toContain('Hidden body should not leak');
    expect(json).not.toContain('Deleted body should not leak');
    expect(json).not.toContain('hiddenById');
    expect(json).not.toContain('deletedById');
    expect(json).not.toContain('hiddenReason');
  });

  it('presents safe attachment and reaction summaries without raw file storage keys', () => {
    const result = TeacherMessagesPresenter.presentMessage({
      message: messageFixture({
        reactions: [
          {
            id: 'reaction-1',
            reactionKey: 'like',
            emoji: 'thumbs-up',
            userId: TEACHER_ID,
          },
          {
            id: 'reaction-2',
            reactionKey: 'like',
            emoji: 'thumbs-up',
            userId: 'parent-1',
          },
        ],
        attachments: [
          {
            id: 'attachment-1',
            fileId: 'file-1',
            caption: 'Worksheet',
            sortOrder: 1,
            createdAt: new Date('2026-09-18T10:00:00.000Z'),
            file: {
              id: 'file-1',
              originalName: 'worksheet.pdf',
              mimeType: 'application/pdf',
              sizeBytes: BigInt(1234),
              visibility: FileVisibility.PRIVATE,
              createdAt: new Date('2026-09-18T10:00:00.000Z'),
            },
          },
        ],
      }),
      teacherUserId: TEACHER_ID,
    });
    const json = JSON.stringify(result);

    expect(result.message.reactions).toEqual([
      {
        key: 'like',
        emoji: 'thumbs-up',
        count: 2,
        reactedByMe: true,
      },
    ]);
    expect(result.message.attachments).toEqual([
      expect.objectContaining({
        attachmentId: 'attachment-1',
        fileId: 'file-1',
        originalName: 'worksheet.pdf',
        downloadPath: '/api/v1/files/file-1/download',
      }),
    ]);
    expect(json).not.toContain('bucket');
    expect(json).not.toContain('objectKey');
    expect(json).not.toContain('raw-storage');
    expect(json).not.toContain('metadata');
  });
});

function conversationFixture(): TeacherMessageConversationRecord {
  const now = new Date('2026-09-18T09:00:00.000Z');
  return {
    id: CONVERSATION_ID,
    type: CommunicationConversationType.DIRECT,
    status: CommunicationConversationStatus.ACTIVE,
    titleEn: null,
    titleAr: null,
    descriptionEn: null,
    descriptionAr: null,
    lastMessageAt: now,
    metadata: { isReadOnly: false, isPinned: true },
    createdAt: now,
    updatedAt: now,
    participants: [
      participantFixture(TEACHER_ID, 'Test', 'Teacher', UserType.TEACHER),
      participantFixture('parent-1', 'Mona', 'Parent', UserType.PARENT),
    ],
    messages: [messageFixture()],
  } as unknown as TeacherMessageConversationRecord;
}

function participantFixture(
  userId: string,
  firstName: string,
  lastName: string,
  userType: UserType,
) {
  return {
    id: `participant-${userId}`,
    conversationId: CONVERSATION_ID,
    userId,
    role: CommunicationParticipantRole.MEMBER,
    status: CommunicationParticipantStatus.ACTIVE,
    lastReadMessageId: userId === TEACHER_ID ? 'message-0' : null,
    lastReadAt:
      userId === TEACHER_ID ? new Date('2026-09-18T09:30:00.000Z') : null,
    createdAt: new Date('2026-09-18T08:00:00.000Z'),
    updatedAt: new Date('2026-09-18T08:00:00.000Z'),
    user: {
      id: userId,
      firstName,
      lastName,
      userType,
      status: UserStatus.ACTIVE,
    },
  };
}

function messageFixture(
  overrides?: Partial<TeacherMessageRecord>,
): TeacherMessageRecord {
  const now = new Date('2026-09-18T10:00:00.000Z');
  return {
    id: 'message-1',
    conversationId: CONVERSATION_ID,
    senderUserId: TEACHER_ID,
    kind: CommunicationMessageKind.TEXT,
    status: CommunicationMessageStatus.SENT,
    body: 'Hello',
    replyToMessageId: null,
    editedAt: null,
    hiddenAt: null,
    deletedAt: null,
    sentAt: now,
    createdAt: now,
    updatedAt: now,
    senderUser: {
      id: TEACHER_ID,
      firstName: 'Test',
      lastName: 'Teacher',
      userType: UserType.TEACHER,
      status: UserStatus.ACTIVE,
    },
    reactions: [],
    attachments: [],
    _count: { reads: 0 },
    ...overrides,
  } as unknown as TeacherMessageRecord;
}
