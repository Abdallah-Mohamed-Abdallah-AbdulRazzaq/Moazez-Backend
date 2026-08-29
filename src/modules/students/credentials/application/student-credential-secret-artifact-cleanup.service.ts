import { Injectable } from '@nestjs/common';
import { FileVisibility, StudentCredentialBatchStatus } from '@prisma/client';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import {
  STUDENT_CREDENTIAL_SECRET_ARTIFACT_CLEANUP_PAGE_SIZE,
  STUDENT_CREDENTIAL_SECRET_ARTIFACT_MIME,
  STUDENT_CREDENTIAL_SECRET_ARTIFACT_VERSION,
} from '../domain/student-credential.constants';
import { studentCredentialSecretArtifactObjectKey } from '../domain/student-credential-secret-artifact-key';
import {
  StudentCredentialBatchRepository,
  type StudentCredentialSecretArtifactCleanupCandidate,
} from '../infrastructure/student-credential-batch.repository';

export interface StudentCredentialSecretArtifactCleanupSummary {
  scanned: number;
  cleaned: number;
  blockedInvariant: number;
  lostRace: number;
}

@Injectable()
export class StudentCredentialSecretArtifactCleanupService {
  constructor(
    private readonly repository: StudentCredentialBatchRepository,
    private readonly storage: StorageService,
  ) {}

  async reconcile(
    now = new Date(),
  ): Promise<StudentCredentialSecretArtifactCleanupSummary> {
    const summary: StudentCredentialSecretArtifactCleanupSummary = {
      scanned: 0,
      cleaned: 0,
      blockedInvariant: 0,
      lostRace: 0,
    };
    let cursor: { expiresAt: Date; id: string } | undefined;
    for (;;) {
      const candidates =
        await this.repository.listExpiredSecretArtifactCleanupCandidates({
          expiresAtOrBefore: now,
          limit: STUDENT_CREDENTIAL_SECRET_ARTIFACT_CLEANUP_PAGE_SIZE,
          cursor,
        });
      for (const candidate of candidates) {
        summary.scanned += 1;
        if (!this.isValidCandidate(candidate, now)) {
          summary.blockedInvariant += 1;
          continue;
        }
        const file = candidate.secretArtifactFile!;
        await this.storage.deleteObjectAndConfirmAbsent({
          bucket: file.bucket,
          objectKey: file.objectKey,
        });
        const committed =
          await this.repository.commitExpiredSecretArtifactCleanup({
            batchId: candidate.id,
            schoolId: candidate.schoolId,
            organizationId: candidate.organizationId,
            fileId: file.id,
            artifactVersion: candidate.secretArtifactVersion!,
            stagedAt: candidate.secretArtifactStagedAt!,
            expiresAt: candidate.secretArtifactExpiresAt!,
            cleanedAt: now,
          });
        if (committed) summary.cleaned += 1;
        else summary.lostRace += 1;
      }
      if (
        candidates.length < STUDENT_CREDENTIAL_SECRET_ARTIFACT_CLEANUP_PAGE_SIZE
      ) {
        return summary;
      }
      const last = candidates[candidates.length - 1];
      cursor = {
        expiresAt: last.secretArtifactExpiresAt!,
        id: last.id,
      };
    }
  }

  private isValidCandidate(
    candidate: StudentCredentialSecretArtifactCleanupCandidate,
    now: Date,
  ): boolean {
    const file = candidate.secretArtifactFile;
    return (
      isTerminal(candidate.status) &&
      candidate.secretArtifactFileId !== null &&
      candidate.secretArtifactVersion ===
        STUDENT_CREDENTIAL_SECRET_ARTIFACT_VERSION &&
      candidate.secretArtifactStagedAt !== null &&
      candidate.secretArtifactExpiresAt !== null &&
      candidate.secretArtifactExpiresAt.getTime() <= now.getTime() &&
      file !== null &&
      file.id === candidate.secretArtifactFileId &&
      file.schoolId === candidate.schoolId &&
      file.organizationId === candidate.organizationId &&
      file.uploaderId === candidate.createdById &&
      file.visibility === FileVisibility.PRIVATE &&
      file.bucket === this.storage.resolveBucket(FileVisibility.PRIVATE) &&
      file.objectKey ===
        studentCredentialSecretArtifactObjectKey({
          schoolId: candidate.schoolId,
          batchId: candidate.id,
        }) &&
      file.mimeType === STUDENT_CREDENTIAL_SECRET_ARTIFACT_MIME &&
      file.deletedAt === null
    );
  }
}

function isTerminal(status: StudentCredentialBatchStatus): boolean {
  return (
    status === StudentCredentialBatchStatus.COMPLETED ||
    status === StudentCredentialBatchStatus.PARTIAL_FAILED ||
    status === StudentCredentialBatchStatus.FAILED
  );
}
