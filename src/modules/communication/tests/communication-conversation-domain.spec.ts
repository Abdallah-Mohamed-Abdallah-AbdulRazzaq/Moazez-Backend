import {
  assertConversationCanBeArchived,
  assertConversationCanBeClosed,
  assertConversationCanBeReopened,
  assertConversationCreateAllowedByPolicy,
  assertConversationCreatePayload,
  assertConversationMetadataPatch,
  CommunicationConversationArchivedException,
  CommunicationConversationClosedException,
  CommunicationConversationInvalidTypeException,
  CommunicationConversationScopeInvalidException,
  CommunicationPolicyDisabledException,
  mergeConversationMetadata,
  normalizeCommunicationConversationStatus,
  normalizeCommunicationConversationType,
  summarizeConversationCounts,
  summarizeParticipantCounts,
} from '../domain/communication-conversation-domain';
import { buildDefaultCommunicationPolicy } from '../domain/communication-policy-domain';

describe('communication conversation domain', () => {
  it('normalizes lowercase conversation types to Prisma enum values', () => {
    expect(normalizeCommunicationConversationType('direct')).toBe('DIRECT');
    expect(normalizeCommunicationConversationType('school_wide')).toBe(
      'SCHOOL_WIDE',
    );
    expect(normalizeCommunicationConversationType('GROUP')).toBe('GROUP');
  });

  it('rejects unsupported conversation types', () => {
    expect(() => normalizeCommunicationConversationType('announcement')).toThrow(
      CommunicationConversationInvalidTypeException,
    );
  });

  it('normalizes lowercase status filters to Prisma enum values', () => {
    expect(normalizeCommunicationConversationStatus('active')).toBe('ACTIVE');
    expect(normalizeCommunicationConversationStatus('archived')).toBe(
      'ARCHIVED',
    );
    expect(normalizeCommunicationConversationStatus('CLOSED')).toBe('CLOSED');
  });

  it('rejects conversation creation when policy is disabled', () => {
    expect(() =>
      assertConversationCreateAllowedByPolicy({
        ...buildDefaultCommunicationPolicy(),
        isEnabled: false,
      }),
    ).toThrow(CommunicationPolicyDisabledException);
  });

  it('allows conversation creation when policy is enabled or defaulted', () => {
    expect(() =>
      assertConversationCreateAllowedByPolicy(buildDefaultCommunicationPolicy()),
    ).not.toThrow();
  });

  it('requires type-specific context fields conservatively', () => {
    expect(() =>
      assertConversationCreatePayload({ type: 'CLASSROOM' }),
    ).toThrow(CommunicationConversationScopeInvalidException);
    expect(() =>
      assertConversationCreatePayload({
        type: 'CLASSROOM',
        classroomId: 'classroom-1',
      }),
    ).not.toThrow();
    expect(() => assertConversationCreatePayload({ type: 'GRADE' })).toThrow(
      CommunicationConversationScopeInvalidException,
    );
    expect(() =>
      assertConversationCreatePayload({ type: 'SECTION' }),
    ).toThrow(CommunicationConversationScopeInvalidException);
    expect(() => assertConversationCreatePayload({ type: 'STAGE' })).toThrow(
      CommunicationConversationScopeInvalidException,
    );
  });

  it('blocks metadata updates on archived or closed conversations', () => {
    expect(() =>
      assertConversationMetadataPatch({
        status: 'ARCHIVED',
        patch: { title: 'Archived' },
      }),
    ).toThrow(CommunicationConversationArchivedException);
    expect(() =>
      assertConversationMetadataPatch({
        status: 'CLOSED',
        patch: { title: 'Closed' },
      }),
    ).toThrow(CommunicationConversationClosedException);
  });

  it('keeps archive close and reopen transitions explicit', () => {
    expect(() => assertConversationCanBeArchived('ACTIVE')).not.toThrow();
    expect(() => assertConversationCanBeClosed('ACTIVE')).not.toThrow();
    expect(() => assertConversationCanBeArchived('ARCHIVED')).toThrow(
      CommunicationConversationArchivedException,
    );
    expect(() => assertConversationCanBeClosed('CLOSED')).toThrow(
      CommunicationConversationClosedException,
    );
    expect(() => assertConversationCanBeReopened('ACTIVE')).toThrow(
      CommunicationConversationScopeInvalidException,
    );
    expect(() => assertConversationCanBeReopened('ARCHIVED')).not.toThrow();
  });

  it('summarizes zero conversation and participant counts safely', () => {
    expect(
      summarizeConversationCounts({
        total: 0,
        statuses: [],
        types: [],
      }),
    ).toMatchObject({
      total: 0,
      active: 0,
      schoolWide: 0,
      support: 0,
    });

    expect(
      summarizeParticipantCounts({
        total: 0,
        statuses: [],
      }),
    ).toMatchObject({
      total: 0,
      active: 0,
      blocked: 0,
    });
  });

  it('merges metadata-backed flags without touching messages or participants', () => {
    expect(
      mergeConversationMetadata(
        { topic: 'math', isPinned: false },
        { isReadOnly: true, isPinned: true },
      ),
    ).toEqual({
      topic: 'math',
      isPinned: true,
      isReadOnly: true,
    });
  });
});
