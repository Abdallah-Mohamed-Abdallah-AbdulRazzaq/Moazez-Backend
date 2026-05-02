import { CommunicationMessageReactionRecord } from '../infrastructure/communication-reaction.repository';
import {
  presentCommunicationReaction,
  presentCommunicationReactionList,
  summarizeCommunicationReactionForAudit,
} from '../presenters/communication-reaction.presenter';

describe('communication reaction presenter', () => {
  it('maps stored keys to lowercase and never exposes schoolId or message body', () => {
    const presented = presentCommunicationReaction(
      reactionRecord({
        reactionKey: 'LIKE',
      }),
    );
    const json = JSON.stringify(presented);

    expect(presented.type).toBe('like');
    expect(presented.reactionKey).toBe('like');
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('secret body');
    expect(json).not.toContain('school-1');
  });

  it('supports list shape and audit summaries without unsafe fields', () => {
    const list = presentCommunicationReactionList({
      messageId: 'message-1',
      items: [reactionRecord()],
    });
    const audit = summarizeCommunicationReactionForAudit(reactionRecord());
    const json = JSON.stringify({ list, audit });

    expect(list.items).toHaveLength(1);
    expect(audit).toMatchObject({
      id: 'reaction-1',
      messageId: 'message-1',
      type: 'love',
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('secret body');
  });
});

function reactionRecord(
  overrides?: Partial<CommunicationMessageReactionRecord>,
): CommunicationMessageReactionRecord {
  return {
    id: 'reaction-1',
    schoolId: 'school-1',
    conversationId: 'conversation-1',
    messageId: 'message-1',
    userId: 'actor-1',
    reactionKey: 'love',
    emoji: null,
    createdAt: new Date('2026-05-02T08:00:00.000Z'),
    updatedAt: new Date('2026-05-02T08:00:00.000Z'),
    ...(overrides ?? {}),
  };
}
