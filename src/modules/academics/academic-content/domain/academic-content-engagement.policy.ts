import { createHash } from 'node:crypto';
import {
  AcademicContentEngagementEventType as EventType,
  AcademicContentType,
  Prisma,
} from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import {
  academicContentCurrentAccessAllows,
  AcademicContentCurrentAccessPublication,
  AcademicContentCurrentRecipientContext,
} from './academic-content-current-access.policy';
import { assertAcademicContentPublicationUuid } from './academic-content-publication.policy';
import { decodeAcademicContentRevisionSnapshotV2 } from './academic-content-revision-snapshot';
import { STUDENT_ACADEMIC_CONTENT_TYPES } from './academic-content-recipient.query';

export type AcademicContentEngagementCommand = {
  clientRequestId: string;
  eventType: EventType;
  fileId?: string | null;
  revisionLinkId?: string | null;
};

/** Facts resolved by future live authorization, never a recipient request DTO. */
export type AcademicContentEngagementFacts = {
  context: AcademicContentCurrentRecipientContext;
  publication: AcademicContentCurrentAccessPublication;
  canonicalPublicationId: string;
  currentRelationship: {
    schoolId: string;
    actorUserId: string;
    studentId: string;
    enrollmentId: string;
    guardianId: string | null;
  };
  typeSpecificSnapshot: Prisma.JsonValue | null;
  now: Date;
};

export type AcademicContentEngagementAttribution = {
  schoolId: string;
  academicContentId: string;
  publicationId: string;
  revisionId: string;
  actorUserId: string;
  actorKind: 'STUDENT' | 'PARENT';
  studentId: string;
  enrollmentId: string;
  guardianId: string | null;
};

function uuid(value: string): string {
  assertAcademicContentPublicationUuid(value);
  return value.toLowerCase();
}

export function academicContentEngagementShapeAllows(
  command: AcademicContentEngagementCommand,
): boolean {
  if (
    !command ||
    typeof command !== 'object' ||
    Array.isArray(command) ||
    Object.keys(command).some(
      (key) =>
        !['clientRequestId', 'eventType', 'fileId', 'revisionLinkId'].includes(
          key,
        ),
    )
  )
    return false;
  try {
    uuid(command.clientRequestId);
    if (command.fileId != null) uuid(command.fileId);
    if (command.revisionLinkId != null) uuid(command.revisionLinkId);
  } catch {
    return false;
  }
  switch (command.eventType) {
    case EventType.CONTENT_VIEWED:
    case EventType.JOIN_LINK_CLICKED:
      return command.fileId == null && command.revisionLinkId == null;
    case EventType.FILE_PREVIEWED:
    case EventType.FILE_DOWNLOADED:
      return command.fileId != null && command.revisionLinkId == null;
    case EventType.LINK_CLICKED:
      return command.fileId == null && command.revisionLinkId != null;
    default:
      return false;
  }
}

function currentRecipientAllows(
  facts: AcademicContentEngagementFacts,
): boolean {
  const { context, publication, currentRelationship: relationship } = facts;
  return (
    facts.canonicalPublicationId === publication.id &&
    academicContentCurrentAccessAllows(context, publication, facts.now) &&
    relationship.schoolId === context.schoolId &&
    relationship.actorUserId === context.userId &&
    relationship.studentId === context.studentId &&
    relationship.enrollmentId === context.enrollmentId &&
    (context.actorKind === 'STUDENT'
      ? relationship.guardianId === null &&
        (
          STUDENT_ACADEMIC_CONTENT_TYPES as readonly AcademicContentType[]
        ).includes(publication.revision.type)
      : context.actorKind === 'PARENT' &&
        relationship.guardianId !== null &&
        context.guardianIds.includes(relationship.guardianId))
  );
}

