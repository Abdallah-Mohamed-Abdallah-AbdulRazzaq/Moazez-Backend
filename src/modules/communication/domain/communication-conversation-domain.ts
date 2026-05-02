import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../common/exceptions/domain-exception';
import { PlainCommunicationPolicy } from './communication-policy-domain';

export type CommunicationConversationTypeValue =
  | 'DIRECT'
  | 'GROUP'
  | 'CLASSROOM'
  | 'GRADE'
  | 'SECTION'
  | 'STAGE'
  | 'SCHOOL_WIDE'
  | 'SUPPORT'
  | 'SYSTEM';

export type CommunicationConversationStatusValue =
  | 'ACTIVE'
  | 'ARCHIVED'
  | 'CLOSED';

export interface ConversationCreatePayload {
  type: CommunicationConversationTypeValue;
  title?: string | null;
  description?: string | null;
  academicYearId?: string | null;
  termId?: string | null;
  stageId?: string | null;
  gradeId?: string | null;
  sectionId?: string | null;
  classroomId?: string | null;
  subjectId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ConversationMetadataPatch {
  title?: string | null;
  description?: string | null;
  avatarFileId?: string | null;
  isReadOnly?: boolean;
  isPinned?: boolean;
  metadata?: Record<string, unknown> | null;
}

export interface ConversationCountBucket {
  value: string;
  count: number;
}

export interface ConversationCountsInput {
  total: number;
  statuses: ConversationCountBucket[];
  types: ConversationCountBucket[];
}

export interface ConversationCountsSummary {
  total: number;
  active: number;
  archived: number;
  closed: number;
  direct: number;
  group: number;
  classroom: number;
  grade: number;
  section: number;
  stage: number;
  schoolWide: number;
  support: number;
  system: number;
}

export interface ParticipantCountsInput {
  total: number;
  statuses: ConversationCountBucket[];
}

export interface ParticipantCountsSummary {
  total: number;
  active: number;
  invited: number;
  left: number;
  removed: number;
  muted: number;
  blocked: number;
}

const CONVERSATION_TYPE_MAP: Record<
  string,
  CommunicationConversationTypeValue
> = {
  direct: 'DIRECT',
  group: 'GROUP',
  classroom: 'CLASSROOM',
  grade: 'GRADE',
  section: 'SECTION',
  stage: 'STAGE',
  school_wide: 'SCHOOL_WIDE',
  support: 'SUPPORT',
  system: 'SYSTEM',
};

const CONVERSATION_STATUS_MAP: Record<
  string,
  CommunicationConversationStatusValue
> = {
  active: 'ACTIVE',
  archived: 'ARCHIVED',
  closed: 'CLOSED',
};

export class CommunicationConversationInvalidTypeException extends DomainException {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      code: 'communication.conversation.invalid_type',
      message,
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class CommunicationConversationScopeInvalidException extends DomainException {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      code: 'communication.scope.invalid',
      message,
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class CommunicationPolicyDisabledException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'communication.policy.disabled',
      message: 'Communication policy is disabled',
      httpStatus: HttpStatus.FORBIDDEN,
      details,
    });
  }
}

export class CommunicationConversationArchivedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'communication.conversation.archived',
      message: 'Conversation is archived',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class CommunicationConversationClosedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'communication.conversation.closed',
      message: 'Conversation is closed',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export function normalizeCommunicationConversationType(
  value: string,
): CommunicationConversationTypeValue {
  const normalized = value.trim().toLowerCase();
  const mapped = CONVERSATION_TYPE_MAP[normalized];
  if (!mapped) {
    throw new CommunicationConversationInvalidTypeException(
      'Conversation type is invalid',
      { field: 'type', value },
    );
  }

  return mapped;
}

export function normalizeCommunicationConversationStatus(
  value: string,
): CommunicationConversationStatusValue {
  const normalized = value.trim().toLowerCase();
  const mapped = CONVERSATION_STATUS_MAP[normalized];
  if (!mapped) {
    throw new CommunicationConversationScopeInvalidException(
      'Conversation status is invalid',
      { field: 'status', value },
    );
  }

  return mapped;
}

export function assertConversationCreateAllowedByPolicy(
  policy: Pick<PlainCommunicationPolicy, 'isEnabled'>,
): void {
  if (!policy.isEnabled) {
    throw new CommunicationPolicyDisabledException();
  }
}

export function assertConversationCreatePayload(
  payload: ConversationCreatePayload,
): void {
  assertNullableTextLength('title', payload.title, 255);
  assertNullableTextLength('description', payload.description, 4000);
  assertPlainObjectMetadata(payload.metadata);

  switch (payload.type) {
    case 'CLASSROOM':
      assertRequiredContext(payload.classroomId, 'classroomId', payload.type);
      return;
    case 'GRADE':
      assertRequiredContext(payload.gradeId, 'gradeId', payload.type);
      return;
    case 'SECTION':
      assertRequiredContext(payload.sectionId, 'sectionId', payload.type);
      return;
    case 'STAGE':
      assertRequiredContext(payload.stageId, 'stageId', payload.type);
      return;
    case 'DIRECT':
    case 'GROUP':
    case 'SCHOOL_WIDE':
    case 'SUPPORT':
    case 'SYSTEM':
      return;
  }
}

