import {
  presentCommunicationUserBlock,
  presentCommunicationUserBlockList,
} from '../presenters/communication-block.presenter';

describe('communication block presenter', () => {
  it('presents compact actor-owned blocks without schoolId', () => {
    const block = blockRecord();
    const detail = presentCommunicationUserBlock(block);
    const list = presentCommunicationUserBlockList([block]);
    const json = JSON.stringify({ detail, list });

    expect(detail).toMatchObject({
      id: 'block-1',
      blockerUserId: 'actor-1',
      blockedUserId: 'target-1',
      targetUserId: 'target-1',
      status: 'active',
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('school-1');
  });
});

function blockRecord() {
  const now = new Date('2026-05-02T08:00:00.000Z');
  return {
    id: 'block-1',
    schoolId: 'school-1',
    blockerUserId: 'actor-1',
    blockedUserId: 'target-1',
    reason: 'Boundary',
    unblockedAt: null,
    metadata: { schoolId: 'school-1', safe: true },
    createdAt: now,
    updatedAt: now,
  } as any;
}
