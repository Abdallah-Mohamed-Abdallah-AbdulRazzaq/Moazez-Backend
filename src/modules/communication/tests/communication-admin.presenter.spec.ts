import { CommunicationConversationType, CommunicationConversationStatus, CommunicationMessageKind, CommunicationMessageStatus } from '@prisma/client';
import { buildDefaultCommunicationPolicy } from '../domain/communication-policy-domain';
import {
  buildEmptyCommunicationOverviewCounts,
  presentCommunicationAdminOverview,
} from '../presenters/communication-admin.presenter';

describe('communication admin presenter', () => {
  it('summarizes zero state safely', () => {
    const result = presentCommunicationAdminOverview({
      policy: buildDefaultCommunicationPolicy(),
      isConfigured: false,
      dataset: {
        counts: buildEmptyCommunicationOverviewCounts(),
        recentActivity: {
          conversations: [],
          messages: [],
        },
      },
    });

    expect(result.policy.isConfigured).toBe(false);
    expect(result.conversations.total).toBe(0);
    expect(result.participants.total).toBe(0);
    expect(result.messages.total).toBe(0);
    expect(result.receipts.deliveries).toBe(0);
    expect(result.safety.activeBlocks).toBe(0);
  });

  it('never exposes schoolId or message body content', () => {
    const now = new Date('2026-05-01T10:00:00.000Z');
    const result = presentCommunicationAdminOverview({
      policy: {
        ...buildDefaultCommunicationPolicy(),
        schoolId: 'school-1',
        studentDirectMode: 'SAME_GRADE',
      },
      isConfigured: true,
      dataset: {
        counts: buildEmptyCommunicationOverviewCounts(),
        recentActivity: {
          conversations: [
            {
              id: 'conversation-1',
              type: CommunicationConversationType.GROUP,
              status: CommunicationConversationStatus.ACTIVE,
              lastMessageAt: now,
              createdAt: now,
              updatedAt: now,
              schoolId: 'school-1',
            } as never,
          ],
          messages: [
            {
              id: 'message-1',
              conversationId: 'conversation-1',
              senderUserId: 'user-1',
              kind: CommunicationMessageKind.TEXT,
              status: CommunicationMessageStatus.SENT,
              sentAt: now,
              createdAt: now,
              updatedAt: now,
              body: 'private body',
              schoolId: 'school-1',
            } as never,
          ],
        },
      },
    });

    const json = JSON.stringify(result);
    expect(result.policy.studentDirectMode).toBe('same_grade');
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('body');
    expect(json).not.toContain('private body');
  });
});
