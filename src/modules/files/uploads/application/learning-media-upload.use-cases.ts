import { randomUUID } from 'node:crypto';
import { Injectable, Optional } from '@nestjs/common';
import {
  FileUploadSession,
  FileUploadSessionStatus,
  FileVisibility,
  Prisma,
} from '@prisma/client';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import { requireFilesScope } from '../files-scope';
import {
  learningMediaMaximumSizeBytes,
  LEARNING_MEDIA_READY_RETENTION_MS,
  LEARNING_MEDIA_SESSION_TTL_MS,
  LEARNING_MEDIA_UPLOAD_URL_TTL_SECONDS,
  normalizeLearningMediaMimeType,
} from '../domain/learning-media.constants';
import {
  LearningMediaSizeExceededException,
  LearningMediaUnsupportedTypeException,
  LearningMediaUploadConflictException,
  LearningMediaUploadExpiredException,
  LearningMediaVerificationFailedException,
} from '../domain/learning-media.exceptions';
import { sanitizeOriginalName } from '../domain/original-name';
import {
  CreateLearningMediaUploadDto,
  LearningMediaUploadCancelResponseDto,
  LearningMediaUploadCompletionResponseDto,
  LearningMediaUploadIntentResponseDto,
} from '../dto/learning-media-upload.dto';
import { LearningMediaRepository } from '../infrastructure/learning-media.repository';
import { MediaRuntimeStartupGuard } from './media-runtime-startup.guard';
import { LearningMediaUnitOfWork } from './learning-media.unit-of-work';
import type { LearningMediaIntentResult } from './learning-media.unit-of-work';
import {
  MediaInfrastructureError,
  MediaVerificationError,
  MediaVerifierService,
} from './media-verifier.service';

@Injectable()
export class CreateLearningMediaUploadUseCase {
  constructor(
    private readonly unitOfWork: LearningMediaUnitOfWork,
    private readonly repository: LearningMediaRepository,
    private readonly storage: StorageService,
    @Optional() private readonly runtimeGuard?: MediaRuntimeStartupGuard,
  ) {}

