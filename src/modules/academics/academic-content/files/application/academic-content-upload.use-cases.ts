import { HttpStatus, Injectable } from '@nestjs/common';
import { FileUploadSessionStatus, FileVisibility } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  DomainException,
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../../common/exceptions/domain-exception';
import { StorageService } from '../../../../../infrastructure/storage/storage.service';
import { sanitizeOriginalName } from '../../../../files/uploads/domain/original-name';
import {
  ACADEMIC_CONTENT_PLATFORM_HARD_MAX_FILE_SIZE_BYTES,
  ACADEMIC_CONTENT_READY_RETENTION_MS,
  ACADEMIC_CONTENT_UPLOAD_SESSION_TTL_MS,
  ACADEMIC_CONTENT_VERIFICATION_VERSION,
} from '../domain/academic-content-file.constants';
import { academicContentFinalCleanupDeadline } from '../domain/academic-content-file.cleanup-deadline';
import { resolveAcademicContentFileType } from '../domain/academic-content-file.registry';
import { AcademicContentFileRepository } from '../infrastructure/academic-content-file.repository';
import {
  assertAcademicContentMutable,
  assertAcademicContentTermWritable,
} from '../../domain/academic-content-lifecycle.policy';
import type { AcademicUploadIdentity } from './academic-content-file.unit-of-work';
import type { AcademicContentTeacherWriteScope } from '../../infrastructure/academic-content-teacher-write.authorization';
import type { AcademicContentEffectiveFilePolicy } from '../domain/academic-content-file-policy';
import { academicContentFileScope } from './academic-content-file-scope';
import { AcademicContentFilePolicyResolver } from './academic-content-file-policy.resolver';
import {
  AcademicContentFileRejection,
  AcademicContentFileVerifier,
} from './academic-content-file-verifier';

function conflict(reason: string): DomainException {
  return new DomainException({
    code: `academic_content.file.${reason}`,
    message: reason,
    httpStatus: HttpStatus.CONFLICT,
  });
}

function identity(
  uploadId: string,
  contentId: string,
  trustedScope?: AcademicContentTeacherWriteScope,
): AcademicUploadIdentity {
  const scope = trustedScope ?? academicContentFileScope();
  return {
    uploadId,
    contentId,
    schoolId: scope.schoolId,
    actorId: scope.actorId,
  };
}

function parseSize(value: string | bigint): bigint {
  if (typeof value !== 'bigint' && !/^[1-9][0-9]*$/u.test(value))
    throw new ValidationDomainException('Invalid file size');
  const parsed = BigInt(value);
  if (
    parsed <= 0n ||
    parsed > ACADEMIC_CONTENT_PLATFORM_HARD_MAX_FILE_SIZE_BYTES
  )
    throw new ValidationDomainException('File size exceeds platform limits');
  return parsed;
}

export type CreateAcademicContentUploadCommand = {
  contentId: string;
  clientRequestId: string;
  originalName: string;
  expectedMimeType: string;
  expectedSizeBytes: string | bigint;
  trustedOrigin?: string;
};

@Injectable()
export class CreateAcademicContentUploadUseCase {
  constructor(
    private readonly repository: AcademicContentFileRepository,
    private readonly policy: AcademicContentFilePolicyResolver,
    private readonly storage: StorageService,
  ) {}

  async execute(command: CreateAcademicContentUploadCommand) {
    const scope = academicContentFileScope();
    return this.executeScoped(command, scope);
  }

  /** Internal entry point; Teacher App has already proven actor and manage. */
  executeForTeacher(
    command: CreateAcademicContentUploadCommand,
    scope: AcademicContentTeacherWriteScope,
  ) {
    return this.executeScoped(command, scope, scope);
  }

