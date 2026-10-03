import { createHash } from 'node:crypto';
import {
  AcademicContentAudienceRecipientKind as RecipientKind,
  AcademicContentAudienceType as Audience,
  AcademicContentPublicationStatus as PublicationStatus,
  AcademicContentStatus as ContentStatus,
  AcademicContentType as ContentType,
} from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { isAcademicContentAudienceAllowed } from './academic-content-audience.policy';
import {
  AcademicContentTermDates,
  classifyAcademicContentTerm,
} from './academic-content-lifecycle.policy';

export function isAcademicContentExternallyPublishable(
  type: ContentType,
  audience: Audience,
): boolean {
  return (
    type !== ContentType.TEACHER_PREPARATION &&
    audience !== Audience.INTERNAL_STAFF &&
    isAcademicContentAudienceAllowed(type, audience)
  );
}

export type AcademicContentPublicationRevisionStrategy =
  | 'CAPTURE_CURRENT_REVISION_V2'
  | 'USE_EXACT_APPROVED_REVISION';

export function academicContentPublicationRevisionStrategy(
  status: ContentStatus,
): AcademicContentPublicationRevisionStrategy | null {
  if (status === ContentStatus.DRAFT) return 'CAPTURE_CURRENT_REVISION_V2';
  if (status === ContentStatus.APPROVED) return 'USE_EXACT_APPROVED_REVISION';
  return null;
}

export type AcademicContentRecipientIdentityInput =
  | { recipientKind: typeof RecipientKind.STUDENT; enrollmentId: string }
  | {
      recipientKind: typeof RecipientKind.GUARDIAN;
      guardianId: string;
      studentId: string;
      enrollmentId: string;
    };

function canonicalUuid(value: string): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new ValidationDomainException('Recipient context requires UUIDs');
  return value.toLowerCase();
}

/** Server-owned business identity, independent of overlapping target matches. */
export function academicContentRecipientIdentity(
  input: AcademicContentRecipientIdentityInput,
): { identity: string; identityFingerprint: string } {
  const enrollmentId = canonicalUuid(input.enrollmentId);
  const identity =
    input.recipientKind === RecipientKind.STUDENT
      ? `student:${enrollmentId}`
      : `guardian:${canonicalUuid(input.guardianId)}:${canonicalUuid(input.studentId)}:${enrollmentId}`;
  return {
    identity,
    identityFingerprint: createHash('sha256').update(identity).digest('hex'),
  };
}

export type AcademicContentPublicationTiming = {
  publishAt: Date;
  visibleFrom: Date;
  visibleUntil: Date | null;
};

export type AcademicContentPublicationTimingInput = {
  now: Date;
  type: ContentType;
  term: AcademicContentTermDates;
  publishAt?: Date;
  visibleFrom?: Date;
  visibleUntil?: Date | null;
  onlineSessionEndAt?: Date | null;
};

function validInstant(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

export type AcademicContentPublicationCommand = {
  clientRequestId: string;
  publishAt?: Date;
  visibleFrom?: Date;
  visibleUntil?: Date | null;
};

export function assertAcademicContentPublicationUuid(value: string): void {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new ValidationDomainException('Publication identity requires a UUID');
}

/** Logical intent, before defaults: execution time and request identity are excluded. */
export function academicContentPublicationRequestFingerprint(
  contentId: string,
  input: Pick<
    AcademicContentPublicationCommand,
    'publishAt' | 'visibleFrom' | 'visibleUntil'
  >,
): string {
  assertAcademicContentPublicationUuid(contentId);
  const instant = (value: Date | undefined) => {
    if (value === undefined) return ['OMITTED'];
    if (!validInstant(value))
      throw new ValidationDomainException(
        'Publication timing requires valid dates',
      );
    return ['EXPLICIT_ISO', value.toISOString()];
  };
  return createHash('sha256')
    .update(
      JSON.stringify({
        contractVersion: 1,
        academicContentId: contentId.toLowerCase(),
        publishAt: instant(input.publishAt),
        visibleFrom: instant(input.visibleFrom),
        visibleUntil:
          input.visibleUntil === null ? ['NULL'] : instant(input.visibleUntil),
      }),
    )
    .digest('hex');
}

export function assertAcademicContentPublicationCommand(
  contentId: string,
  input: AcademicContentPublicationCommand,
): void {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some(
      (key) =>
        ![
          'clientRequestId',
          'publishAt',
          'visibleFrom',
          'visibleUntil',
        ].includes(key),
    )
  )
    throw new ValidationDomainException(
      'Publication command contains unsupported fields',
    );
  assertAcademicContentPublicationUuid(input.clientRequestId);
  academicContentPublicationRequestFingerprint(contentId, input);
}

function validTerm(term: AcademicContentTermDates): boolean {
  return (
    validInstant(term.startDate) &&
    validInstant(term.endDate) &&
    term.startDate.toISOString().slice(0, 10) <=
      term.endDate.toISOString().slice(0, 10)
  );
}

