import type { File as ManagedFile, FileUploadSession } from '@prisma/client';
import {
  AssessmentMediaException,
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
): void {
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
    !/^[a-f0-9]{64}$/u.test(session.checksumSha256) ||
    file.checksumSha256 !== session.checksumSha256 ||
    session.verificationVersion !== ASSESSMENT_MEDIA_VERSION ||
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
    session.completedAt > new Date() ||
    !record ||
    record.verdict !== 'CLEAN' ||
    record.checksumSha256 !== session.checksumSha256 ||
    typeof record.provider !== 'string' ||
    !/^[a-z0-9._-]{1,80}$/u.test(record.provider) ||
    typeof record.version !== 'string' ||
    !/^[a-z0-9._-]{1,80}$/u.test(record.version) ||
    record.verifiedAt !== session.verifiedAt.toISOString()
  )
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