  async execute(
    command: CreateLearningMediaUploadDto,
  ): Promise<LearningMediaUploadIntentResponseDto> {
    await this.runtimeGuard?.assertReady();
    const scope = requireFilesScope();
    const originalName = sanitizeOriginalName(command.originalName);
    const expectedMimeType = normalizeLearningMediaMimeType(
      command.expectedMimeType,
    );
    if (!expectedMimeType) throw new LearningMediaUnsupportedTypeException();
    const expectedSizeBytes = BigInt(command.expectedSizeBytes);
    const maximumBytes = learningMediaMaximumSizeBytes(expectedMimeType);
    if (expectedSizeBytes > maximumBytes) {
      throw new LearningMediaSizeExceededException(
        maximumBytes,
        expectedSizeBytes,
      );
    }
    const now = new Date();
    const id = randomUUID();
    const expiresAt = new Date(now.getTime() + LEARNING_MEDIA_SESSION_TTL_MS);
    const privateBucket = this.storage.resolveBucket(FileVisibility.PRIVATE);

    let result: LearningMediaIntentResult;
    try {
      result = await this.unitOfWork.execute((tx) =>
        tx.createOrFindIntent({
          id,
          actorId: scope.actorId,
          userType: scope.userType,
          organizationId: scope.organizationId,
          schoolId: scope.schoolId,
          clientRequestId: command.clientRequestId,
          originalName,
          expectedMimeType,
          expectedSizeBytes,
          stagingBucket: privateBucket,
          stagingObjectKey: `learning-media/${scope.schoolId}/staging/${id}`,
          finalBucket: privateBucket,
          finalObjectKey: `learning-media/${scope.schoolId}/final/${id}`,
          expiresAt,
          createdAt: now,
        }),
      );
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
      const session = await this.repository.findOwnedSessionByRequest({
        schoolId: scope.schoolId,
        actorId: scope.actorId,
        clientRequestId: command.clientRequestId,
      });
      if (!session) throw error;
      result = { session, created: false };
    }

    assertSameIntentPayload(result.session, {
      originalName,
      expectedMimeType,
      expectedSizeBytes,
    });
    if (result.session.status === FileUploadSessionStatus.EXPIRED) {
      throw new LearningMediaUploadExpiredException();
    }
    if (
      (result.session.status === FileUploadSessionStatus.CREATED ||
        result.session.status === FileUploadSessionStatus.UPLOADING) &&
      result.session.expiresAt <= now
    ) {
      throw new LearningMediaUploadExpiredException();
    }
    if (
      result.session.status !== FileUploadSessionStatus.CREATED &&
      result.session.status !== FileUploadSessionStatus.UPLOADING
    ) {
      return presentIntentState(result.session);
    }
    if (!result.session.stagingBucket || !result.session.stagingObjectKey) {
      throw new LearningMediaUploadConflictException(
        'staging_identity_unavailable',
        false,
      );
    }
    let capability: Awaited<ReturnType<StorageService['createUploadUrl']>>;
    try {
      capability = await this.storage.createUploadUrl({
        bucket: result.session.stagingBucket,
        objectKey: result.session.stagingObjectKey,
        expiresInSeconds: LEARNING_MEDIA_UPLOAD_URL_TTL_SECONDS,
      });
    } catch {
      if (result.session.status === FileUploadSessionStatus.CREATED) {
        await this.unitOfWork.execute((tx) =>
          tx.markSigningFailed({
            actorId: scope.actorId,
            userType: scope.userType,
            organizationId: scope.organizationId,
            schoolId: scope.schoolId,
            uploadId: result.session.id,
            now: new Date(),
          }),
        );
      }
      throw new LearningMediaUploadConflictException('signing_failed', true);
    }

    const uploadable = await this.unitOfWork.execute((tx) =>
      tx.persistUploadUrlCapability({
        schoolId: scope.schoolId,
        actorId: scope.actorId,
        uploadId: result.session.id,
        capabilityExpiresAt: capability.expiresAt,
        now: new Date(),
      }),
    );
    if (!uploadable) {
      throw new LearningMediaUploadConflictException(
        'session_not_uploading',
        true,
      );
    }
    if (uploadable.status === FileUploadSessionStatus.EXPIRED) {
      throw new LearningMediaUploadExpiredException();
    }
    if (uploadable.status !== FileUploadSessionStatus.UPLOADING) {
      return presentIntentState(uploadable);
    }
    return {
      id: uploadable.id,
      status: uploadable.status,
      expiresAt: uploadable.expiresAt.toISOString(),
      uploadUrl: capability.url,
      uploadUrlExpiresAt: capability.expiresAt.toISOString(),
      retryable: true,
    };
  }
}

@Injectable()
export class CompleteLearningMediaUploadUseCase {
  constructor(
    private readonly unitOfWork: LearningMediaUnitOfWork,
    private readonly verifier: MediaVerifierService,
    private readonly storage: StorageService,
    @Optional() private readonly runtimeGuard?: MediaRuntimeStartupGuard,
  ) {}

