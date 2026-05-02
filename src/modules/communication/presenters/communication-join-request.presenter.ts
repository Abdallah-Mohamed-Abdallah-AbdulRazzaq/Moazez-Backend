import { CommunicationJoinRequestRecord } from '../infrastructure/communication-participant.repository';
import { sanitizeCommunicationMetadata } from './communication-participant.presenter';

export interface CommunicationJoinRequestResponse {
  id: string;
  conversationId: string;
  requestedById: string;
  reviewedById: string | null;
  status: string;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown> | null;
  requestedBy: {
    id: string;
    displayName: string;
    userType: string;
  } | null;
}

export function presentCommunicationJoinRequestList(
  requests: CommunicationJoinRequestRecord[],
) {
  return {
    items: requests.map((request) =>
      presentCommunicationJoinRequest(request),
    ),
    total: requests.length,
  };
}

export function presentCommunicationJoinRequest(
  request: CommunicationJoinRequestRecord,
): CommunicationJoinRequestResponse {
  return {
    id: request.id,
    conversationId: request.conversationId,
    requestedById: request.requestedById,
    reviewedById: request.reviewedById,
    status: presentEnum(request.status),
    reviewedAt: presentNullableDate(request.reviewedAt),
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    metadata: sanitizeCommunicationMetadata(request.metadata),
    requestedBy: request.requestedBy
      ? {
          id: request.requestedBy.id,
          displayName: buildDisplayName(
            request.requestedBy.firstName,
            request.requestedBy.lastName,
          ),
          userType: presentEnum(request.requestedBy.userType),
        }
      : null,
  };
}

export function summarizeCommunicationJoinRequestForAudit(
  request: CommunicationJoinRequestRecord,
): Record<string, unknown> {
  return {
    id: request.id,
    conversationId: request.conversationId,
    requestedById: request.requestedById,
    reviewedById: request.reviewedById,
    status: presentEnum(request.status),
    reviewedAt: presentNullableDate(request.reviewedAt),
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
