import {
  CommunicationConversationStatus,
  CommunicationConversationType,
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
    ...(overrides ?? {}),
  };
}
