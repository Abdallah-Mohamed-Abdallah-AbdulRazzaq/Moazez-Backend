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
import { StudentMessagesPresenter } from '../presenters/student-messages.presenter';

describe('StudentMessagesPresenter', () => {
  it('hides body/content for hidden and deleted messages', () => {
    const result = StudentMessagesPresenter.presentMessageList({
      result: {
        conversationId: 'conversation-1',
        items: [
          messageFixture({
            id: 'message-hidden',
            status: CommunicationMessageStatus.HIDDEN,
            body: 'hidden raw body',
            attachments: [attachmentFixture()],
          }),
          messageFixture({
            id: 'message-deleted',
            status: CommunicationMessageStatus.DELETED,
            body: 'deleted raw body',
            attachments: [attachmentFixture()],
          }),
          messageFixture({
            id: 'message-visible',
            status: CommunicationMessageStatus.SENT,
            body: 'visible body',
          }),
        ] as any,
        total: 3,
        page: 1,
        limit: 50,
      },
      studentUserId: 'student-user-1',
    });
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('hidden raw body');
    expect(serialized).not.toContain('deleted raw body');
    expect(result.messages[0].attachments).toEqual([]);
    expect(result.messages[0].attachmentsCount).toBe(0);
    expect(result.messages[0].attachments_count).toBe(0);
    expect(result.messages[1].attachments).toEqual([]);
    expect(serialized).toContain('visible body');
  });

  it('presents conversations without storage keys or school ids', () => {
    const result = StudentMessagesPresenter.presentConversationList({
      result: {
        items: [conversationFixture() as any],
        total: 1,
        page: 1,
        limit: 20,
        unreadCounts: new Map([['conversation-1', 2]]),
      },
      studentUserId: 'student-user-1',
    });
    const serialized = JSON.stringify(result);

    expect(result.conversations[0]).toMatchObject({
      conversationId: 'conversation-1',
      unreadCount: 2,
      participantsCount: 2,
      isGroup: false,
      lastMessageReadCount: 0,
      avatar_url: null,
    });
    expect(result.conversations[0].lastMessage).toMatchObject({
      id: 'message-1',
      message_id: 'message-1',
      readCount: 0,
      read_count: 0,
      attachmentsCount: 0,
      attachments_count: 0,
      created_at: '2026-01-01T08:00:00.000Z',
    });
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
    expect(serialized).not.toContain('scheduleId');
    expect(serialized).not.toContain('bucket');
    expect(serialized).not.toContain('objectKey');
  });

  it('presents safe attachment metadata with dual aliases', () => {
    const result = StudentMessagesPresenter.presentMessageList({
      result: {
        conversationId: 'conversation-1',
        items: [
          messageFixture({
            id: 'message-with-attachment',
            attachments: [attachmentFixture()],
          }),
        ] as any,
        total: 1,
        page: 1,
        limit: 50,
      },
      studentUserId: 'student-user-1',
    });
    const serialized = JSON.stringify(result);

    expect(result.messages[0].attachments).toEqual([
      expect.objectContaining({
        attachmentId: 'attachment-1',
        attachment_id: 'attachment-1',
        fileId: 'file-1',
        file_id: 'file-1',
        displayName: 'voice-note.mp3',
        display_name: 'voice-note.mp3',
        mimeType: 'audio/mpeg',
        mime_type: 'audio/mpeg',
        sizeBytes: '98765',
        size_bytes: '98765',
        mediaKind: 'audio',
        media_kind: 'audio',
        downloadPath: '/api/v1/files/file-1/download',
        download_path: '/api/v1/files/file-1/download',
        authorizedDownloadPath:
          '/api/v1/student/messages/conversations/conversation-1/messages/message-with-attachment/attachments/attachment-1/download',
        authorized_download_path:
          '/api/v1/student/messages/conversations/conversation-1/messages/message-with-attachment/attachments/attachment-1/download',
        previewPath:
          '/api/v1/student/messages/conversations/conversation-1/messages/message-with-attachment/attachments/attachment-1/preview',
        preview_path:
          '/api/v1/student/messages/conversations/conversation-1/messages/message-with-attachment/attachments/attachment-1/preview',
      }),
    ]);
    expect(result.messages[0].attachmentsCount).toBe(1);
    expect(result.messages[0].attachments_count).toBe(1);
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

  it('presents student message search with dual aliases and no unsafe fields', () => {
    const result = StudentMessagesPresenter.presentMessageSearch({
      result: {
        conversationId: 'conversation-1',
        items: [
          messageFixture({
            id: 'message-with-attachment',
            attachments: [attachmentFixture()],
          }),
        ] as any,
        total: 1,
        page: 1,
        limit: 20,
      },
      studentUserId: 'student-user-1',
      query: 'science',
    });
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      conversationId: 'conversation-1',
      conversation_id: 'conversation-1',
      query: 'science',
      pagination: { page: 1, limit: 20, total: 1 },
    });
    expect(result.messages[0]).toMatchObject({
      messageId: 'message-with-attachment',
      message_id: 'message-with-attachment',
      senderType: 'other',
      sender_type: 'other',
      attachmentsCount: 1,
      attachments_count: 1,
    });
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('uploadedById');
    expect(serialized).not.toContain('bucket');
    expect(serialized).not.toContain('objectKey');
    expect(serialized).not.toContain('deletedAt');
  });

  it('presents student list enrichment with group mapping and sender-excluded last-message reads', () => {
    const result = StudentMessagesPresenter.presentConversationList({
      result: {
        items: [
          conversationFixture({
            type: CommunicationConversationType.GRADE,
            participants: [
              participantFixture('student-user-1', UserType.STUDENT),
              participantFixture(
                'teacher-user-1',
                UserType.TEACHER,
                CommunicationParticipantStatus.MUTED,
              ),
            ],
            messages: [
              messageFixture({
                id: 'message-1',
                body: 'Grade update',
                reads: [
                  { userId: 'teacher-user-1' },
                  { userId: 'student-user-1' },
                ],
                _count: { reads: 2 },
              }),
            ],
          }) as any,
        ],
        total: 1,
        page: 1,
        limit: 20,
        unreadCounts: new Map([['conversation-1', 4]]),
      },
      studentUserId: 'student-user-1',
    });
    const card = result.conversations[0];

    expect(card).toMatchObject({
      isGroup: true,
      is_group: true,
      participantsCount: 2,
      participants_count: 2,
      unreadCount: 4,
      unread_count: 4,
      lastMessageReadCount: 1,
      last_message_read_count: 1,
    });
    expect(card.lastMessage).toMatchObject({
      senderType: 'other',
      sender_type: 'other',
      text: 'Grade update',
      readCount: 1,
      read_count: 1,
    });
  });

  it('hides hidden student last-message body without leaking raw text', () => {
    const result = StudentMessagesPresenter.presentConversationList({
      result: {
        items: [
          conversationFixture({
            messages: [
              messageFixture({
                id: 'message-hidden',
                status: CommunicationMessageStatus.HIDDEN,
                body: 'hidden student list body',
              }),
            ],
          }) as any,
        ],
        total: 1,
        page: 1,
        limit: 20,
        unreadCounts: new Map(),
      },
      studentUserId: 'student-user-1',
    });

    expect(result.conversations[0].lastMessage?.body).toBeNull();
    expect(result.conversations[0].lastMessage?.content).toBeNull();
    expect(JSON.stringify(result)).not.toContain('hidden student list body');
  });

  it('adds readCount aliases and ignores sender self-read rows', () => {
    const result = StudentMessagesPresenter.presentMessageList({
      result: {
        conversationId: 'conversation-1',
        items: [
          {
            ...messageFixture({
              id: 'own-message',
              body: 'own',
            }),
            senderUserId: 'student-user-1',
            reads: [{ userId: 'student-user-1' }, { userId: 'teacher-user-1' }],
            _count: { reads: 2 },
          },
          {
            ...messageFixture({
              id: 'self-only-message',
              body: 'self only',
            }),
            senderUserId: 'student-user-1',
            reads: [{ userId: 'student-user-1' }],
            _count: { reads: 1 },
          },
        ] as any,
        total: 2,
        page: 1,
        limit: 50,
      },
      studentUserId: 'student-user-1',
    });

    expect(result.messages[0]).toMatchObject({
      readCount: 1,
      read_count: 1,
      isRead: true,
      is_read: true,
    });
    expect(result.messages[1]).toMatchObject({
      readCount: 0,
      read_count: 0,
      isRead: false,
      is_read: false,
    });
  });
});

