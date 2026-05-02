import { CommunicationRestrictionType } from '@prisma/client';
import {
  presentCommunicationUserRestriction,
  presentCommunicationUserRestrictionList,
} from '../presenters/communication-restriction.presenter';

describe('communication restriction presenter', () => {
  it('maps enum values and hides schoolId', () => {
    const restriction = restrictionRecord();
    const detail = presentCommunicationUserRestriction(restriction);
    const list = presentCommunicationUserRestrictionList({
      items: [restriction],
      total: 1,
      limit: 50,
      page: 1,
    });
    const json = JSON.stringify({ detail, list });

    expect(detail).toMatchObject({
      id: 'restriction-1',
      targetUserId: 'target-1',
      type: 'mute',
      restrictionType: 'mute',
      status: 'active',
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('school-1');
  });
});

function restrictionRecord() {
  const now = new Date('2026-05-02T08:00:00.000Z');
  return {
    id: 'restriction-1',
    schoolId: 'school-1',
    targetUserId: 'target-1',
    restrictedById: 'moderator-1',
    restrictionType: CommunicationRestrictionType.MUTE,
    reason: 'Cooldown',
    startsAt: now,
    expiresAt: new Date('2026-05-03T08:00:00.000Z'),
    liftedById: null,
    liftedAt: null,
    metadata: { schoolId: 'school-1', safe: true },
    createdAt: now,
    updatedAt: now,
  } as any;
}