  private async executeScoped(
    command: CreateAcademicContentUploadCommand,
    scope: ReturnType<typeof academicContentFileScope>,
    teacherScope?: AcademicContentTeacherWriteScope,
  ) {
    if (!teacherScope) {
      const content = await this.repository.findContent(
        command.contentId,
        scope.schoolId,
      );
      if (!content)
        throw new NotFoundDomainException('Academic content not found');
      assertAcademicContentMutable(content.status);
      assertAcademicContentTermWritable(content.term, new Date());
    }
    const originalName = sanitizeOriginalName(command.originalName);
    const type = resolveAcademicContentFileType(
      originalName,
      command.expectedMimeType,
    );
    if (!type)
      throw new ValidationDomainException(
        'Unsupported file extension and MIME pair',
      );
    const expectedSizeBytes = parseSize(command.expectedSizeBytes);
    const validatePolicy = (
      effectivePolicy: AcademicContentEffectiveFilePolicy,
    ) => {
      if (
        !effectivePolicy.attachmentsEnabled ||
        !this.policy.categoryEnabled(effectivePolicy, type.category) ||
        expectedSizeBytes > effectivePolicy.maximumFileSizeBytes
      )
        throw new ValidationDomainException(
          'Academic content file policy does not allow this upload',
        );
    };
    if (!teacherScope)
      validatePolicy(await this.policy.resolve(scope.schoolId));
    if (!this.storage.getCapabilities().resumableUpload)
      throw conflict('storage_resumable_upload_unavailable');
    const uploadId = randomUUID();
    const now = new Date();
    const data = {
      id: uploadId,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      createdByUserId: scope.actorId,
      clientRequestId: command.clientRequestId,
      purposeContextId: command.contentId,
      originalName,
      expectedMimeType: type.mimeType,
      expectedSizeBytes,
      finalBucket: this.storage.resolveBucket(FileVisibility.PRIVATE),
      finalObjectKey: `academic-content/${scope.schoolId}/objects/${uploadId}`,
      expiresAt: new Date(
        now.getTime() + ACADEMIC_CONTENT_UPLOAD_SESSION_TTL_MS,
      ),
    };
    const intent = teacherScope
      ? await this.repository.createOrFindRequest(
          data,
          teacherScope,
          validatePolicy,
        )
      : await this.repository.createOrFindRequest(data);
    if (!intent.created) {
      const existing = intent.session;
      if (
        existing.purposeContextId !== command.contentId ||
        existing.originalName !== originalName ||
        existing.expectedMimeType !== type.mimeType ||
        existing.expectedSizeBytes !== expectedSizeBytes
      )
        throw conflict('idempotency_payload_mismatch');
      throw conflict('upload_capability_not_reissuable');
    }
    const session = intent.session;
    const owner = identity(session.id, command.contentId, teacherScope);
    let sessionUrl: string;
    let capabilityExpiresAt: Date;
    try {
      const capability = await this.storage.createResumableUploadSession({
        bucket: session.finalBucket,
        objectKey: session.finalObjectKey,
        contentType: type.mimeType,
        origin: command.trustedOrigin,
      });
      sessionUrl = capability.sessionUrl;
      capabilityExpiresAt = capability.expiresAt;
    } catch {
      await this.repository.markCapabilityFailed(owner, new Date());
      throw conflict('resumable_capability_failed');
    }
    let transitioned: boolean;
    if (teacherScope) {
      try {
        transitioned = await this.repository.persistCapabilityExpiry(
          owner,
          capabilityExpiresAt,
          teacherScope,
        );
      } catch (error) {
        // The external bearer capability may still be usable. Preserve its
        // deadline for the existing deferred cleanup lifecycle, never its URL.
        await this.repository.markCapabilityFailed(
          owner,
          new Date(),
          capabilityExpiresAt,
        );
        throw error;
      }
    } else {
      transitioned = await this.repository.persistCapabilityExpiry(
        owner,
        capabilityExpiresAt,
      );
    }
    if (!transitioned) throw conflict('upload_capability_not_reissuable');
    return {
      uploadId: session.id,
      status: FileUploadSessionStatus.UPLOADING,
      sessionUrl,
      capabilityExpiresAt,
      expiresAt: session.expiresAt,
      expectedMimeType: type.mimeType,
      expectedSizeBytes,
      uploadMode: 'resumable' as const,
    };
  }
}

@Injectable()
export class CompleteAcademicContentUploadUseCase {
  constructor(
    private readonly repository: AcademicContentFileRepository,
    private readonly verifier: AcademicContentFileVerifier,
  ) {}

  async execute(command: { contentId: string; uploadId: string }) {
    return this.executeScoped(command);
  }

  executeForTeacher(
    command: { contentId: string; uploadId: string },
    scope: AcademicContentTeacherWriteScope,
  ) {
    return this.executeScoped(command, scope);
  }

