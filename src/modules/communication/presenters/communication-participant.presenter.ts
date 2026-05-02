import { CommunicationParticipantRecord } from '../infrastructure/communication-participant.repository';

export interface CommunicationParticipantResponse {
  id: string;
  conversationId: string;
  userId: string;
  role: string;
  status: string;
  mutedUntil: string | null;
  joinedAt: string;
  leftAt: string | null;
  removedAt: string | null;
  invitedById: string | null;
  removedById: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown> | null;
  user: {
    id: string;
    displayName: string;
    userType: string;
  } | null;
}

export function presentCommunicationParticipantList(
  participants: CommunicationParticipantRecord[],
) {
  return {
    items: participants.map((participant) =>
      presentCommunicationParticipant(participant),
    ),
    total: participants.length,
  };
}

export function presentCommunicationParticipant(
  participant: CommunicationParticipantRecord,
): CommunicationParticipantResponse {
  return {
    id: participant.id,
    conversationId: participant.conversationId,
    userId: participant.userId,
    role: presentEnum(participant.role),
    status: presentEnum(participant.status),
    mutedUntil: presentNullableDate(participant.mutedUntil),
    joinedAt: participant.joinedAt.toISOString(),
    leftAt: presentNullableDate(participant.leftAt),
    removedAt: presentNullableDate(participant.removedAt),
    invitedById: participant.invitedById,
    removedById: participant.removedById,
    createdAt: participant.createdAt.toISOString(),
    updatedAt: participant.updatedAt.toISOString(),
    metadata: sanitizeCommunicationMetadata(participant.metadata),
    user: participant.user
      ? {
          id: participant.user.id,
          displayName: buildDisplayName(
            participant.user.firstName,
            participant.user.lastName,
          ),
          userType: presentEnum(participant.user.userType),
        }
      : null,
  };
}

export function summarizeCommunicationParticipantForAudit(
  participant: CommunicationParticipantRecord,
): Record<string, unknown> {
  return {
    id: participant.id,
    conversationId: participant.conversationId,
    userId: participant.userId,
    role: presentEnum(participant.role),
    status: presentEnum(participant.status),
    mutedUntil: presentNullableDate(participant.mutedUntil),
    joinedAt: participant.joinedAt.toISOString(),
    leftAt: presentNullableDate(participant.leftAt),
    removedAt: presentNullableDate(participant.removedAt),
    invitedById: participant.invitedById,
    removedById: participant.removedById,
  };
}

export function sanitizeCommunicationMetadata(
  value: unknown,
): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const blockedKeys = new Set([
    'schoolid',
    'body',
    'message',
    'messages',
    'messagebody',
    'lastmessage',
    'lastmessagebody',
    'text',
    'audiourl',
  ]);

  const output: Record<string, unknown> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (blockedKeys.has(key.toLowerCase())) continue;
    output[key] = sanitizeMetadataValue(rawValue, blockedKeys);
  }

  return Object.keys(output).length > 0 ? output : null;
}

function sanitizeMetadataValue(
  value: unknown,
  blockedKeys: Set<string>,
): unknown {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMetadataValue(item, blockedKeys));
  }

  const output: Record<string, unknown> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (blockedKeys.has(key.toLowerCase())) continue;
    output[key] = sanitizeMetadataValue(rawValue, blockedKeys);
  }

  return output;
}

function buildDisplayName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

function presentEnum(value: string): string {
  return value.toLowerCase();
}

function presentNullableDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