export function assertConversationMetadataPatch(params: {
  status: CommunicationConversationStatusValue;
  patch: ConversationMetadataPatch;
}): void {
  assertConversationAllowsMetadataMutation(params.status);
  assertNullableTextLength('title', params.patch.title, 255);
  assertNullableTextLength('description', params.patch.description, 4000);
  assertPlainObjectMetadata(params.patch.metadata);
}

export function assertConversationCanBeArchived(
  status: CommunicationConversationStatusValue,
): void {
  if (status === 'ARCHIVED') {
    throw new CommunicationConversationArchivedException();
  }
  if (status === 'CLOSED') {
    throw new CommunicationConversationClosedException();
  }
}

export function assertConversationCanBeClosed(
  status: CommunicationConversationStatusValue,
): void {
  if (status === 'ARCHIVED') {
    throw new CommunicationConversationArchivedException();
  }
  if (status === 'CLOSED') {
    throw new CommunicationConversationClosedException();
  }
}

export function assertConversationCanBeReopened(
  status: CommunicationConversationStatusValue,
): void {
  if (status === 'ACTIVE') {
    throw new CommunicationConversationScopeInvalidException(
      'Only archived or closed conversations can be reopened',
      { status },
    );
  }
}

export function buildConversationSearchFilters(search?: string | null): {
  search?: string;
} {
  const normalized = search?.trim();
  return normalized ? { search: normalized } : {};
}

export function summarizeConversationCounts(
  input: ConversationCountsInput,
): ConversationCountsSummary {
  return {
    total: input.total,
    active: countFor(input.statuses, 'ACTIVE'),
    archived: countFor(input.statuses, 'ARCHIVED'),
    closed: countFor(input.statuses, 'CLOSED'),
    direct: countFor(input.types, 'DIRECT'),
    group: countFor(input.types, 'GROUP'),
    classroom: countFor(input.types, 'CLASSROOM'),
    grade: countFor(input.types, 'GRADE'),
    section: countFor(input.types, 'SECTION'),
    stage: countFor(input.types, 'STAGE'),
    schoolWide: countFor(input.types, 'SCHOOL_WIDE'),
    support: countFor(input.types, 'SUPPORT'),
    system: countFor(input.types, 'SYSTEM'),
  };
}

export function summarizeParticipantCounts(
  input: ParticipantCountsInput,
): ParticipantCountsSummary {
  return {
    total: input.total,
    active: countFor(input.statuses, 'ACTIVE'),
    invited: countFor(input.statuses, 'INVITED'),
    left: countFor(input.statuses, 'LEFT'),
    removed: countFor(input.statuses, 'REMOVED'),
    muted: countFor(input.statuses, 'MUTED'),
    blocked: countFor(input.statuses, 'BLOCKED'),
  };
}

export function normalizeNullableText(value?: string | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function mergeConversationMetadata(
  existing: Record<string, unknown> | null | undefined,
  patch: {
    metadata?: Record<string, unknown> | null;
    isReadOnly?: boolean;
    isPinned?: boolean;
  },
): Record<string, unknown> | null {
  const next: Record<string, unknown> = {
    ...(existing ?? {}),
    ...(patch.metadata ?? {}),
  };

  if (patch.metadata === null) {
    for (const key of Object.keys(next)) delete next[key];
  }

  if (patch.isReadOnly !== undefined) {
    next.isReadOnly = patch.isReadOnly;
  }

  if (patch.isPinned !== undefined) {
    next.isPinned = patch.isPinned;
  }

  return Object.keys(next).length > 0 ? next : null;
}

export function hasOwn<T extends object>(
  value: T,
  key: keyof T,
): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function assertConversationAllowsMetadataMutation(
  status: CommunicationConversationStatusValue,
): void {
  if (status === 'ARCHIVED') {
    throw new CommunicationConversationArchivedException();
  }
  if (status === 'CLOSED') {
    throw new CommunicationConversationClosedException();
  }
}

function assertNullableTextLength(
  field: string,
  value: string | null | undefined,
  maxLength: number,
): void {
  if (value === undefined || value === null) return;
  if (value.trim().length > maxLength) {
    throw new CommunicationConversationScopeInvalidException(
      'Conversation text field is too long',
      { field, maxLength },
    );
  }
}

function assertPlainObjectMetadata(
  value: Record<string, unknown> | null | undefined,
): void {
  if (value === undefined || value === null) return;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new CommunicationConversationScopeInvalidException(
      'Conversation metadata must be an object',
      { field: 'metadata' },
    );
  }
}

function assertRequiredContext(
  value: string | null | undefined,
  field: string,
  type: CommunicationConversationTypeValue,
): void {
  if (!value) {
    throw new CommunicationConversationScopeInvalidException(
      'Conversation context is required for this type',
      { field, type },
    );
  }
}

function countFor(buckets: ConversationCountBucket[], value: string): number {
  return (
    buckets.find((bucket) => bucket.value.toUpperCase() === value)?.count ?? 0
  );
}
