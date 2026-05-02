import {
  CommunicationConversationArchivedException,
  CommunicationConversationClosedException,
  CommunicationPolicyDisabledException,
} from '../domain/communication-conversation-domain';
import {
  assertCanAddParticipant,
  assertCanCreateInvite,
  assertCanCreateJoinRequest,
  assertCanDemoteParticipant,
  assertCanLeaveConversation,
  assertCanPromoteParticipant,
  assertCanRemoveParticipant,
  assertConversationAllowsParticipantMutation,
  CommunicationInviteDuplicatePendingException,
  CommunicationJoinRequestDuplicatePendingException,
  CommunicationParticipantAlreadyExistsException,
  CommunicationParticipantCannotRemoveOwnerException,
  normalizeCommunicationInviteStatus,
  normalizeCommunicationJoinRequestStatus,
  normalizeCommunicationParticipantRole,
  normalizeCommunicationParticipantStatus,
  PlainCommunicationParticipant,
} from '../domain/communication-participant-domain';
import { buildDefaultCommunicationPolicy } from '../domain/communication-policy-domain';

describe('communication participant domain', () => {
  it('normalizes lowercase participant roles to Prisma enum values', () => {
    expect(normalizeCommunicationParticipantRole('owner')).toBe('OWNER');
    expect(normalizeCommunicationParticipantRole('read_only')).toBe(
      'READ_ONLY',
    );
    expect(normalizeCommunicationParticipantRole('MEMBER')).toBe('MEMBER');
  });

  it('normalizes lowercase participant statuses to Prisma enum values', () => {
    expect(normalizeCommunicationParticipantStatus('active')).toBe('ACTIVE');
    expect(normalizeCommunicationParticipantStatus('muted')).toBe('MUTED');
    expect(normalizeCommunicationParticipantStatus('REMOVED')).toBe('REMOVED');
  });

  it('normalizes invite and join request statuses', () => {
    expect(normalizeCommunicationInviteStatus('pending')).toBe('PENDING');
    expect(normalizeCommunicationInviteStatus('accepted')).toBe('ACCEPTED');
    expect(normalizeCommunicationJoinRequestStatus('approved')).toBe(
      'APPROVED',
    );
  });

  it('rejects participant mutations when policy is disabled', () => {
    expect(() =>
      assertCanAddParticipant({
        policy: { ...buildDefaultCommunicationPolicy(), isEnabled: false },
        conversationStatus: 'ACTIVE',
        role: 'MEMBER',
        status: 'ACTIVE',
      }),
    ).toThrow(CommunicationPolicyDisabledException);
  });

  it('rejects participant mutations on archived or closed conversations', () => {
    expect(() =>
      assertConversationAllowsParticipantMutation('ARCHIVED'),
    ).toThrow(CommunicationConversationArchivedException);
    expect(() =>
      assertConversationAllowsParticipantMutation('CLOSED'),
    ).toThrow(CommunicationConversationClosedException);
  });

  it('rejects duplicate active participants but allows removed or left reactivation', () => {
    expect(() =>
      assertCanAddParticipant({
        policy: buildDefaultCommunicationPolicy(),
        conversationStatus: 'ACTIVE',
        existingParticipant: participant({ status: 'ACTIVE' }),
        role: 'MEMBER',
        status: 'ACTIVE',
      }),
    ).toThrow(CommunicationParticipantAlreadyExistsException);

    expect(() =>
      assertCanAddParticipant({
        policy: buildDefaultCommunicationPolicy(),
        conversationStatus: 'ACTIVE',
        existingParticipant: participant({ status: 'LEFT' }),
        role: 'MEMBER',
        status: 'ACTIVE',
      }),
    ).not.toThrow();
  });

  it('cannot remove leave or demote the last OWNER', () => {
    const owner = participant({ role: 'OWNER', status: 'ACTIVE' });

    expect(() =>
      assertCanRemoveParticipant({
        policy: buildDefaultCommunicationPolicy(),
        conversationStatus: 'ACTIVE',
        participant: owner,
        activeOwnerCount: 1,
      }),
    ).toThrow(CommunicationParticipantCannotRemoveOwnerException);

    expect(() =>
      assertCanLeaveConversation({
        policy: buildDefaultCommunicationPolicy(),
        conversationStatus: 'ACTIVE',
        participant: owner,
        activeOwnerCount: 1,
      }),
    ).toThrow(CommunicationParticipantCannotRemoveOwnerException);

    expect(() =>
      assertCanDemoteParticipant({
        policy: buildDefaultCommunicationPolicy(),
        conversationStatus: 'ACTIVE',
        participant: owner,
        activeOwnerCount: 1,
      }),
    ).toThrow(CommunicationParticipantCannotRemoveOwnerException);
  });

  it('promotes and demotes along the conservative hierarchy', () => {
    expect(
      assertCanPromoteParticipant({
        policy: buildDefaultCommunicationPolicy(),
        conversationStatus: 'ACTIVE',
        participant: participant({ role: 'MEMBER' }),
      }),
    ).toBe('MODERATOR');

    expect(
      assertCanDemoteParticipant({
        policy: buildDefaultCommunicationPolicy(),
        conversationStatus: 'ACTIVE',
        participant: participant({ role: 'ADMIN' }),
        activeOwnerCount: 1,
      }),
    ).toBe('MODERATOR');
  });

  it('rejects duplicate pending invites and join requests', () => {
    expect(() =>
      assertCanCreateInvite({
        policy: buildDefaultCommunicationPolicy(),
        conversationStatus: 'ACTIVE',
        hasPendingInvite: true,
      }),
    ).toThrow(CommunicationInviteDuplicatePendingException);

    expect(() =>
      assertCanCreateJoinRequest({
        policy: buildDefaultCommunicationPolicy(),
        conversationStatus: 'ACTIVE',
        hasPendingJoinRequest: true,
      }),
    ).toThrow(CommunicationJoinRequestDuplicatePendingException);
  });
});

function participant(
  overrides?: Partial<PlainCommunicationParticipant>,
): PlainCommunicationParticipant {
  return {
    id: 'participant-1',
    conversationId: 'conversation-1',
    userId: 'user-1',
    role: 'MEMBER',
    status: 'ACTIVE',
    ...(overrides ?? {}),
  };
}
