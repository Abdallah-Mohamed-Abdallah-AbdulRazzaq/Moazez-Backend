import {
  CommunicationParticipantRole,
  CommunicationParticipantStatus,
  UserType,
} from '@prisma/client';
import { CommunicationParticipantRecord } from '../infrastructure/communication-participant.repository';
import {
  presentCommunicationParticipant,
  presentCommunicationParticipantList,
} from '../presenters/communication-participant.presenter';

describe('communication participant presenter', () => {
  it('maps enum values to lowercase frontend values', () => {
    const result = presentCommunicationParticipant(
      participantRecord({
        role: CommunicationParticipantRole.READ_ONLY,
        status: CommunicationParticipantStatus.MUTED,
      }),
    );

    expect(result.role).toBe('read_only');
    expect(result.status).toBe('muted');
    expect(result.user?.userType).toBe('school_user');
  });

  it('never exposes schoolId or message body fields', () => {
    const result = presentCommunicationParticipant(
      participantRecord({
        metadata: {
          schoolId: 'school-1',
          body: 'private body',
          message: 'private message',
          nested: {
            text: 'private nested message',
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

  it('presents lists with compact user display metadata', () => {
    const result = presentCommunicationParticipantList([
      participantRecord(),
    ]);

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      id: 'participant-1',
      user: {
        id: 'user-1',
        displayName: 'Communication User',
      },
    });
  });
});

function participantRecord(
  overrides?: Partial<CommunicationParticipantRecord>,
): CommunicationParticipantRecord {
  return {
    id: 'participant-1',
    schoolId: 'school-1',
    conversationId: 'conversation-1',
    userId: 'user-1',
    role: CommunicationParticipantRole.MEMBER,
    status: CommunicationParticipantStatus.ACTIVE,
    joinedAt: new Date('2026-05-02T08:00:00.000Z'),
    invitedById: 'actor-1',
    leftAt: null,
    removedById: null,
    removedAt: null,
    mutedUntil: null,
    metadata: null,
    createdAt: new Date('2026-05-02T08:00:00.000Z'),
    updatedAt: new Date('2026-05-02T08:30:00.000Z'),
    user: {
      id: 'user-1',
      firstName: 'Communication',
      lastName: 'User',
      userType: UserType.SCHOOL_USER,
    },
    ...(overrides ?? {}),
  };
}
