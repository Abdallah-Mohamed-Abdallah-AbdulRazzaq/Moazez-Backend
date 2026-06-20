import {
  CommunicationConversationStatus,
  CommunicationConversationType,
  CommunicationMessageKind,
  CommunicationMessageStatus,
} from '@prisma/client';
import {
  presentCommunicationConversation,
  presentCommunicationConversationList,
} from '../presenters/communication-conversation.presenter';
import { CommunicationConversationRecord } from '../infrastructure/communication-conversation.repository';

describe('communication conversation presenter', () => {
  it('maps enum values to lowercase frontend values', () => {
    const result = presentCommunicationConversation(conversationRecord());

    expect(result.type).toBe('school_wide');
    expect(result.status).toBe('active');
  });

  it('never exposes schoolId or message body fields', () => {
    const result = presentCommunicationConversation(
      conversationRecord({
        metadata: {
          schoolId: 'school-1',
          body: 'private body',
          message: 'private message',
          nested: {
            lastMessageBody: 'nested private body',
            safe: true,
          },
        },
      }),
    );
    const json = JSON.stringify(result);

    expect(result).not.toHaveProperty('schoolId');
    expect(result.metadata).toEqual({ nested: { safe: true } });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('private body');
    expect(json).not.toContain('private message');
  });

  it('presents metadata-backed flags and safe participant summary', () => {
    const result = presentCommunicationConversation(
      conversationRecord({
        metadata: {
          isReadOnly: true,
          isOfficial: true,
          isPinned: true,
        },
      }),
      {
        participantSummary: {
          total: 2,
          active: 2,
          invited: 0,
          left: 0,
          removed: 0,
          muted: 0,
          blocked: 0,
        },
      },
    );

    expect(result).toMatchObject({
      isReadOnly: true,
      isOfficial: true,
      isPinned: true,
      participantCount: 2,
      participantSummary: { total: 2, active: 2 },
    });
  });

  it('presents list zero state safely', () => {
    const result = presentCommunicationConversationList({
      items: [],
      total: 0,
      limit: 50,
      page: 1,
      summary: {
        total: 0,
        active: 0,
        archived: 0,
        closed: 0,
        direct: 0,
        group: 0,
        classroom: 0,
        grade: 0,
        section: 0,
        stage: 0,
        schoolWide: 0,
        support: 0,
        system: 0,
      },
    });

    expect(result.items).toEqual([]);
    expect(result.summary.total).toBe(0);
  });

  it('adds safe core list enrichment without changing the wrapper contract', () => {
    const result = presentCommunicationConversationList({
      items: [
        conversationRecord({
          type: CommunicationConversationType.GROUP,
          _count: { participants: 4 },
          participants: [
            { id: 'participant-active' },
            { id: 'participant-muted' },
          ],
          messages: [
            messageRecord({
              reads: [{ userId: 'sender-user-1' }, { userId: 'reader-user-1' }],
            }),
          ],
        }),
      ],
      total: 1,
      limit: 50,
      page: 1,
      summary: {
        total: 1,
        active: 1,
        archived: 0,
        closed: 0,
        direct: 0,
        group: 1,
        classroom: 0,
        grade: 0,
        section: 0,
        stage: 0,
        schoolWide: 0,
        support: 0,
        system: 0,
      },
    });
    const item = result.items[0];
    const serialized = JSON.stringify(item);

    expect(result).toMatchObject({
      total: 1,
      limit: 50,
      page: 1,
      summary: expect.objectContaining({ group: 1 }),
    });
    expect(item).toMatchObject({
      participantCount: 4,
      activeParticipantsCount: 2,
      participantsCount: 2,
      unreadCount: null,
      isGroup: true,
      lastMessageReadCount: 1,
    });
    expect(item.lastMessage).toMatchObject({
      id: 'message-1',
      messageId: 'message-1',
      body: 'Visible text',
      content: 'Visible text',
      clientMessageId: 'client-message-1',
      readCount: 1,
    });
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('hiddenReason');
  });

  it('hides hidden or deleted core last-message body while keeping read counts', () => {
    const hidden = presentCommunicationConversation(
      conversationRecord({
        messages: [
          messageRecord({
            status: CommunicationMessageStatus.HIDDEN,
            hiddenAt: new Date('2026-05-02T09:00:00.000Z'),
            body: 'hidden body',
            reads: [{ userId: 'reader-user-1' }],
          }),
        ],
      }),
    );

    expect(hidden.lastMessage).toMatchObject({
      body: null,
      content: null,
      readCount: 1,
    });
    expect(JSON.stringify(hidden)).not.toContain('hidden body');
  });
});

function conversationRecord(
  overrides?: Partial<CommunicationConversationRecord>,
): CommunicationConversationRecord {
  return {
    id: 'conversation-1',
    schoolId: 'school-1',
    type: CommunicationConversationType.SCHOOL_WIDE,
    status: CommunicationConversationStatus.ACTIVE,
    titleEn: 'School updates',
    titleAr: null,
    descriptionEn: 'Official school-wide updates',
    descriptionAr: null,
    avatarFileId: null,
    academicYearId: 'academic-year-1',
    termId: null,
    stageId: null,
    gradeId: null,
    sectionId: null,
    classroomId: null,
    subjectId: null,
    createdById: 'user-1',
    archivedById: null,
    archivedAt: null,
    closedById: null,
    closedAt: null,
    lastMessageAt: null,
    metadata: null,
    createdAt: new Date('2026-05-02T08:00:00.000Z'),
    updatedAt: new Date('2026-05-02T08:30:00.000Z'),
    deletedAt: null,
    _count: { participants: 1 },
    participants: [],
    messages: [],
    ...(overrides ?? {}),
  };
}

function messageRecord(
  overrides?: Partial<CommunicationConversationRecord['messages'][number]>,
): CommunicationConversationRecord['messages'][number] {
  return {
    id: 'message-1',
    conversationId: 'conversation-1',
    senderUserId: 'sender-user-1',
    kind: CommunicationMessageKind.TEXT,
    status: CommunicationMessageStatus.SENT,
    body: 'Visible text',
    clientMessageId: 'client-message-1',
    replyToMessageId: null,
    editedAt: null,
    hiddenAt: null,
    deletedAt: null,
    sentAt: new Date('2026-05-02T09:00:00.000Z'),
    createdAt: new Date('2026-05-02T09:00:00.000Z'),
    updatedAt: new Date('2026-05-02T09:00:00.000Z'),
    reads: [],
    ...(overrides ?? {}),
  };
}