  private async executeScoped(
    command: { contentId: string; uploadId: string },
    teacherScope?: AcademicContentTeacherWriteScope,
  ) {
    const owner = identity(command.uploadId, command.contentId, teacherScope);
    const claimed = await this.repository.withTransaction(async (tx) => {
      const session = await tx.lockUpload(owner);
      if (!session)
        throw new NotFoundDomainException('Academic upload not found');
      if (teacherScope) {
        await tx.lockMutableContent(
          owner.contentId,
          owner.schoolId,
          new Date(),
          {
            teacherScope,
            ownershipOnly: session.status === FileUploadSessionStatus.READY,
          },
        );
      }
      if (session.status === FileUploadSessionStatus.READY) {
        const link = await tx.readyLink(session);
        if (!link) throw conflict('ready_relationship_invalid');
        return { kind: 'ready' as const, ...link };
      }
      if (session.status === FileUploadSessionStatus.VERIFYING)
        throw conflict('verification_in_progress');
      if (
        session.status !== FileUploadSessionStatus.UPLOADING &&
        session.status !== FileUploadSessionStatus.CREATED
      )
        throw conflict('upload_not_completable');
      if (session.expiresAt <= new Date()) {
        const now = new Date();
        await tx.updateUpload(session, {
          status: FileUploadSessionStatus.EXPIRED,
          finalCleanupEligibleAt: academicContentFinalCleanupDeadline(
            now,
            session,
          ),
        });
        return { kind: 'expired' as const };
      }
      if (session.status === FileUploadSessionStatus.CREATED)
        throw conflict('upload_not_completable');
      await tx.updateUpload(session, {
        status: FileUploadSessionStatus.VERIFYING,
      });
      return { kind: 'claimed' as const, session };
    });
    if (claimed.kind === 'ready')
      return { file: claimed.file, asset: claimed.asset };
    if (claimed.kind === 'expired') throw conflict('upload_expired');
    let verified: { mimeType: string; sizeBytes: bigint };
    try {
      verified = await this.verifier.verify(claimed.session);
    } catch (error) {
      if (error instanceof AcademicContentFileRejection) {
        const failedAt = new Date();
        const objectKnownPresent =
          error.reason !== 'object_missing' &&
          error.reason !== 'unsupported_file_type';
        await this.repository.markVerificationFailed({
          owner,
          failedAt,
          reason: error.reason,
          cleanupEligibleAt: objectKnownPresent
            ? failedAt
            : academicContentFinalCleanupDeadline(failedAt, claimed.session),
        });
        throw conflict(error.reason);
      }
      await this.repository.releaseVerification(owner);
      throw conflict('verification_retryable');
    }
    const fileId = randomUUID();
    const completedAt = new Date();
    const readyCleanupEligibleAt = new Date(
      completedAt.getTime() + ACADEMIC_CONTENT_READY_RETENTION_MS,
    );
    try {
      return await this.repository.withTransaction(async (tx) => {
        await tx.lockMutableContent(
          owner.contentId,
          owner.schoolId,
          new Date(),
          ...(teacherScope ? [{ teacherScope }] : []),
        );
        const session = await tx.lockUpload(owner);
        if (!session || session.status !== FileUploadSessionStatus.VERIFYING)
          throw conflict('verification_state_changed');
        const file = await tx.createFile({
          id: fileId,
          organizationId: session.organizationId,
          schoolId: session.schoolId,
          uploaderId: session.createdByUserId,
          bucket: session.finalBucket,
          objectKey: session.finalObjectKey,
          originalName: session.originalName,
          mimeType: verified.mimeType,
          sizeBytes: verified.sizeBytes,
          checksumSha256: null,
          visibility: FileVisibility.PRIVATE,
        });
        const asset = await tx.createAsset({
          schoolId: session.schoolId,
          academicContentId: owner.contentId,
          fileId: file.id,
          createdByUserId: session.createdByUserId,
        });
        await tx.updateUpload(session, {
          status: FileUploadSessionStatus.READY,
          fileId: file.id,
          completedAt,
          verifiedMimeType: verified.mimeType,
          actualSizeBytes: verified.sizeBytes,
          checksumSha256: null,
          durationSeconds: null,
          width: null,
          height: null,
          verifiedAt: completedAt,
          verificationVersion: ACADEMIC_CONTENT_VERIFICATION_VERSION,
          finalCleanupEligibleAt: readyCleanupEligibleAt,
          finalCleanupClaimedAt: null,
          finalObjectDeletedAt: null,
        });
        await tx.recordCompletedAudit({
          actorId: session.createdByUserId,
          organizationId: session.organizationId,
          schoolId: session.schoolId,
          assetId: asset.id,
          uploadId: session.id,
          contentId: owner.contentId,
          fileId: file.id,
        });
        return { file, asset };
      });
    } catch (error) {
      if (
        error instanceof DomainException &&
        (error.code === 'academic_content.status.read_only' ||
          error.code === 'academic_content.term.closed' ||
          (teacherScope && error instanceof NotFoundDomainException))
      ) {
        const failedAt = new Date();
        await this.repository.markVerificationFailed({
          owner,
          failedAt,
          reason: 'content_not_mutable',
          cleanupEligibleAt: academicContentFinalCleanupDeadline(
            failedAt,
            claimed.session,
          ),
        });
      } else if (teacherScope) {
        // A rolled-back final transaction has no File/Asset relationship.
        // Release this exact claim so retry need not await stale recovery.
        await this.repository.releaseVerification(owner);
      }
      throw error;
    }
  }
}

