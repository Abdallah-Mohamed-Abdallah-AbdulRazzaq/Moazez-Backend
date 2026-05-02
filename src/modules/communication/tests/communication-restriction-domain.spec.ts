import {
  assertCanCreateRestriction,
  assertCanRevokeRestriction,
  assertCanUpdateRestriction,
  CommunicationUserRestrictionConflictException,
  deriveCommunicationRestrictionStatus,
  normalizeCommunicationRestrictionStatus,
  normalizeCommunicationRestrictionType,
} from '../domain/communication-restriction-domain';
import { CommunicationConversationScopeInvalidException } from '../domain/communication-conversation-domain';

describe('communication restriction domain', () => {
  it('normalizes lowercase restriction type and status values', () => {
    expect(normalizeCommunicationRestrictionType('mute')).toBe('MUTE');
    expect(normalizeCommunicationRestrictionType('read_only')).toBe(
      'SEND_DISABLED',
    );
    expect(normalizeCommunicationRestrictionStatus('revoked')).toBe('LIFTED');
    expect(normalizeCommunicationRestrictionStatus('expired')).toBe('EXPIRED');
  });

  it('rejects active conflicts and invalid expiry dates', () => {
    expect(() =>
      assertCanCreateRestriction({
        targetUserId: 'target-1',
        restrictionType: 'MUTE',
        hasActiveConflict: true,
      }),
    ).toThrow(CommunicationUserRestrictionConflictException);

    expect(() =>
      assertCanCreateRestriction({
        targetUserId: 'target-1',
        restrictionType: 'MUTE',
        hasActiveConflict: false,
        startsAt: new Date('2026-05-03T00:00:00.000Z'),
        expiresAt: new Date('2026-05-02T00:00:00.000Z'),
        now: new Date('2026-05-01T00:00:00.000Z'),
      }),
    ).toThrow(CommunicationConversationScopeInvalidException);
  });

  it('prevents updates and revokes on already lifted restrictions', () => {
    const restriction = restrictionPlain({
      liftedAt: new Date('2026-05-02T00:00:00.000Z'),
    });

    expect(() =>
      assertCanUpdateRestriction({ restriction }),
    ).toThrow(CommunicationUserRestrictionConflictException);
    expect(() =>
      assertCanRevokeRestriction({ restriction }),
    ).toThrow(CommunicationUserRestrictionConflictException);
    expect(deriveCommunicationRestrictionStatus(restriction)).toBe('LIFTED');
  });
});

function restrictionPlain(overrides?: Record<string, unknown>) {
  return {
    id: 'restriction-1',
    targetUserId: 'target-1',
    restrictionType: 'MUTE',
    startsAt: new Date('2026-05-01T00:00:00.000Z'),
    expiresAt: null,
    liftedAt: null,
    ...(overrides ?? {}),
  } as any;
}