/** Checks identity/shape only; it cannot replace live File policy or authorization. */
export function academicContentEngagementEligible(
  facts: AcademicContentEngagementFacts,
  command: AcademicContentEngagementCommand,
  references: {
    revisionAsset?: { schoolId: string; revisionId: string; fileId: string };
    revisionLink?: { schoolId: string; revisionId: string; id: string };
  } = {},
): boolean {
  if (
    !academicContentEngagementShapeAllows(command) ||
    !currentRecipientAllows(facts)
  )
    return false;
  const { schoolId } = facts.context;
  const { revisionId } = facts.publication;
  switch (command.eventType) {
    case EventType.CONTENT_VIEWED:
      return true;
    case EventType.FILE_PREVIEWED:
    case EventType.FILE_DOWNLOADED: {
      const asset = references.revisionAsset;
      return (
        asset !== undefined &&
        asset.schoolId === schoolId &&
        asset.revisionId === revisionId &&
        asset.fileId === command.fileId
      );
    }
    case EventType.LINK_CLICKED: {
      const link = references.revisionLink;
      return (
        link !== undefined &&
        link.schoolId === schoolId &&
        link.revisionId === revisionId &&
        link.id === command.revisionLinkId
      );
    }
    case EventType.JOIN_LINK_CLICKED:
      if (
        facts.publication.revision.type !== AcademicContentType.ONLINE_SESSION
      )
        return false;
      try {
        const snapshot = decodeAcademicContentRevisionSnapshotV2(
          facts.typeSpecificSnapshot,
          facts.publication.revision.type,
        );
        return (
          snapshot.type === AcademicContentType.ONLINE_SESSION &&
          snapshot.state.joinUrl.length > 0 &&
          new Date(snapshot.state.endAt).getTime() > facts.now.getTime()
        );
      } catch {
        return false;
      }
  }
}

export function academicContentAcknowledgementEligible(
  facts: AcademicContentEngagementFacts,
): boolean {
  if (
    facts.context.actorKind !== 'PARENT' ||
    !currentRecipientAllows(facts) ||
    facts.publication.revision.type !== AcademicContentType.GUARDIAN_WEEKLY_NOTE
  )
    return false;
  try {
    const snapshot = decodeAcademicContentRevisionSnapshotV2(
      facts.typeSpecificSnapshot,
      facts.publication.revision.type,
    );
    return (
      snapshot.type === AcademicContentType.GUARDIAN_WEEKLY_NOTE &&
      snapshot.state.requiresAcknowledgement === true
    );
  } catch {
    return false;
  }
}

/** Fixed field order, normalized UUIDs; no URL, clock or arbitrary client scope. */
export function academicContentEngagementRequestFingerprint(
  attribution: AcademicContentEngagementAttribution,
  command: AcademicContentEngagementCommand,
): string {
  if (
    !academicContentEngagementShapeAllows(command) ||
    (attribution.actorKind !== 'STUDENT' &&
      attribution.actorKind !== 'PARENT') ||
    (attribution.actorKind === 'STUDENT'
      ? attribution.guardianId !== null
      : attribution.guardianId === null)
  )
    throw new ValidationDomainException('Invalid engagement identity or shape');
  return createHash('sha256')
    .update(
      JSON.stringify({
        contractVersion: 1,
        schoolId: uuid(attribution.schoolId),
        academicContentId: uuid(attribution.academicContentId),
        publicationId: uuid(attribution.publicationId),
        revisionId: uuid(attribution.revisionId),
        actorUserId: uuid(attribution.actorUserId),
        actorKind: attribution.actorKind,
        studentId: uuid(attribution.studentId),
        enrollmentId: uuid(attribution.enrollmentId),
        guardianId:
          attribution.guardianId === null ? null : uuid(attribution.guardianId),
        eventType: command.eventType,
        fileId: command.fileId == null ? null : uuid(command.fileId),
        revisionLinkId:
          command.revisionLinkId == null ? null : uuid(command.revisionLinkId),
      }),
    )
    .digest('hex');
}

type RetryIdentity = {
  schoolId: string;
  actorUserId: string;
  clientRequestId: string;
  requestFingerprint: string;
};

/** A future unique-conflict handler must reauthorize before returning an existing row. */
export function academicContentEngagementRetryResult(
  existing: RetryIdentity,
  candidate: RetryIdentity,
): 'IDENTICAL' | 'CONFLICT' {
  try {
    return uuid(existing.schoolId) === uuid(candidate.schoolId) &&
      uuid(existing.actorUserId) === uuid(candidate.actorUserId) &&
      uuid(existing.clientRequestId) === uuid(candidate.clientRequestId) &&
      /^[a-f0-9]{64}$/.test(existing.requestFingerprint) &&
      existing.requestFingerprint === candidate.requestFingerprint
      ? 'IDENTICAL'
      : 'CONFLICT';
  } catch {
    return 'CONFLICT';
  }
}
