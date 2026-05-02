import { CommunicationUserRestrictionRecord } from '../infrastructure/communication-restriction.repository';
import {
  deriveCommunicationRestrictionStatus,
} from '../domain/communication-restriction-domain';
import { sanitizeSafetyMetadata } from './communication-report.presenter';

export interface CommunicationUserRestrictionResponse {
  id: string;
  targetUserId: string;
  restrictedById: string | null;
  type: string;
  restrictionType: string;
  status: string;
  reason: string | null;
  startsAt: string;
  expiresAt: string | null;
  liftedById: string | null;
  liftedAt: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown> | null;
}

export function presentCommunicationUserRestrictionList(result: {
  items: CommunicationUserRestrictionRecord[];
  total: number;
  limit: number;
  page: number;
}) {
  return {
    items: result.items.map((restriction) =>
      presentCommunicationUserRestriction(restriction),
    ),
    total: result.total,
    limit: result.limit,
    page: result.page,
  };
}

export function presentCommunicationUserRestriction(
  restriction: CommunicationUserRestrictionRecord,
): CommunicationUserRestrictionResponse {
  const type = presentRestrictionType(restriction.restrictionType);

  return {
    id: restriction.id,
    targetUserId: restriction.targetUserId,
    restrictedById: restriction.restrictedById,
    type,
    restrictionType: type,
    status: deriveCommunicationRestrictionStatus(restriction).toLowerCase(),
    reason: restriction.reason,
    startsAt: restriction.startsAt.toISOString(),
    expiresAt: presentNullableDate(restriction.expiresAt),
    liftedById: restriction.liftedById,
    liftedAt: presentNullableDate(restriction.liftedAt),
    createdAt: restriction.createdAt.toISOString(),
    updatedAt: restriction.updatedAt.toISOString(),
    metadata: sanitizeSafetyMetadata(restriction.metadata),
  };
}

export function summarizeCommunicationUserRestrictionForAudit(
  restriction: CommunicationUserRestrictionRecord,
): Record<string, unknown> {
  return {
    id: restriction.id,
    targetUserId: restriction.targetUserId,
    restrictedById: restriction.restrictedById,
    type: presentRestrictionType(restriction.restrictionType),
    status: deriveCommunicationRestrictionStatus(restriction).toLowerCase(),
    hasReason: Boolean(restriction.reason),
    startsAt: restriction.startsAt.toISOString(),
    expiresAt: presentNullableDate(restriction.expiresAt),
    liftedById: restriction.liftedById,
    liftedAt: presentNullableDate(restriction.liftedAt),
    createdAt: restriction.createdAt.toISOString(),
    updatedAt: restriction.updatedAt.toISOString(),
  };
}

function presentRestrictionType(value: string): string {
  const map: Record<string, string> = {
    MUTE: 'mute',
    SEND_DISABLED: 'send_disabled',
    GROUP_CREATE_DISABLED: 'group_create_disabled',
    DIRECT_MESSAGE_DISABLED: 'direct_message_disabled',
  };

  return map[value] ?? value.toLowerCase();
}

function presentNullableDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
