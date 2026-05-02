import {
  CommunicationInviteStatus,
  UserType,
} from '@prisma/client';
import { CommunicationInviteRecord } from '../infrastructure/communication-participant.repository';
import {
  presentCommunicationInvite,
  presentCommunicationInviteList,
} from '../presenters/communication-invite.presenter';

describe('communication invite presenter', () => {
  it('maps enum values to lowercase frontend values', () => {
    const result = presentCommunicationInvite(
      inviteRecord({ status: CommunicationInviteStatus.ACCEPTED }),
    );

    expect(result.status).toBe('accepted');
    expect(result.invitedUser?.userType).toBe('teacher');
  });

  it('never exposes schoolId or message body fields', () => {
    const result = presentCommunicationInvite(
      inviteRecord({
        metadata: {
          schoolId: 'school-1',
          message: 'private invite message',
          body: 'private body',
          safe: true,
        },
      }),
    );
    const json = JSON.stringify(result);

    expect(result).not.toHaveProperty('schoolId');
    expect(result.metadata).toEqual({ safe: true });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('private invite message');
    expect(json).not.toContain('private body');
  });

  it('presents list zero state safely', () => {
    const result = presentCommunicationInviteList([]);

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});

function inviteRecord(
  overrides?: Partial<CommunicationInviteRecord>,
): CommunicationInviteRecord {
  return {
    id: 'invite-1',
    schoolId: 'school-1',
    conversationId: 'conversation-1',
    invitedUserId: 'teacher-1',
    invitedById: 'actor-1',
    status: CommunicationInviteStatus.PENDING,
    expiresAt: null,
    respondedAt: null,
    metadata: null,
    createdAt: new Date('2026-05-02T08:00:00.000Z'),
    updatedAt: new Date('2026-05-02T08:30:00.000Z'),
    invitedUser: {
      id: 'teacher-1',
      firstName: 'Teacher',
      lastName: 'User',
      userType: UserType.TEACHER,
    },
    ...(overrides ?? {}),
  };
}
