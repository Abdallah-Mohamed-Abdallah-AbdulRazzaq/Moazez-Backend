import {
  CommunicationConversationStatus,
  CommunicationConversationType,
  CommunicationMessageKind,
  CommunicationMessageStatus,
  CommunicationParticipantRole,
  CommunicationParticipantStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { ParentMessagesPresenter } from '../presenters/parent-messages.presenter';
import type {
  ParentMessageConversationRecord,
  ParentMessageRecord,
} from '../infrastructure/parent-messages-read.adapter';

describe('ParentMessagesPresenter', () => {
  it('hides hidden and deleted message body/content from parent responses', () => {
    const hidden = ParentMessagesPresenter.presentMessage({
      message: messageFixture({
        status: CommunicationMessageStatus.HIDDEN,
        hiddenAt: new Date('2026-01-01T00:01:00.000Z'),
        attachments: [attachmentFixture()],
      } as Partial<ParentMessageRecord>),
      parentUserId: 'parent-user-1',
    });
    const deleted = ParentMessagesPresenter.presentMessage({
      message: messageFixture({
        status: CommunicationMessageStatus.DELETED,
        deletedAt: new Date('2026-01-01T00:02:00.000Z'),
        attachments: [attachmentFixture()],
      } as Partial<ParentMessageRecord>),
      parentUserId: 'parent-user-1',
    });

    expect(hidden.message.body).toBeNull();
    expect(hidden.message.content).toBeNull();
    expect(hidden.message.attachments).toEqual([]);
    expect(hidden.message.attachmentsCount).toBe(0);
    expect(hidden.message.attachments_count).toBe(0);
    expect(deleted.message.body).toBeNull();
    expect(deleted.message.content).toBeNull();
    expect(deleted.message.attachments).toEqual([]);
    expect(deleted.message.attachmentsCount).toBe(0);
    expect(deleted.message.attachments_count).toBe(0);
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

  it('presents parent message search with dual aliases and no unsafe fields', () => {
    const result = ParentMessagesPresenter.presentMessageSearch({
      result: {
        conversationId: 'conversation-1',
        items: [messageFixture({ attachments: [attachmentFixture()] })],
        total: 1,
        page: 1,
        limit: 20,
      },
      parentUserId: 'parent-user-1',
      query: 'teacher',
    });
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      conversationId: 'conversation-1',
      conversation_id: 'conversation-1',
      query: 'teacher',
      pagination: { page: 1, limit: 20, total: 1 },
    });
    expect(result.messages[0]).toMatchObject({
      messageId: 'message-1',
      message_id: 'message-1',
      senderType: 'me',
      sender_type: 'me',
      attachmentsCount: 1,
      attachments_count: 1,
    });
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('uploadedById');
    expect(serialized).not.toContain('bucket');
    expect(serialized).not.toContain('objectKey');
    expect(serialized).not.toContain('deletedAt');
  });

  it('presents enriched parent conversation list cards safely', () => {
    const result = ParentMessagesPresenter.presentConversationList({
      result: {
        items: [
          conversationFixture({
            type: CommunicationConversationType.CLASSROOM,
            participants: [
              participantFixture('parent-user-1', UserType.PARENT),
              participantFixture(
                'teacher-user-1',
                UserType.TEACHER,
                CommunicationParticipantStatus.MUTED,
              ),
            ],
            messages: [
              messageFixture({
                senderUserId: 'teacher-user-1',
                reads: [
                  { userId: 'teacher-user-1' },
                  { userId: 'parent-user-1' },
                ],
                _count: { reads: 2 },
              }),
            ],
          }),
        ],
        total: 1,
        page: 1,
        limit: 20,
        unreadCounts: new Map([['conversation-1', 3]]),
      },
      parentUserId: 'parent-user-1',
    });
    const card = result.conversations[0];
    const serialized = JSON.stringify(card);

    expect(card).toMatchObject({
      conversationId: 'conversation-1',
      conversation_id: 'conversation-1',
      isGroup: true,
      is_group: true,
      participantsCount: 2,
      participants_count: 2,
      unreadCount: 3,
      unread_count: 3,
      lastMessageReadCount: 1,
      last_message_read_count: 1,
    });
    expect(card.lastMessage).toMatchObject({
      id: 'message-1',
      messageId: 'message-1',
      message_id: 'message-1',
      senderType: 'other',
      sender_type: 'other',
      text: 'Visible text',
      body: 'Visible text',
      content: 'Visible text',
      readCount: 1,
      read_count: 1,
      attachmentsCount: 0,
      attachments_count: 0,
      created_at: '2026-01-01T00:00:00.000Z',
    });
    expect(card.last_message).toEqual(card.lastMessage);
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
    expect(serialized).not.toContain('membershipId');
    expect(serialized).not.toContain('roleId');
  });

  it('hides hidden parent last-message bodies and maps direct chats as non-group', () => {
    const result = ParentMessagesPresenter.presentConversationList({
      result: {
        items: [
          conversationFixture({
            messages: [
              messageFixture({
                status: CommunicationMessageStatus.HIDDEN,
                hiddenAt: new Date('2026-01-01T00:01:00.000Z'),
                body: 'hidden list body',
              }),
            ],
          }),
        ],
        total: 1,
        page: 1,
        limit: 20,
        unreadCounts: new Map(),
      },
      parentUserId: 'parent-user-1',
    });
    const card = result.conversations[0];

    expect(card.isGroup).toBe(false);
    expect(card.lastMessage?.body).toBeNull();
    expect(card.lastMessage?.content).toBeNull();
    expect(JSON.stringify(card)).not.toContain('hidden list body');
  });

  it('adds readCount aliases and ignores sender self-read rows', () => {
    const ownMessage = ParentMessagesPresenter.presentMessage({
      message: messageFixture({
        senderUserId: 'parent-user-1',
        reads: [{ userId: 'parent-user-1' }, { userId: 'teacher-user-1' }],
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

  it('presents safe attachment metadata with dual aliases', () => {
    const result = ParentMessagesPresenter.presentMessage({
      message: messageFixture({
        attachments: [attachmentFixture()],
      } as Partial<ParentMessageRecord>),
      parentUserId: 'parent-user-1',
    });
    const serialized = JSON.stringify(result);

    expect(result.message.attachments).toEqual([
      expect.objectContaining({
        attachmentId: 'attachment-1',
        attachment_id: 'attachment-1',
        fileId: 'file-1',
        file_id: 'file-1',
        displayName: 'photo.jpg',
        display_name: 'photo.jpg',
        mimeType: 'image/jpeg',
        mime_type: 'image/jpeg',
        sizeBytes: '123456',
        size_bytes: '123456',
        mediaKind: 'image',
        media_kind: 'image',
        caption: 'Photo caption',
        sortOrder: 0,
        sort_order: 0,
        downloadPath: '/api/v1/files/file-1/download',
        download_path: '/api/v1/files/file-1/download',
        authorizedDownloadPath:
          '/api/v1/parent/messages/conversations/conversation-1/messages/message-1/attachments/attachment-1/download',
        authorized_download_path:
          '/api/v1/parent/messages/conversations/conversation-1/messages/message-1/attachments/attachment-1/download',
        previewPath:
          '/api/v1/parent/messages/conversations/conversation-1/messages/message-1/attachments/attachment-1/preview',
        preview_path:
          '/api/v1/parent/messages/conversations/conversation-1/messages/message-1/attachments/attachment-1/preview',
      }),
    ]);
    expect(result.message.attachmentsCount).toBe(1);
    expect(result.message.attachments_count).toBe(1);
    for (const forbidden of [
      'uploadedById',
      'createdById',
      'ownerId',
      'schoolId',
      'organizationId',
      'membershipId',
      'roleId',
      'bucket',
      'objectKey',
      'storageKey',
      'signedUrl',
      'metadata',
      'providerMetadata',
      'virusScan',
      'deletedAt',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
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

function conversationFixture(
  overrides?: Partial<ParentMessageConversationRecord>,
): ParentMessageConversationRecord {
  return {
    id: 'conversation-1',
    type: CommunicationConversationType.DIRECT,
    status: CommunicationConversationStatus.ACTIVE,
    titleEn: null,
    titleAr: null,
    descriptionEn: null,
    descriptionAr: null,
    lastMessageAt: new Date('2026-01-01T00:00:00.000Z'),
    metadata: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    participants: [
      participantFixture('parent-user-1', UserType.PARENT),
      participantFixture('teacher-user-1', UserType.TEACHER),
    ],
    messages: [messageFixture()],
    ...(overrides ?? {}),
  } as unknown as ParentMessageConversationRecord;
}

function participantFixture(
  userId: string,
  userType: UserType,
  status: CommunicationParticipantStatus = CommunicationParticipantStatus.ACTIVE,
) {
  return {
    id: `participant-${userId}`,
    conversationId: 'conversation-1',
    userId,
    role: CommunicationParticipantRole.MEMBER,
    status,
    lastReadMessageId: null,
    lastReadAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    user: {
      id: userId,
      firstName: userType === UserType.PARENT ? 'Mona' : 'Test',
      lastName: userType === UserType.PARENT ? 'Parent' : 'Teacher',
      userType,
      status: UserStatus.ACTIVE,
    },
  };
}

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
    attachments: [],
    reads: [],
    _count: { reads: 0 },
    ...overrides,
  } as unknown as ParentMessageRecord;
}

function attachmentFixture() {
  return {
    id: 'attachment-1',
    fileId: 'file-1',
    uploadedById: 'uploader-1',
    createdById: 'creator-1',
    ownerId: 'owner-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    roleId: 'role-1',
    caption: 'Photo caption',
    sortOrder: 0,
    createdAt: new Date('2026-01-01T00:03:00.000Z'),
    deletedAt: new Date('2026-01-01T00:04:00.000Z'),
    file: {
      id: 'file-1',
      originalName: 'photo.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: BigInt(123456),
      bucket: 'private-bucket',
      objectKey: 'objects/file-1',
      storageKey: 'storage/file-1',
      signedUrl: 'https://storage.example/file-1',
      metadata: { provider: 's3' },
      providerMetadata: { storageClass: 'standard' },
      virusScan: { status: 'passed' },
      deletedAt: new Date('2026-01-01T00:04:00.000Z'),
    },
  };
}
