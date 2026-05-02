import {
  CommunicationMessageKind,
  CommunicationMessageStatus,
} from '@prisma/client';
import { CommunicationMessageRecord } from '../infrastructure/communication-message.repository';
import {
  presentCommunicationMessage,
  presentCommunicationMessageList,
  summarizeCommunicationMessageForAudit,
} from '../presenters/communication-message.presenter';

describe('communication message presenter', () => {
  it('maps enum values to lowercase and never exposes schoolId', () => {
    const presented = presentCommunicationMessage(
      messageRecord({
        kind: CommunicationMessageKind.TEXT,
        status: CommunicationMessageStatus.SENT,
      }),
    );
    const json = JSON.stringify(presented);

    expect(presented.type).toBe('text');
    expect(presented.status).toBe('sent');
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('school-1');
  });

  it('hides deleted and hidden body content', () => {
    expect(
      presentCommunicationMessage(
        messageRecord({
          status: CommunicationMessageStatus.DELETED,
          body: 'deleted secret',
          deletedAt: new Date('2026-05-02T09:00:00.000Z'),
        }),
      ).body,
    ).toBeNull();
    expect(
      presentCommunicationMessage(
        messageRecord({
          status: CommunicationMessageStatus.HIDDEN,
          body: 'hidden secret',
          hiddenAt: new Date('2026-05-02T09:00:00.000Z'),
        }),
      ).content,
    ).toBeNull();
  });

  it('sanitizes sensitive metadata and supports list shape', () => {
    const record = messageRecord({
      metadata: {
        topic: 'math',
        schoolId: 'school-1',
        body: 'must not leak',
        nested: {
          text: 'must not leak nested',
          visible: true,
        },
      },
    });

    const list = presentCommunicationMessageList({
      conversationId: 'conversation-1',
      items: [record],
      total: 1,
      limit: 50,
      page: 1,
    });
    const json = JSON.stringify(list);

    expect(list.items[0].metadata).toEqual({
      topic: 'math',
      nested: { visible: true },
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('must not leak');
  });

  it('summarizes audits without storing full message body', () => {
    const summary = summarizeCommunicationMessageForAudit(
      messageRecord({ body: 'Sensitive chat body' }),
    );

    expect(summary).toMatchObject({
      id: 'message-1',
      bodyLength: 19,
      hasBody: true,
    });
    expect(JSON.stringify(summary)).not.toContain('Sensitive chat body');
  });
});

function messageRecord(
  overrides?: Partial<CommunicationMessageRecord>,
): CommunicationMessageRecord {
  return {
    id: 'message-1',
    schoolId: 'school-1',
    conversationId: 'conversation-1',
    senderUserId: 'actor-1',
    kind: CommunicationMessageKind.TEXT,
    status: CommunicationMessageStatus.SENT,
    body: 'Hello',
    clientMessageId: 'client-1',
    replyToMessageId: null,
    editedAt: null,
    hiddenById: null,
    hiddenAt: null,
    hiddenReason: null,
    deletedById: null,
    deletedAt: null,
    sentAt: new Date('2026-05-02T08:00:00.000Z'),
    metadata: null,
    createdAt: new Date('2026-05-02T08:00:00.000Z'),
    updatedAt: new Date('2026-05-02T08:30:00.000Z'),
    _count: { reads: 0 },
    ...(overrides ?? {}),
  };
}
