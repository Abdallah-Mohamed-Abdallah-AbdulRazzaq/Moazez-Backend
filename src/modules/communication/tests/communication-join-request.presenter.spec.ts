import {
  CommunicationJoinRequestStatus,
  UserType,
} from '@prisma/client';
import { CommunicationJoinRequestRecord } from '../infrastructure/communication-participant.repository';
import {
  presentCommunicationJoinRequest,
  presentCommunicationJoinRequestList,
} from '../presenters/communication-join-request.presenter';

describe('communication join request presenter', () => {
  it('maps enum values to lowercase frontend values', () => {
    const result = presentCommunicationJoinRequest(
      joinRequestRecord({
        status: CommunicationJoinRequestStatus.APPROVED,
      }),
    );

    expect(result.status).toBe('approved');
    expect(result.requestedBy?.userType).toBe('student');
  });

  it('never exposes schoolId or message body fields', () => {
    const result = presentCommunicationJoinRequest(
      joinRequestRecord({
        metadata: {
          schoolId: 'school-1',
          messageBody: 'private body',
          safe: true,
        },
      }),
    );
    const json = JSON.stringify(result);

    expect(result).not.toHaveProperty('schoolId');
    expect(result.metadata).toEqual({ safe: true });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('private body');
  });

  it('presents list zero state safely', () => {
    const result = presentCommunicationJoinRequestList([]);

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});

function joinRequestRecord(
  overrides?: Partial<CommunicationJoinRequestRecord>,
): CommunicationJoinRequestRecord {
  return {
    id: 'join-request-1',
    schoolId: 'school-1',
    conversationId: 'conversation-1',
    requestedById: 'student-1',
    reviewedById: null,
    status: CommunicationJoinRequestStatus.PENDING,
    reviewedAt: null,
    metadata: null,
    createdAt: new Date('2026-05-02T08:00:00.000Z'),
    updatedAt: new Date('2026-05-02T08:30:00.000Z'),
    requestedBy: {
      id: 'student-1',
      firstName: 'Student',
      lastName: 'User',
      userType: UserType.STUDENT,
    },
    ...(overrides ?? {}),
  };
}