  async execute(
    uploadId: string,
  ): Promise<LearningMediaUploadCompletionResponseDto> {
    await this.runtimeGuard?.assertReady();
    const scope = requireFilesScope();
    const claim = await this.unitOfWork.execute((tx) =>
      tx.claimVerification({
        schoolId: scope.schoolId,
        actorId: scope.actorId,
        uploadId,
        now: new Date(),
      }),
    );
    if (claim.status === 'not_found') {
      throw new LearningMediaUploadConflictException(
        'session_unavailable',
        false,
      );
    }
    if (claim.status === 'expired')
      throw new LearningMediaUploadExpiredException();
    if (claim.status === 'conflict') {
      throw new LearningMediaUploadConflictException(
        claim.session.status === FileUploadSessionStatus.VERIFYING
          ? 'verification_in_progress'
          : 'session_not_completable',
        claim.session.status === FileUploadSessionStatus.VERIFYING,
      );
    }
    if (claim.status === 'ready') return presentCompletion(claim.session);
    if (!claim.session.stagingBucket || !claim.session.stagingObjectKey) {
      await this.releaseAfterInfrastructureFailure(
        claim.session,
        scope.schoolId,
      );
      throw new LearningMediaUploadConflictException(
        'staging_identity_unavailable',
        true,
      );
    }

    let facts: Awaited<ReturnType<MediaVerifierService['verifyAndStoreFinal']>>;
    try {
      facts = await this.verifier.verifyAndStoreFinal({
        stagingBucket: claim.session.stagingBucket,
        stagingObjectKey: claim.session.stagingObjectKey,
        finalBucket: claim.session.finalBucket,
        finalObjectKey: claim.session.finalObjectKey,
        expectedMimeType: claim.session.expectedMimeType,
        expectedSizeBytes: claim.session.expectedSizeBytes,
      });
    } catch (error) {
      if (error instanceof MediaVerificationError) {
        try {
          await this.unitOfWork.execute((tx) =>
            tx.markFailed({
              actorId: scope.actorId,
              userType: scope.userType,
              organizationId: scope.organizationId,
              schoolId: scope.schoolId,
              uploadId,
              reasonCode: error.reasonCode,
              now: new Date(),
            }),
          );
        } catch {
          await this.releaseAfterInfrastructureFailure(
            claim.session,
            scope.schoolId,
          );
          throw new LearningMediaUploadConflictException(
            'failure_persistence_failed',
            true,
          );
        }
        throw new LearningMediaVerificationFailedException(error.reasonCode);
      }
      await this.releaseAfterInfrastructureFailure(
        claim.session,
        scope.schoolId,
      );
      throw new LearningMediaUploadConflictException(
        error instanceof MediaInfrastructureError
          ? error.reasonCode
          : 'verification_infrastructure_failed',
        true,
      );
    }

    const completedAt = new Date();
    try {
      const ready = await this.unitOfWork.execute((tx) =>
        tx.finalize({
          actorId: scope.actorId,
          userType: scope.userType,
          organizationId: scope.organizationId,
          schoolId: scope.schoolId,
          uploadId,
          fileId: randomUUID(),
          visibility: FileVisibility.PRIVATE,
          completedAt,
          stagingCleanupEligibleAt:
            claim.session.latestUploadUrlExpiresAt ?? null,
          finalCleanupEligibleAt: new Date(
            completedAt.getTime() + LEARNING_MEDIA_READY_RETENTION_MS,
          ),
          ...facts,
        }),
      );
      return presentCompletion(ready);
    } catch {
      await this.releaseAfterInfrastructureFailure(
        claim.session,
        scope.schoolId,
      );
      throw new LearningMediaUploadConflictException(
        'finalization_failed',
        true,
      );
    }
  }

  private async releaseAfterInfrastructureFailure(
    session: FileUploadSession,
    schoolId: string,
  ): Promise<void> {
    try {
      await this.storage.deleteObjectAndConfirmAbsent({
        bucket: session.finalBucket,
        objectKey: session.finalObjectKey,
      });
      await this.unitOfWork.execute((tx) =>
        tx.releaseVerification({ schoolId, uploadId: session.id }),
      );
    } catch {
      await this.unitOfWork.execute((tx) =>
        tx.markFinalCleanupPending({
          schoolId,
          uploadId: session.id,
          now: new Date(),
        }),
      );
    }
  }
}

@Injectable()
export class VerifyLegacyLearningMediaUseCase {
  constructor(
    private readonly unitOfWork: LearningMediaUnitOfWork,
    private readonly verifier: MediaVerifierService,
    @Optional() private readonly runtimeGuard?: MediaRuntimeStartupGuard,
  ) {}