function conversationFixture(overrides?: Record<string, unknown>) {
  return {
    id: 'conversation-1',
    type: CommunicationConversationType.DIRECT,
    status: CommunicationConversationStatus.ACTIVE,
    titleEn: null,
    titleAr: null,
    descriptionEn: null,
    descriptionAr: null,
    lastMessageAt: new Date('2026-01-01T08:00:00.000Z'),
    metadata: null,
    createdAt: new Date('2026-01-01T08:00:00.000Z'),
    updatedAt: new Date('2026-01-01T08:00:00.000Z'),
    participants: [
      participantFixture('student-user-1', UserType.STUDENT),
      participantFixture('teacher-user-1', UserType.TEACHER),
    ],
    messages: [messageFixture({ id: 'message-1', body: 'Hello' })],
    ...(overrides ?? {}),
  };
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
    createdAt: new Date('2026-01-01T08:00:00.000Z'),
    updatedAt: new Date('2026-01-01T08:00:00.000Z'),
    user: {
      id: userId,
      firstName: userType === UserType.STUDENT ? 'Student' : 'Teacher',
      lastName: 'User',
      userType,
      status: UserStatus.ACTIVE,
    },
  };
}

function messageFixture(params: {
  id: string;
  status?: CommunicationMessageStatus;
  body?: string;
  senderUserId?: string;
  reads?: Array<{ userId: string }>;
  _count?: { reads: number };
  attachments?: unknown[];
}) {
  return {
    id: params.id,
    conversationId: 'conversation-1',
    senderUserId: params.senderUserId ?? 'teacher-user-1',
    kind: CommunicationMessageKind.TEXT,
    status: params.status ?? CommunicationMessageStatus.SENT,
    body: params.body ?? 'Hello',
    replyToMessageId: null,
    editedAt: null,
    hiddenAt:
      params.status === CommunicationMessageStatus.HIDDEN
        ? new Date('2026-01-01T08:00:00.000Z')
        : null,
    deletedAt:
      params.status === CommunicationMessageStatus.DELETED
        ? new Date('2026-01-01T08:00:00.000Z')
        : null,
    sentAt: new Date('2026-01-01T08:00:00.000Z'),
    createdAt: new Date('2026-01-01T08:00:00.000Z'),
    updatedAt: new Date('2026-01-01T08:00:00.000Z'),
    senderUser: {
      id: 'teacher-user-1',
      firstName: 'Teacher',
      lastName: 'User',
      userType: UserType.TEACHER,
      status: UserStatus.ACTIVE,
    },
    reads: params.reads ?? [],
    attachments: params.attachments ?? [],
    _count: params._count ?? { reads: 0 },
  };
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
    caption: null,
    sortOrder: 0,
    createdAt: new Date('2026-01-01T08:03:00.000Z'),
    deletedAt: new Date('2026-01-01T08:04:00.000Z'),
    file: {
      id: 'file-1',
      originalName: 'voice-note.mp3',
      mimeType: 'audio/mpeg',
      sizeBytes: BigInt(98765),
      bucket: 'private-bucket',
      objectKey: 'objects/file-1',
      storageKey: 'storage/file-1',
      signedUrl: 'https://storage.example/file-1',
      metadata: { provider: 's3' },
      providerMetadata: { storageClass: 'standard' },
      virusScan: { status: 'passed' },
      deletedAt: new Date('2026-01-01T08:04:00.000Z'),
    },
  };
}
