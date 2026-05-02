import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../common/exceptions/domain-exception';
import {
  CommunicationConversationArchivedException,
  CommunicationConversationClosedException,
  CommunicationConversationScopeInvalidException,
  CommunicationPolicyDisabledException,
} from './communication-conversation-domain';
import { PlainCommunicationPolicy } from './communication-policy-domain';

export type CommunicationParticipantRoleValue =
  | 'OWNER'
  | 'ADMIN'
  | 'MODERATOR'
  | 'MEMBER'
  | 'READ_ONLY'
  | 'SYSTEM';

export type CommunicationParticipantStatusValue =
  | 'ACTIVE'
  | 'INVITED'
  | 'LEFT'
  | 'REMOVED'
  | 'MUTED'
  | 'BLOCKED';

export type CommunicationInviteStatusValue =
  | 'PENDING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CANCELLED';

export type CommunicationJoinRequestStatusValue =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export type ParticipantMutationConversationStatus =
  | 'ACTIVE'
  | 'ARCHIVED'
  | 'CLOSED';

export interface PlainCommunicationParticipant {
  id: string;
  conversationId: string;
  userId: string;
  role: CommunicationParticipantRoleValue;
  status: CommunicationParticipantStatusValue;
  metadata?: Record<string, unknown> | null;
}

export interface PlainCommunicationInvite {
  id: string;
  conversationId: string;
  invitedUserId: string;
  invitedById: string | null;
  status: CommunicationInviteStatusValue;
}

export interface PlainCommunicationJoinRequest {
  id: string;
  conversationId: string;
  requestedById: string;
  reviewedById: string | null;
  status: CommunicationJoinRequestStatusValue;
}

const PARTICIPANT_ROLE_MAP: Record<
  string,
  CommunicationParticipantRoleValue
> = {
  owner: 'OWNER',
  admin: 'ADMIN',
  moderator: 'MODERATOR',
  member: 'MEMBER',
  read_only: 'READ_ONLY',
  system: 'SYSTEM',
};

const PARTICIPANT_STATUS_MAP: Record<
  string,
  CommunicationParticipantStatusValue
> = {
  active: 'ACTIVE',
  invited: 'INVITED',
  left: 'LEFT',
  removed: 'REMOVED',
  muted: 'MUTED',
  blocked: 'BLOCKED',
};

const INVITE_STATUS_MAP: Record<string, CommunicationInviteStatusValue> = {
  pending: 'PENDING',
  accepted: 'ACCEPTED',
  rejected: 'REJECTED',
  expired: 'EXPIRED',
  cancelled: 'CANCELLED',
};

const JOIN_REQUEST_STATUS_MAP: Record<
  string,
  CommunicationJoinRequestStatusValue
> = {
  pending: 'PENDING',
  approved: 'APPROVED',
  rejected: 'REJECTED',
  cancelled: 'CANCELLED',
};

const ACTIVE_PARTICIPANT_STATUSES = new Set<CommunicationParticipantStatusValue>(
  ['ACTIVE', 'MUTED'],
);

const REACTIVATABLE_PARTICIPANT_STATUSES =
  new Set<CommunicationParticipantStatusValue>(['LEFT', 'REMOVED']);

const PROMOTION_TARGETS: Partial<
  Record<CommunicationParticipantRoleValue, CommunicationParticipantRoleValue>
> = {
  READ_ONLY: 'MEMBER',
  MEMBER: 'MODERATOR',
  MODERATOR: 'ADMIN',
  ADMIN: 'OWNER',
};

const DEMOTION_TARGETS: Partial<
  Record<CommunicationParticipantRoleValue, CommunicationParticipantRoleValue>
> = {
  OWNER: 'ADMIN',
  ADMIN: 'MODERATOR',
  MODERATOR: 'MEMBER',
  MEMBER: 'READ_ONLY',
};

export class CommunicationParticipantAlreadyExistsException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'communication.participant.already_exists',
      message: 'Participant already exists in this conversation',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class CommunicationParticipantRoleForbiddenException extends DomainException {
  constructor(message = 'Participant role is not allowed', details?: Record<string, unknown>) {
    super({
      code: 'communication.participant.role_forbidden',
      message,
      httpStatus: HttpStatus.FORBIDDEN,
      details,
    });
  }
}

export class CommunicationParticipantCannotRemoveOwnerException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'communication.participant.cannot_remove_owner',
      message: 'Conversation owner cannot be removed',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class CommunicationParticipantNotActiveException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'communication.participant.not_active',
      message: 'Participant is not active',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class CommunicationConversationNotMemberException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'communication.conversation.not_member',
      message: 'Not a member of this conversation',
      httpStatus: HttpStatus.FORBIDDEN,
      details,
    });
  }
}

