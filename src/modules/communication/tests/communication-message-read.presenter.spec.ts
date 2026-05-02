import {
  CommunicationConversationReadResult,
  CommunicationMessageReadRecord,
  CommunicationReadSummaryResult,
} from '../infrastructure/communication-message.repository';
import {
  presentCommunicationConversationReadResult,
  presentCommunicationMessageReadReceipt,
  presentCommunicationReadSummary,
} from '../presenters/communication-message-read.presenter';

describe('communication message read presenter', () => {
  it('presents compact message read receipts without schoolId', () => {
    const presented = presentCommunicationMessageReadReceipt(readRecord());
    const json = JSON.stringify(presented);

    expect(presented).toMatchObject({
      id: 'read-1',
      conversationId: 'conversation-1',
      messageId: 'message-1',
      userId: 'actor-1',
      readAt: '2026-05-02T09:00:00.000Z',
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('school-1');
  });

  it('presents conversation read and summary responses compactly', () => {
    expect(
      presentCommunicationConversationReadResult({
        conversationId: 'conversation-1',
        readAt: new Date('2026-05-02T09:00:00.000Z'),
        markedCount: 2,
      }),
    ).toEqual({
      conversationId: 'conversation-1',
      readAt: '2026-05-02T09:00:00.000Z',
      markedCount: 2,
    });

    expect(
      presentCommunicationReadSummary({
        conversationId: 'conversation-1',
        items: [{ messageId: 'message-1', readCount: 3 }],
        total: 1,
        limit: 50,
        page: 1,
      }),
    ).toEqual({
      conversationId: 'conversation-1',
      items: [{ messageId: 'message-1', readCount: 3 }],
      total: 1,
      limit: 50,
      page: 1,
    });
  });
});

function readRecord(): CommunicationMessageReadRecord {
  return {
    id: 'read-1',
    schoolId: 'school-1',
    conversationId: 'conversation-1',
    messageId: 'message-1',
    userId: 'actor-1',
    readAt: new Date('2026-05-02T09:00:00.000Z'),
    metadata: null,
    createdAt: new Date('2026-05-02T09:00:00.000Z'),
    updatedAt: new Date('2026-05-02T09:00:00.000Z'),
  };
}
