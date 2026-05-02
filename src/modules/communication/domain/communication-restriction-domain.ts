import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../common/exceptions/domain-exception';
import { CommunicationConversationScopeInvalidException } from './communication-conversation-domain';

export type CommunicationRestrictionTypeValue =
  | 'MUTE'
  | 'SEND_DISABLED'
  | 'GROUP_CREATE_DISABLED'
  | 'DIRECT_MESSAGE_DISABLED';

export type CommunicationRestrictionStatusValue =
  | 'ACTIVE'
  | 'LIFTED'
  | 'EXPIRED';

export interface PlainCommunicationUserRestriction {
  id: string;
  targetUserId: string;
  restrictionType: CommunicationRestrictionTypeValue;
  startsAt: Date;
  expiresAt?: Date | null;
  liftedAt?: Date | null;
}

export const COMMUNICATION_RESTRICTION_TYPES = [
  'mute',
  'read_only',
  'send_disabled',
  'group_create_disabled',
  'direct_message_disabled',
] as const;

export const COMMUNICATION_RESTRICTION_STATUSES = [
  'active',
  'lifted',
  'revoked',
  'expired',
] as const;

const RESTRICTION_TYPE_MAP: Record<string, CommunicationRestrictionTypeValue> =
  {
    mute: 'MUTE',
    read_only: 'SEND_DISABLED',
    send_disabled: 'SEND_DISABLED',
    group_create_disabled: 'GROUP_CREATE_DISABLED',
    direct_message_disabled: 'DIRECT_MESSAGE_DISABLED',
  };

const RESTRICTION_STATUS_MAP: Record<string, CommunicationRestrictionStatusValue> =
  {
    active: 'ACTIVE',
    lifted: 'LIFTED',
    revoked: 'LIFTED',
    expired: 'EXPIRED',
  };

export class CommunicationUserRestrictionConflictException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'communication.user.restriction_conflict',
      message: 'User restriction conflicts with an active state',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export function normalizeCommunicationRestrictionType(
  value: string,
): CommunicationRestrictionTypeValue {
  const normalized = value.trim().toLowerCase();
  const mapped = RESTRICTION_TYPE_MAP[normalized];
  if (!mapped) {
    throw new CommunicationConversationScopeInvalidException(
      'Restriction type is invalid',
      { field: 'type', value },
    );
  }

  return mapped;
}

export function normalizeCommunicationRestrictionStatus(
  value: string,
): CommunicationRestrictionStatusValue {
  const normalized = value.trim().toLowerCase();
  const mapped = RESTRICTION_STATUS_MAP[normalized];
  if (!mapped) {
    throw new CommunicationConversationScopeInvalidException(
      'Restriction status is invalid',
      { field: 'status', value },
    );
  }

  return mapped;
}

export function assertCanCreateRestriction(params: {
  targetUserId: string;
  restrictionType: CommunicationRestrictionTypeValue;
  hasActiveConflict: boolean;
  startsAt?: Date | null;
  expiresAt?: Date | null;
  now?: Date;
}): void {
  if (params.hasActiveConflict) {
    throw new CommunicationUserRestrictionConflictException({
      targetUserId: params.targetUserId,
      restrictionType: params.restrictionType,
    });
  }

  assertRestrictionDates({
    startsAt: params.startsAt,
    expiresAt: params.expiresAt,
    now: params.now,
  });
}

export function assertCanUpdateRestriction(params: {
  restriction: PlainCommunicationUserRestriction;
  startsAt?: Date | null;
  expiresAt?: Date | null;
  now?: Date;
}): void {
  if (params.restriction.liftedAt) {
    throw new CommunicationUserRestrictionConflictException({
      restrictionId: params.restriction.id,
      status: 'LIFTED',
    });
  }

  assertRestrictionDates({
    startsAt: params.startsAt ?? params.restriction.startsAt,
    expiresAt: params.expiresAt,
    now: params.now,
  });
}

export function assertCanRevokeRestriction(params: {
  restriction: PlainCommunicationUserRestriction;
}): void {
  if (params.restriction.liftedAt) {
    throw new CommunicationUserRestrictionConflictException({
      restrictionId: params.restriction.id,
      status: 'LIFTED',
    });
  }
}

export function deriveCommunicationRestrictionStatus(
  restriction: Pick<PlainCommunicationUserRestriction, 'expiresAt' | 'liftedAt'>,
  now = new Date(),
): CommunicationRestrictionStatusValue {
  if (restriction.liftedAt) return 'LIFTED';
  if (restriction.expiresAt && restriction.expiresAt.getTime() <= now.getTime()) {
    return 'EXPIRED';
  }

  return 'ACTIVE';
}

function assertRestrictionDates(params: {
  startsAt?: Date | null;
  expiresAt?: Date | null;
  now?: Date;
}): void {
  const now = params.now ?? new Date();
  const startsAt = params.startsAt ?? now;

  if (params.expiresAt && params.expiresAt.getTime() <= now.getTime()) {
    throw new CommunicationConversationScopeInvalidException(
      'Restriction expiry must be in the future',
      { field: 'expiresAt' },
    );
  }

  if (params.expiresAt && params.expiresAt.getTime() <= startsAt.getTime()) {
    throw new CommunicationConversationScopeInvalidException(
      'Restriction expiry must be after start time',
      { field: 'expiresAt' },
    );
  }
}