export class CommunicationInviteInvalidStatusException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'communication.invite.invalid_status',
      message: 'Invite status transition is invalid',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class CommunicationInviteDuplicatePendingException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'communication.invite.duplicate_pending',
      message: 'A pending invite already exists',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class CommunicationJoinRequestInvalidStatusException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'communication.join_request.invalid_status',
      message: 'Join request status transition is invalid',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class CommunicationJoinRequestDuplicatePendingException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'communication.join_request.duplicate_pending',
      message: 'A pending join request already exists',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export function normalizeCommunicationParticipantRole(
  value: string,
): CommunicationParticipantRoleValue {
  const normalized = value.trim().toLowerCase();
  const mapped = PARTICIPANT_ROLE_MAP[normalized];
  if (!mapped) {
    throw new CommunicationParticipantRoleForbiddenException(
      'Participant role is not allowed',
      { field: 'role', value },
    );
  }

  return mapped;
}

export function normalizeCommunicationParticipantStatus(
  value: string,
): CommunicationParticipantStatusValue {
  const normalized = value.trim().toLowerCase();
  const mapped = PARTICIPANT_STATUS_MAP[normalized];
  if (!mapped) {
    throw new CommunicationConversationScopeInvalidException(
      'Participant status is invalid',
      { field: 'status', value },
    );
  }

  return mapped;
}

export function normalizeCommunicationInviteStatus(
  value: string,
): CommunicationInviteStatusValue {
  const normalized = value.trim().toLowerCase();
  const mapped = INVITE_STATUS_MAP[normalized];
  if (!mapped) {
    throw new CommunicationInviteInvalidStatusException({
      field: 'status',
      value,
    });
  }

  return mapped;
}

export function normalizeCommunicationJoinRequestStatus(
  value: string,
): CommunicationJoinRequestStatusValue {
  const normalized = value.trim().toLowerCase();
  const mapped = JOIN_REQUEST_STATUS_MAP[normalized];
  if (!mapped) {
    throw new CommunicationJoinRequestInvalidStatusException({
      field: 'status',
      value,
    });
  }

  return mapped;
}

export function assertParticipantMutationAllowedByPolicy(
  policy: Pick<PlainCommunicationPolicy, 'isEnabled'>,
): void {
  if (!policy.isEnabled) {
    throw new CommunicationPolicyDisabledException();
  }
}

export function assertConversationAllowsParticipantMutation(
  status: ParticipantMutationConversationStatus,
): void {
  if (status === 'ARCHIVED') {
    throw new CommunicationConversationArchivedException();
  }
  if (status === 'CLOSED') {
    throw new CommunicationConversationClosedException();
  }
}

export function assertCanAddParticipant(params: {
  policy: Pick<PlainCommunicationPolicy, 'isEnabled'>;
  conversationStatus: ParticipantMutationConversationStatus;
  existingParticipant?: PlainCommunicationParticipant | null;
  role: CommunicationParticipantRoleValue;
  status: CommunicationParticipantStatusValue;
}): void {
  assertParticipantMutationAllowedByPolicy(params.policy);
  assertConversationAllowsParticipantMutation(params.conversationStatus);
  assertNonSystemRole(params.role);

  if (!ACTIVE_PARTICIPANT_STATUSES.has(params.status)) {
    throw new CommunicationParticipantRoleForbiddenException(
      'Participant add status is not allowed',
      { status: params.status },
    );
  }

  if (!params.existingParticipant) return;
  if (REACTIVATABLE_PARTICIPANT_STATUSES.has(params.existingParticipant.status)) {
    return;
  }

  throw new CommunicationParticipantAlreadyExistsException({
    conversationId: params.existingParticipant.conversationId,
    userId: params.existingParticipant.userId,
    status: params.existingParticipant.status,
  });
}