@Injectable()
export class CancelAcademicContentUploadUseCase {
  constructor(private readonly repository: AcademicContentFileRepository) {}
  async execute(command: { contentId: string; uploadId: string }) {
    return this.executeScoped(command);
  }
  executeForTeacher(
    command: { contentId: string; uploadId: string },
    scope: AcademicContentTeacherWriteScope,
  ) {
    return this.executeScoped(command, scope);
  }
  private async executeScoped(
    command: { contentId: string; uploadId: string },
    teacherScope?: AcademicContentTeacherWriteScope,
  ) {
    const owner = identity(command.uploadId, command.contentId, teacherScope);
    return this.repository.withTransaction(async (tx) => {
      const session = await tx.lockUpload(owner);
      if (!session)
        throw new NotFoundDomainException('Academic upload not found');
      if (teacherScope) {
        await tx.lockMutableContent(
          owner.contentId,
          owner.schoolId,
          new Date(),
          {
            teacherScope,
            ownershipOnly: true,
          },
        );
      }
      if (
        session.status !== FileUploadSessionStatus.CREATED &&
        session.status !== FileUploadSessionStatus.UPLOADING
      )
        throw conflict('upload_not_cancellable');
      const now = new Date();
      return tx.updateUpload(session, {
        status: FileUploadSessionStatus.CANCELLED,
        cancelledAt: now,
        finalCleanupEligibleAt: academicContentFinalCleanupDeadline(
          now,
          session,
        ),
      });
    });
  }
}

@Injectable()
export class UnlinkAcademicContentAssetUseCase {
  constructor(private readonly repository: AcademicContentFileRepository) {}
  async execute(command: { contentId: string; assetId: string }) {
    const scope = academicContentFileScope();
    return this.executeScoped(command, scope);
  }
  executeForTeacher(
    command: { contentId: string; assetId: string },
    scope: AcademicContentTeacherWriteScope,
  ) {
    return this.executeScoped(command, scope, scope);
  }
  private async executeScoped(
    command: { contentId: string; assetId: string },
    scope: ReturnType<typeof academicContentFileScope>,
    teacherScope?: AcademicContentTeacherWriteScope,
  ) {
    return this.repository.withTransaction(async (tx) => {
      await tx.lockMutableContent(
        command.contentId,
        scope.schoolId,
        new Date(),
        ...(teacherScope ? [{ teacherScope }] : []),
      );
      const candidate = await tx.findActiveAsset({
        assetId: command.assetId,
        schoolId: scope.schoolId,
        contentId: command.contentId,
      });
      if (!candidate)
        throw new NotFoundDomainException('Academic asset not found');
      const uploadId = await tx.findUploadIdForFile(
        candidate.fileId,
        scope.schoolId,
      );
      if (uploadId) await tx.lockUploadById(uploadId);
      if (!(await tx.lockActiveFile(candidate.fileId, scope.schoolId)))
        throw new NotFoundDomainException('Academic file not found');
      if (
        !(await tx.lockActiveAsset({
          assetId: command.assetId,
          schoolId: scope.schoolId,
          contentId: command.contentId,
        }))
      )
        throw new NotFoundDomainException('Academic asset not found');
      const asset = await tx.softDeleteAsset(
        command.assetId,
        scope.schoolId,
        new Date(),
      );
      const remaining = await tx.countAcademicContentFileReferences(
        asset.fileId,
        scope.schoolId,
      );
      if (remaining === 0) {
        const eligibleAt = new Date(
          Date.now() + ACADEMIC_CONTENT_READY_RETENTION_MS,
        );
        await tx.extendReadyCleanup(asset.fileId, scope.schoolId, eligibleAt);
      }
      return asset;
    });
  }
}