  async execute(
    uploadId: string,
  ): Promise<LearningMediaUploadCompletionResponseDto> {
    await this.runtimeGuard?.assertReady();
    const scope = requireFilesScope();
    const claim = await this.unitOfWork.execute((tx) =>
      tx.claimLegacyVerification({
        organizationId: scope.organizationId,
        schoolId: scope.schoolId,
        actorId: scope.actorId,
        uploadId,
      }),
    );
    if (claim.status !== 'claimed') {
      throw new LearningMediaUploadConflictException(
        'session_unavailable',
        false,
      );
    }
    try {
      const facts = await this.verifier.verifyExistingFinal({
        finalBucket: claim.session.finalBucket,
        finalObjectKey: claim.session.finalObjectKey,
        expectedMimeType: claim.session.expectedMimeType,
        expectedSizeBytes: claim.session.expectedSizeBytes,
      });
      const completedAt = new Date();
      const ready = await this.unitOfWork.execute((tx) =>
        tx.finalize({
          actorId: scope.actorId,
          userType: scope.userType,
          organizationId: scope.organizationId,
          schoolId: scope.schoolId,
          uploadId,
          fileId: claim.session.fileId!,
          visibility: FileVisibility.PRIVATE,
          completedAt,
          stagingCleanupEligibleAt: null,
          finalCleanupEligibleAt: new Date(
            completedAt.getTime() + LEARNING_MEDIA_READY_RETENTION_MS,
          ),
          ...facts,
        }),
      );
      return presentCompletion(ready);
    } catch (error) {
      if (error instanceof MediaVerificationError) {
        try {
          await this.unitOfWork.execute((tx) =>
            tx.markFailed({
              actorId: scope.actorId,
              userType: scope.userType,
              organizationId: scope.organizationId,
              schoolId: scope.schoolId,
              uploadId,
              reasonCode: error.reasonCode,
              now: new Date(),
            }),
          );
        } catch {
          await this.releaseLegacyVerification(scope.schoolId, uploadId);
          throw new LearningMediaUploadConflictException(
            'failure_persistence_failed',
            true,
          );
        }
        throw new LearningMediaVerificationFailedException(error.reasonCode);
      }
      await this.releaseLegacyVerification(scope.schoolId, uploadId);
      throw new LearningMediaUploadConflictException(
        'verification_infrastructure_failed',
        true,
      );
    }
  }

  private async releaseLegacyVerification(
    schoolId: string,
    uploadId: string,
  ): Promise<void> {
    try {
      await this.unitOfWork.execute((tx) =>
        tx.releaseVerification({ schoolId, uploadId }),
      );
    } catch {
      // Preserve the original safe retryable service contract. The locked row
      // remains visible for operational recovery if PostgreSQL is unavailable.
    }
  }
}

@Injectable()
export class CancelLearningMediaUploadUseCase {
  constructor(private readonly unitOfWork: LearningMediaUnitOfWork) {}

  async execute(
    uploadId: string,
  ): Promise<LearningMediaUploadCancelResponseDto> {
    const scope = requireFilesScope();
    const cancelled = await this.unitOfWork.execute((tx) =>
      tx.cancel({
        actorId: scope.actorId,
        userType: scope.userType,
        organizationId: scope.organizationId,
        schoolId: scope.schoolId,
        uploadId,
        now: new Date(),
      }),
    );
    if (!cancelled) {
      throw new LearningMediaUploadConflictException(
        'session_not_cancellable',
        false,
      );
    }
    return { id: cancelled.id, status: cancelled.status };
  }
}

function assertSameIntentPayload(
  session: FileUploadSession,
  payload: {
    originalName: string;
    expectedMimeType: string;
    expectedSizeBytes: bigint;
  },
): void {
  if (
    session.originalName !== payload.originalName ||
    session.expectedMimeType !== payload.expectedMimeType ||
    session.expectedSizeBytes !== payload.expectedSizeBytes
  ) {
    throw new LearningMediaUploadConflictException(
      'idempotency_payload_mismatch',
      false,
    );
  }
}

function presentIntentState(
  session: FileUploadSession,
): LearningMediaUploadIntentResponseDto {
  if (session.status === FileUploadSessionStatus.READY) {
    return {
      ...presentCompletion(session),
      expiresAt: session.expiresAt.toISOString(),
      retryable: false,
    };
  }
  return {
    id: session.id,
    status: session.status,
    expiresAt: session.expiresAt.toISOString(),
    retryable: session.status === FileUploadSessionStatus.VERIFYING,
    ...(session.status === FileUploadSessionStatus.FAILED &&
    session.failureReason
      ? { reasonCode: session.failureReason }
      : {}),
  };
}

function presentCompletion(
  session: FileUploadSession,
): LearningMediaUploadCompletionResponseDto {
  if (
    !session.fileId ||
    !session.verifiedMimeType ||
    session.actualSizeBytes === null
  ) {
    throw new LearningMediaUploadConflictException(
      'finalization_incomplete',
      false,
    );
  }
  return {
    id: session.id,
    fileId: session.fileId,
    status: session.status,
    mimeType: session.verifiedMimeType,
    sizeBytes: session.actualSizeBytes.toString(),
    durationSeconds: session.durationSeconds,
    width: session.width,
    height: session.height,
  };
}