export function assertCanUpdateParticipant(params: {
  policy: Pick<PlainCommunicationPolicy, 'isEnabled'>;
  conversationStatus: ParticipantMutationConversationStatus;
  participant: PlainCommunicationParticipant;
  activeOwnerCount: number;
  role?: CommunicationParticipantRoleValue;
  status?: CommunicationParticipantStatusValue;
  metadata?: Record<string, unknown> | null;
}): void {
  assertParticipantMutationAllowedByPolicy(params.policy);
  assertConversationAllowsParticipantMutation(params.conversationStatus);
  assertPlainObjectMetadata(params.metadata);

  if (params.role) {
    assertNonSystemRole(params.role);
    if (
      params.participant.role === 'OWNER' &&
      params.role !== 'OWNER'
    ) {
      assertNotLastOwner(params.participant, params.activeOwnerCount);
    }
  }

  if (params.status) {
    if (
      params.status === 'INVITED' ||
      params.status === 'LEFT' ||
      params.status === 'REMOVED'
    ) {
      throw new CommunicationParticipantRoleForbiddenException(
        'Participant status transition is not allowed here',
        { status: params.status },
      );
    }
    if (
      params.participant.role === 'OWNER' &&
      !ACTIVE_PARTICIPANT_STATUSES.has(params.status)
    ) {
      assertNotLastOwner(params.participant, params.activeOwnerCount);
    }
  }
}

export function assertCanRemoveParticipant(params: {
  policy: Pick<PlainCommunicationPolicy, 'isEnabled'>;
  conversationStatus: ParticipantMutationConversationStatus;
  participant: PlainCommunicationParticipant;
  activeOwnerCount: number;
}): void {
  assertParticipantMutationAllowedByPolicy(params.policy);
  assertConversationAllowsParticipantMutation(params.conversationStatus);
  assertParticipantIsActive(params.participant);
  assertNotLastOwner(params.participant, params.activeOwnerCount);
}

export function assertCanLeaveConversation(params: {
  policy: Pick<PlainCommunicationPolicy, 'isEnabled'>;
  conversationStatus: ParticipantMutationConversationStatus;
  participant: PlainCommunicationParticipant;
  activeOwnerCount: number;
}): void {
  assertCanRemoveParticipant(params);
}

export function assertCanPromoteParticipant(params: {
  policy: Pick<PlainCommunicationPolicy, 'isEnabled'>;
  conversationStatus: ParticipantMutationConversationStatus;
  participant: PlainCommunicationParticipant;
  targetRole?: CommunicationParticipantRoleValue;
}): CommunicationParticipantRoleValue {
  assertParticipantMutationAllowedByPolicy(params.policy);
  assertConversationAllowsParticipantMutation(params.conversationStatus);
  assertParticipantIsActive(params.participant);

  const nextRole = PROMOTION_TARGETS[params.participant.role];
  if (!nextRole) {
    throw new CommunicationParticipantRoleForbiddenException(
      'Participant cannot be promoted further',
      { role: params.participant.role },
    );
  }

  if (params.targetRole && params.targetRole !== nextRole) {
    throw new CommunicationParticipantRoleForbiddenException(
      'Participant promotion target is not allowed',
      { role: params.participant.role, targetRole: params.targetRole },
    );
  }

  return nextRole;
}

export function assertCanDemoteParticipant(params: {
  policy: Pick<PlainCommunicationPolicy, 'isEnabled'>;
  conversationStatus: ParticipantMutationConversationStatus;
  participant: PlainCommunicationParticipant;
  activeOwnerCount: number;
  targetRole?: CommunicationParticipantRoleValue;
}): CommunicationParticipantRoleValue {
  assertParticipantMutationAllowedByPolicy(params.policy);
  assertConversationAllowsParticipantMutation(params.conversationStatus);
  assertParticipantIsActive(params.participant);
  assertNotLastOwner(params.participant, params.activeOwnerCount);

  const nextRole = DEMOTION_TARGETS[params.participant.role];
  if (!nextRole) {
    throw new CommunicationParticipantRoleForbiddenException(
      'Participant cannot be demoted further',
      { role: params.participant.role },
    );
  }

  if (params.targetRole && params.targetRole !== nextRole) {
    throw new CommunicationParticipantRoleForbiddenException(
      'Participant demotion target is not allowed',
      { role: params.participant.role, targetRole: params.targetRole },
    );
  }

  return nextRole;
}

export function assertCanCreateInvite(params: {
  policy: Pick<PlainCommunicationPolicy, 'isEnabled'>;
  conversationStatus: ParticipantMutationConversationStatus;
  existingParticipant?: PlainCommunicationParticipant | null;
  hasPendingInvite: boolean;
}): void {
  assertParticipantMutationAllowedByPolicy(params.policy);
  assertConversationAllowsParticipantMutation(params.conversationStatus);

  if (
    params.existingParticipant &&
    ACTIVE_PARTICIPANT_STATUSES.has(params.existingParticipant.status)
  ) {
    throw new CommunicationParticipantAlreadyExistsException({
      conversationId: params.existingParticipant.conversationId,
      userId: params.existingParticipant.userId,
    });
  }

  if (params.hasPendingInvite) {
    throw new CommunicationInviteDuplicatePendingException();
  }
}

