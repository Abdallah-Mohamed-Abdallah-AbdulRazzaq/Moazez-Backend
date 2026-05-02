import {
  CommunicationModerationActionListResult,
  CommunicationModerationActionRecord,
  CommunicationModerationMessageRecord,
  CommunicationModerationMutationResult,
} from '../infrastructure/communication-moderation.repository';
import { sanitizeSafetyMetadata } from './communication-report.presenter';

export interface CommunicationModerationActionResponse {
  id: string;
  conversationId: string | null;
  messageId: string | null;
  targetUserId: string | null;
  actorUserId: string | null;
  action: string;
  actionType: string;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown> | null;
}

export function presentCommunicationModerationActionList(
  result: CommunicationModerationActionListResult,
) {
  return {
    messageId: result.messageId,
    items: result.items.map((action) =>
      presentCommunicationModerationAction(action),
    ),
  };
}

export function presentCommunicationModerationMutation(
  result: CommunicationModerationMutationResult,
) {
  return {
    action: presentCommunicationModerationAction(result.action),
    message: presentModerationMessageMetadata(result.message),
  };
}

export function presentCommunicationModerationAction(
  action: CommunicationModerationActionRecord,
): CommunicationModerationActionResponse {
  const actionName = presentModerationAction(action.actionType);

  return {
    id: action.id,
    conversationId: action.conversationId,
    messageId: action.messageId,
    targetUserId: action.targetUserId,
    actorUserId: action.actorUserId,
    action: actionName,
    actionType: actionName,
    reason: action.reason,
    createdAt: action.createdAt.toISOString(),
    updatedAt: action.updatedAt.toISOString(),
    metadata: sanitizeSafetyMetadata(action.metadata),
  };
}

export function presentModerationMessageMetadata(
  message: CommunicationModerationMessageRecord,
) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderUserId: message.senderUserId,
    type: message.kind.toLowerCase(),
    status: message.status.toLowerCase(),
    hiddenAt: presentNullableDate(message.hiddenAt),
    hiddenById: message.hiddenById,
    hiddenReason: message.hiddenReason,
    deletedAt: presentNullableDate(message.deletedAt),
    deletedById: message.deletedById,
    sentAt: message.sentAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
  };
}

export function summarizeCommunicationModerationActionForAudit(
  result: CommunicationModerationMutationResult,
): Record<string, unknown> {
  return {
    id: result.action.id,
    conversationId: result.action.conversationId,
    messageId: result.action.messageId,
    targetUserId: result.action.targetUserId,
    actorUserId: result.action.actorUserId,
    action: presentModerationAction(result.action.actionType),
    message: presentModerationMessageMetadata(result.message),
    hasReason: Boolean(result.action.reason),
    createdAt: result.action.createdAt.toISOString(),
  };
}

function presentModerationAction(value: string): string {
  const map: Record<string, string> = {
    MESSAGE_HIDDEN: 'hide',
    MESSAGE_UNHIDDEN: 'unhide',
    MESSAGE_DELETED: 'delete',
    USER_RESTRICTED: 'restrict_sender',
  };

  return map[value] ?? value.toLowerCase();
}

function presentNullableDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
