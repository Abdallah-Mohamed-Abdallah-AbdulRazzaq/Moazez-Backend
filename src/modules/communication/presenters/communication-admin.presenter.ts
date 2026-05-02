import {
  PlainCommunicationPolicy,
  CommunicationOverviewCounts,
} from '../domain/communication-policy-domain';
import { CommunicationAdminOverviewDataset } from '../infrastructure/communication-policy.repository';

export function presentCommunicationAdminOverview(params: {
  policy: PlainCommunicationPolicy;
  isConfigured: boolean;
  dataset: CommunicationAdminOverviewDataset;
}) {
  return {
    policy: {
      isConfigured: params.isConfigured,
      isEnabled: params.policy.isEnabled,
      studentDirectMode: presentEnum(params.policy.studentDirectMode),
      allowTeacherCreatedGroups: params.policy.allowTeacherCreatedGroups,
      allowStudentCreatedGroups: params.policy.allowStudentCreatedGroups,
      allowAttachments: params.policy.allowAttachments,
      allowReactions: params.policy.allowReactions,
      allowReadReceipts: params.policy.allowReadReceipts,
      allowDeliveryReceipts: params.policy.allowDeliveryReceipts,
      allowOnlinePresence: params.policy.allowOnlinePresence,
    },
    conversations: params.dataset.counts.conversations,
    participants: params.dataset.counts.participants,
    messages: params.dataset.counts.messages,
    receipts: params.dataset.counts.receipts,
    safety: params.dataset.counts.safety,
    recentActivity: {
      conversations: params.dataset.recentActivity.conversations.map(
        (conversation) => ({
          id: conversation.id,
          type: presentEnum(conversation.type),
          status: presentEnum(conversation.status),
          lastMessageAt: presentDate(conversation.lastMessageAt),
          createdAt: conversation.createdAt.toISOString(),
          updatedAt: conversation.updatedAt.toISOString(),
        }),
      ),
      messages: params.dataset.recentActivity.messages.map((message) => ({
        id: message.id,
        conversationId: message.conversationId,
        senderUserId: message.senderUserId,
        kind: presentEnum(message.kind),
        status: presentEnum(message.status),
        sentAt: message.sentAt.toISOString(),
        createdAt: message.createdAt.toISOString(),
        updatedAt: message.updatedAt.toISOString(),
      })),
    },
  };
}

export function buildEmptyCommunicationOverviewCounts(): CommunicationOverviewCounts {
  return {
    conversations: {
      total: 0,
      active: 0,
      archived: 0,
      closed: 0,
      direct: 0,
      group: 0,
      classroom: 0,
      grade: 0,
      section: 0,
      stage: 0,
      schoolWide: 0,
      support: 0,
      system: 0,
    },
    participants: {
      total: 0,
      active: 0,
      invited: 0,
      left: 0,
      removed: 0,
      muted: 0,
      blocked: 0,
    },
    messages: {
      total: 0,
      sent: 0,
      hidden: 0,
      deleted: 0,
      text: 0,
      image: 0,
      file: 0,
      audio: 0,
      video: 0,
      system: 0,
    },
    receipts: {
      reads: 0,
      deliveries: 0,
      pendingDeliveries: 0,
      deliveredDeliveries: 0,
      failedDeliveries: 0,
    },
    safety: {
      openReports: 0,
      inReviewReports: 0,
      resolvedReports: 0,
      dismissedReports: 0,
      activeBlocks: 0,
      activeRestrictions: 0,
      moderationActions: 0,
    },
  };
}

function presentEnum(value: string): string {
  return value.toLowerCase();
}

function presentDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