export function assertCanAcceptInvite(params: {
  policy: Pick<PlainCommunicationPolicy, 'isEnabled'>;
  conversationStatus: ParticipantMutationConversationStatus;
  invite: PlainCommunicationInvite;
  actorId: string;
}): void {
  assertParticipantMutationAllowedByPolicy(params.policy);
  assertConversationAllowsParticipantMutation(params.conversationStatus);
  assertInviteIsPending(params.invite);
  assertInviteActor(params.invite, params.actorId);
}

export function assertCanRejectInvite(params: {
  policy: Pick<PlainCommunicationPolicy, 'isEnabled'>;
  conversationStatus: ParticipantMutationConversationStatus;
  invite: PlainCommunicationInvite;
  actorId: string;
}): void {
  assertCanAcceptInvite(params);
}

export function assertCanCreateJoinRequest(params: {
  policy: Pick<PlainCommunicationPolicy, 'isEnabled'>;
  conversationStatus: ParticipantMutationConversationStatus;
  existingParticipant?: PlainCommunicationParticipant | null;
  hasPendingJoinRequest: boolean;
}): void {
  assertParticipantMutationAllowedByPolicy(params.policy);
  assertConversationAllowsParticipantMutation(params.conversationStatus);

  if (
    params.existingParticipant &&
    ACTIVE_PARTICIPANT_STATUSES.has(params.existingParticipant.status)
  ) {
    throw new CommunicationParticipantAlreadyExistsException({
      conversationId: params.existingParticipant.conversationId,
      userId: params.existingParticipant.userId,
    });
  }

  if (params.hasPendingJoinRequest) {
    throw new CommunicationJoinRequestDuplicatePendingException();
  }
}

export function assertCanApproveJoinRequest(params: {
  policy: Pick<PlainCommunicationPolicy, 'isEnabled'>;
  conversationStatus: ParticipantMutationConversationStatus;
  joinRequest: PlainCommunicationJoinRequest;
}): void {
  assertParticipantMutationAllowedByPolicy(params.policy);
  assertConversationAllowsParticipantMutation(params.conversationStatus);
  assertJoinRequestIsPending(params.joinRequest);
}

export function assertCanRejectJoinRequest(params: {
  policy: Pick<PlainCommunicationPolicy, 'isEnabled'>;
  conversationStatus: ParticipantMutationConversationStatus;
  joinRequest: PlainCommunicationJoinRequest;
}): void {
  assertCanApproveJoinRequest(params);
}

export function assertNotLastOwner(
  participant: Pick<PlainCommunicationParticipant, 'role'>,
  activeOwnerCount: number,
): void {
  if (participant.role === 'OWNER' && activeOwnerCount <= 1) {
    throw new CommunicationParticipantCannotRemoveOwnerException({
      activeOwnerCount,
    });
  }
}

export function isActiveCommunicationParticipantStatus(
  status: CommunicationParticipantStatusValue,
): boolean {
  return ACTIVE_PARTICIPANT_STATUSES.has(status);
}

function assertParticipantIsActive(
  participant: PlainCommunicationParticipant,
): void {
  if (!ACTIVE_PARTICIPANT_STATUSES.has(participant.status)) {
    throw new CommunicationParticipantNotActiveException({
      participantId: participant.id,
      status: participant.status,
    });
  }
}

function assertNonSystemRole(role: CommunicationParticipantRoleValue): void {
  if (role === 'SYSTEM') {
    throw new CommunicationParticipantRoleForbiddenException(
      'System participant role is reserved',
      { role },
    );
  }
}

function assertInviteIsPending(invite: PlainCommunicationInvite): void {
  if (invite.status !== 'PENDING') {
    throw new CommunicationInviteInvalidStatusException({
      inviteId: invite.id,
      status: invite.status,
    });
  }
}

function assertInviteActor(
  invite: PlainCommunicationInvite,
  actorId: string,
): void {
  if (invite.invitedUserId !== actorId) {
    throw new CommunicationConversationNotMemberException({
      inviteId: invite.id,
    });
  }
}

function assertJoinRequestIsPending(
  joinRequest: PlainCommunicationJoinRequest,
): void {
  if (joinRequest.status !== 'PENDING') {
    throw new CommunicationJoinRequestInvalidStatusException({
      requestId: joinRequest.id,
      status: joinRequest.status,
    });
  }
}

function assertPlainObjectMetadata(
  value: Record<string, unknown> | null | undefined,
): void {
  if (value === undefined || value === null) return;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new CommunicationConversationScopeInvalidException(
      'Participant metadata must be an object',
      { field: 'metadata' },
    );
  }
}
