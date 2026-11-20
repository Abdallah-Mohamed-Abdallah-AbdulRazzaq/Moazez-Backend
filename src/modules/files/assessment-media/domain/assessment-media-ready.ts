import type { File as ManagedFile, FileUploadSession } from '@prisma/client';
import {
  AssessmentMediaException,
  ASSESSMENT_MEDIA_TECHNICAL_VERSION,
  ASSESSMENT_MEDIA_VERSION,
} from './assessment-media.contract';
import {
  ASSESSMENT_MEDIA_CAPS,
  ASSESSMENT_MEDIA_MIMES,
  type EffectiveAssessmentMediaPolicy,
} from './assessment-media.policy';

export type AssessmentAuthoringPurpose =
  | 'HOMEWORK_ASSIGNMENT_MEDIA'
  | 'GRADE_ASSESSMENT_MEDIA';
export type AssessmentReadyPurpose =
  | AssessmentAuthoringPurpose
  | 'HOMEWORK_SUBMISSION_MEDIA'
  | 'GRADE_SUBMISSION_MEDIA';

export type AssessmentTechnicalEvidence = {
  kind: 'TECHNICAL';
  checksumSha256: string;
  verifiedAt: string;
  objectIdentity: string;
};

export type AssessmentReadyFile = ManagedFile & {
  verifiedObjectIdentity?: string;
};

const SHA256 = /^[a-f0-9]{64}$/u;
const ATTESTATION_IDENTIFIER = /^[a-z0-9._-]{1,80}$/u;

export function matchesTechnicalEvidence(
  value: unknown,
  checksum: string | null,
  verifiedAt: Date,
): value is AssessmentTechnicalEvidence {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 4 &&
    record.kind === 'TECHNICAL' &&
    typeof record.checksumSha256 === 'string' &&
    record.checksumSha256 === checksum &&
    SHA256.test(record.checksumSha256) &&
    record.verifiedAt === verifiedAt.toISOString() &&
    typeof record.objectIdentity === 'string' &&
    SHA256.test(record.objectIdentity)
  );
}

/** Consumer validation of server-owned terminal evidence, never HTTP attestation JSON. */
export function assertAssessmentReadyEvidence(
  session: FileUploadSession,
  file: ManagedFile,
  input: {
    schoolId: string;
    organizationId: string;
    contextId: string;
    creatorId: string;
    privateBucket: string;
    expectedPurpose?: AssessmentReadyPurpose;
  },
): string | undefined {
  const evidence = session.assessmentSecurityEvidence;
  const record =
    evidence && typeof evidence === 'object' && !Array.isArray(evidence)
      ? evidence
      : null;
  if (
    session.status !== 'READY' ||
    session.purpose !==
      (input.expectedPurpose ?? 'HOMEWORK_ASSIGNMENT_MEDIA') ||
    session.purposeContextId !== input.contextId ||
    session.schoolId !== input.schoolId ||
    session.organizationId !== input.organizationId ||
    session.createdByUserId !== input.creatorId ||
    session.fileId !== file.id ||
    file.schoolId !== input.schoolId ||
    file.organizationId !== input.organizationId ||
    file.uploaderId !== input.creatorId ||
    file.visibility !== 'PRIVATE' ||
    file.deletedAt !== null ||
    file.bucket !== input.privateBucket ||
    file.bucket !== session.finalBucket ||
    file.objectKey !== session.finalObjectKey ||
    file.originalName !== session.originalName ||
    file.mimeType !== session.verifiedMimeType ||
    session.expectedMimeType !== session.verifiedMimeType ||
    file.sizeBytes !== session.actualSizeBytes ||
    session.expectedSizeBytes !== session.actualSizeBytes ||
    file.sizeBytes <= 0n ||
    !session.checksumSha256 ||
    !SHA256.test(session.checksumSha256) ||
    file.checksumSha256 !== session.checksumSha256 ||
    !session.verifiedAt ||
    !session.completedAt ||
    session.assessmentVerificationClaimId !== null ||
    session.failedAt !== null ||
    session.cancelledAt !== null ||
    session.finalCleanupClaimedAt !== null ||
    session.finalObjectDeletedAt !== null ||
    session.verifiedAt < session.createdAt ||
    session.verifiedAt > session.completedAt ||
    session.verifiedAt > session.expiresAt ||
    session.completedAt > new Date()
  )
    throw new AssessmentMediaException('ready_relationship_invalid');
  if (session.verificationVersion === ASSESSMENT_MEDIA_TECHNICAL_VERSION) {
    if (
      matchesTechnicalEvidence(
        record,
        session.checksumSha256,
        session.verifiedAt,
      )
    )
      return record.objectIdentity;
  } else if (
    session.verificationVersion === ASSESSMENT_MEDIA_VERSION &&
    record?.verdict === 'CLEAN' &&
    record.checksumSha256 === session.checksumSha256 &&
    typeof record.provider === 'string' &&
    ATTESTATION_IDENTIFIER.test(record.provider) &&
    typeof record.version === 'string' &&
    ATTESTATION_IDENTIFIER.test(record.version) &&
    record.verifiedAt === session.verifiedAt.toISOString()
  ) {
    return undefined;
  }
  throw new AssessmentMediaException('ready_relationship_invalid');
}

export function assertAssessmentReadyContentPolicy(
  policy: EffectiveAssessmentMediaPolicy,
  session: FileUploadSession,
  file: ManagedFile,
): void {
  const cap = file.mimeType.startsWith('video/')
    ? ASSESSMENT_MEDIA_CAPS.videoBytes
    : ASSESSMENT_MEDIA_CAPS.nonVideoBytes;
  if (
    !ASSESSMENT_MEDIA_MIMES.includes(file.mimeType) ||
    !policy.allowedMimeTypes.includes(file.mimeType) ||
    file.sizeBytes > policy.maximumFileSizeBytes ||
    file.sizeBytes > cap ||
    (session.width !== null && session.width > policy.maximumWidth) ||
    (session.height !== null && session.height > policy.maximumHeight) ||
    (session.durationSeconds !== null &&
      session.durationSeconds > policy.maximumDurationSeconds)
  )
    throw new AssessmentMediaException('policy_denied');
}

export function assessmentInlinePreviewAllowed(
  policy: EffectiveAssessmentMediaPolicy,
  file: AssessmentReadyFile | null,
): boolean {
  return (
    !!file && policy.allowInlinePreview && file.mimeType !== 'application/pdf'
  );
}
