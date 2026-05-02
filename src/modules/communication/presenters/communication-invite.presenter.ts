import { CommunicationInviteRecord } from '../infrastructure/communication-participant.repository';
import { sanitizeCommunicationMetadata } from './communication-participant.presenter';

export interface CommunicationInviteResponse {
  id: string;
  conversationId: string;
  invitedUserId: string;
  invitedById: string | null;
  status: string;
  expiresAt: string | null;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown> | null;
  invitedUser: {
    id: string;
    displayName: string;
    userType: string;
  } | null;
}

export function presentCommunicationInviteList(
  invites: CommunicationInviteRecord[],
) {
  return {
    items: invites.map((invite) => presentCommunicationInvite(invite)),
    total: invites.length,
  };
}

export function presentCommunicationInvite(
  invite: CommunicationInviteRecord,
): CommunicationInviteResponse {
  return {
    id: invite.id,
    conversationId: invite.conversationId,
    invitedUserId: invite.invitedUserId,
    invitedById: invite.invitedById,
    status: presentEnum(invite.status),
    expiresAt: presentNullableDate(invite.expiresAt),
    respondedAt: presentNullableDate(invite.respondedAt),
    createdAt: invite.createdAt.toISOString(),
    updatedAt: invite.updatedAt.toISOString(),
    metadata: sanitizeCommunicationMetadata(invite.metadata),
    invitedUser: invite.invitedUser
      ? {
          id: invite.invitedUser.id,
          displayName: buildDisplayName(
            invite.invitedUser.firstName,
            invite.invitedUser.lastName,
          ),
          userType: presentEnum(invite.invitedUser.userType),
        }
      : null,
  };
}

export function summarizeCommunicationInviteForAudit(
  invite: CommunicationInviteRecord,
): Record<string, unknown> {
  return {
    id: invite.id,
    conversationId: invite.conversationId,
    invitedUserId: invite.invitedUserId,
    invitedById: invite.invitedById,
    status: presentEnum(invite.status),
    expiresAt: presentNullableDate(invite.expiresAt),
    respondedAt: presentNullableDate(invite.respondedAt),
  };
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