export function normalizeAcademicContentPublicationTiming(
  input: AcademicContentPublicationTimingInput,
): AcademicContentPublicationTiming {
  const publishAt = input.publishAt ?? input.now;
  const visibleFrom = input.visibleFrom ?? publishAt;
  const isOnline = input.type === ContentType.ONLINE_SESSION;
  const visibleUntil =
    input.visibleUntil === undefined && isOnline
      ? (input.onlineSessionEndAt ?? null)
      : (input.visibleUntil ?? null);

  if (
    !validInstant(input.now) ||
    !validInstant(publishAt) ||
    !validInstant(visibleFrom) ||
    (visibleUntil !== null && !validInstant(visibleUntil)) ||
    !validTerm(input.term)
  )
    throw new ValidationDomainException(
      'Publication timing requires valid dates',
    );

  const publicationDate = publishAt.toISOString().slice(0, 10);
  if (
    classifyAcademicContentTerm(input.term, input.now) ===
      'HISTORICALLY_ENDED' ||
    publicationDate < input.term.startDate.toISOString().slice(0, 10) ||
    publicationDate > input.term.endDate.toISOString().slice(0, 10)
  )
    throw new ValidationDomainException(
      'Publication timing is outside the term',
    );
  if (
    visibleFrom < publishAt ||
    (visibleUntil !== null &&
      (visibleUntil <= visibleFrom || visibleUntil <= input.now))
  )
    throw new ValidationDomainException(
      'Publication visibility window is invalid',
    );

  if (isOnline) {
    const endAt = input.onlineSessionEndAt;
    // Explicit null cannot remove the session's natural visibility end.
    if (
      !endAt ||
      !validInstant(endAt) ||
      endAt <= input.now ||
      publishAt >= endAt ||
      visibleUntil === null ||
      visibleUntil > endAt
    )
      throw new ValidationDomainException(
        'Online session publication timing is invalid',
      );
  }
  return {
    publishAt: new Date(publishAt),
    visibleFrom: new Date(visibleFrom),
    visibleUntil: visibleUntil === null ? null : new Date(visibleUntil),
  };
}

export function isAcademicContentPublicationVisible(
  publication: {
    status: PublicationStatus;
    publishedAt: Date | null;
    visibleFrom: Date;
    visibleUntil: Date | null;
  },
  now: Date,
): boolean {
  return (
    publication.status === PublicationStatus.PUBLISHED &&
    publication.publishedAt !== null &&
    now >= publication.visibleFrom &&
    (publication.visibleUntil === null || now < publication.visibleUntil)
  );
}

export type AcademicContentPublicationReadinessInput = {
  type: ContentType;
  audience: Audience;
  sourceStatus: ContentStatus;
  revisionStrategyAvailable: boolean;
  // Completeness comes from authoring readiness or an immutable approved revision.
  authoringComplete: boolean;
  term: AcademicContentTermDates | null;
  termValid: boolean;
  targetCount: number;
  typeDetailComplete: boolean;
  activeAssetsValid: boolean;
  hasActivePublication: boolean;
  now: Date;
  onlineSessionEndAt?: Date | null;
};

export type AcademicContentPublicationReadiness = {
  canPublish: boolean;
  canSchedule: boolean;
  blockingReasons: string[];
};

/** Capability evaluation; request timing is validated separately by normalization. */
export function evaluateAcademicContentPublicationReadiness(
  input: AcademicContentPublicationReadinessInput,
): AcademicContentPublicationReadiness {
  const blockingReasons: string[] = [];
  if (!isAcademicContentExternallyPublishable(input.type, input.audience))
    blockingReasons.push('publication.type_or_audience_unavailable');
  if (academicContentPublicationRevisionStrategy(input.sourceStatus) === null)
    blockingReasons.push('publication.source_status_unavailable');
  if (!input.revisionStrategyAvailable)
    blockingReasons.push('publication.revision_strategy_unavailable');
  if (!input.authoringComplete)
    blockingReasons.push('publication.authoring_incomplete');
  if (
    !input.termValid ||
    !input.term ||
    !validTerm(input.term) ||
    !validInstant(input.now)
  )
    blockingReasons.push('publication.term_invalid');
  else if (
    classifyAcademicContentTerm(input.term, input.now) === 'HISTORICALLY_ENDED'
  )
    blockingReasons.push('publication.term_ended');
  if (!Number.isInteger(input.targetCount) || input.targetCount < 1)
    blockingReasons.push('publication.targets_missing');
  if (!input.typeDetailComplete)
    blockingReasons.push('publication.type_detail_incomplete');
  if (!input.activeAssetsValid)
    blockingReasons.push('publication.assets_invalid');
  if (input.hasActivePublication)
    blockingReasons.push('publication.active_publication_exists');
  if (blockingReasons.length > 0)
    return { canPublish: false, canSchedule: false, blockingReasons };

  const term = input.term!;
  const termStart = Date.parse(
    `${term.startDate.toISOString().slice(0, 10)}T00:00:00.000Z`,
  );
  const termEndExclusive =
    Date.parse(`${term.endDate.toISOString().slice(0, 10)}T00:00:00.000Z`) +
    86_400_000;
  const onlineEnd =
    input.type === ContentType.ONLINE_SESSION
      ? input.onlineSessionEndAt?.getTime()
      : termEndExclusive;
  if (
    onlineEnd === undefined ||
    !Number.isFinite(onlineEnd) ||
    onlineEnd <= input.now.getTime()
  )
    return {
      canPublish: false,
      canSchedule: false,
      blockingReasons: ['publication.online_session_finished_or_missing'],
    };
  const endExclusive = Math.min(termEndExclusive, onlineEnd);
  const canPublish =
    input.now.getTime() >= termStart && input.now.getTime() < endExclusive;
  const firstFutureInstant = Math.max(termStart, input.now.getTime() + 1);
  return {
    canPublish,
    canSchedule: firstFutureInstant < endExclusive,
    blockingReasons,
  };
}
