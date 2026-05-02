import { CommunicationMessageKind, CommunicationMessageStatus, CommunicationReportStatus } from '@prisma/client';
import {
  presentCommunicationMessageReport,
  presentCommunicationMessageReportList,
} from '../presenters/communication-report.presenter';

describe('communication report presenter', () => {
  it('does not expose schoolId or message body in detail or list output', () => {
    const report = reportRecord();
    const detail = presentCommunicationMessageReport(report);
    const list = presentCommunicationMessageReportList({
      items: [report],
      total: 1,
      limit: 50,
      page: 1,
    });
    const json = JSON.stringify({ detail, list });

    expect(detail).toMatchObject({
      id: 'report-1',
      reason: 'spam',
      status: 'open',
      reportedUserId: 'sender-1',
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('school-1');
    expect(json).not.toContain('body');
    expect(json).not.toContain('secret message body');
  });
});

function reportRecord() {
  const now = new Date('2026-05-02T08:00:00.000Z');
  return {
    id: 'report-1',
    schoolId: 'school-1',
    conversationId: 'conversation-1',
    messageId: 'message-1',
    reporterUserId: 'reporter-1',
    status: CommunicationReportStatus.OPEN,
    reasonCode: 'spam',
    reasonText: 'Unsafe text',
    reviewedById: null,
    reviewedAt: null,
    resolutionNote: null,
    metadata: { schoolId: 'school-1', body: 'secret message body', safe: true },
    createdAt: now,
    updatedAt: now,
    message: {
      id: 'message-1',
      conversationId: 'conversation-1',
      senderUserId: 'sender-1',
      kind: CommunicationMessageKind.TEXT,
      status: CommunicationMessageStatus.SENT,
      hiddenAt: null,
      deletedAt: null,
      sentAt: now,
    },
  } as any;
}
