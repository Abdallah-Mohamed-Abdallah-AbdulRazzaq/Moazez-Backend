import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { FileVisibility, type FileUploadSession } from '@prisma/client';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import { resolveSecureUploadOrigin } from '../../../../infrastructure/storage/upload-origin.policy';
import { DomainException } from '../../../../common/exceptions/domain-exception';
import { sanitizeOriginalName } from '../../uploads/domain/original-name';
import { resolveFileContentType } from '../../shared/domain/file-content.registry';
import {
  assessmentMediaOwner,
  assertAssessmentUuid,
  AssessmentMediaException,
  ASSESSMENT_UPLOAD_TTL_MS,
  ASSESSMENT_SIGNED_CAPABILITY_TTL_SECONDS,
  type AssessmentMediaPurpose,
  type AssessmentMediaUploadDto,
  type CreateAssessmentMediaCommand,
} from '../domain/assessment-media.contract';
import { ASSESSMENT_MEDIA_MIMES } from '../domain/assessment-media.policy';
import { AssessmentMediaRepository } from '../infrastructure/assessment-media.repository';
import { AssessmentMediaRuntimePolicy } from './assessment-media-runtime.policy';
import { AssessmentMediaVerifier } from './assessment-media-verifier';

function present(session: FileUploadSession): AssessmentMediaUploadDto {
  return {
    uploadId: session.id,
    status: session.status,
    fileId: session.status === 'READY' ? session.fileId : null,
    expiresAt: session.expiresAt.toISOString(),
  };
}

/** Internal foundation. Public asset/link/read contracts belong to later stages. */
@Injectable()
export class AssessmentMediaService {
  private readonly logger = new Logger(AssessmentMediaService.name);
  constructor(
    private readonly repository: AssessmentMediaRepository,
    private readonly storage: StorageService,
    private readonly verifier: AssessmentMediaVerifier,
    private readonly runtime: AssessmentMediaRuntimePolicy,
    private readonly config: ConfigService,
  ) {}

  createHomeworkAssignmentUpload(
    homeworkId: string,
    command: CreateAssessmentMediaCommand,
  ) {
    return this.create('HOMEWORK_ASSIGNMENT_MEDIA', homeworkId, command);
  }
  createGradeAssessmentUpload(
    assessmentId: string,
    command: CreateAssessmentMediaCommand,
  ) {
    return this.create('GRADE_ASSESSMENT_MEDIA', assessmentId, command);
  }
  createHomeworkSubmissionUpload(
    targetId: string,
    command: CreateAssessmentMediaCommand,
  ) {
    return this.create('HOMEWORK_SUBMISSION_MEDIA', targetId, command);
  }
  createGradeSubmissionUpload(
    submissionId: string,
    command: CreateAssessmentMediaCommand,
  ) {
    return this.create('GRADE_SUBMISSION_MEDIA', submissionId, command);
  }

  private async create(
    purpose: AssessmentMediaPurpose,
    contextId: string,
    command: CreateAssessmentMediaCommand,
  ): Promise<AssessmentMediaUploadDto> {
    this.runtime.assertUploadExecutionEnabled();
    const owner = assessmentMediaOwner(purpose, contextId);
    if (!command || typeof command !== 'object')
      throw new AssessmentMediaException('invalid_request');
    assertAssessmentUuid(command.clientRequestId);
    if (
      typeof command.originalName !== 'string' ||
      typeof command.expectedMimeType !== 'string' ||
      typeof command.expectedSizeBytes !== 'string' ||
      command.originalName.length > 1024 ||
      command.expectedMimeType.length > 128 ||
      !/^[1-9][0-9]{0,11}$/u.test(command.expectedSizeBytes) ||
      /[\p{Cf}\p{Cs}]/u.test(command.originalName)
    )
      throw new AssessmentMediaException('invalid_request');
    const originalName = sanitizeOriginalName(command.originalName);
    const type = resolveFileContentType(originalName, command.expectedMimeType);
    if (!type || !ASSESSMENT_MEDIA_MIMES.includes(type.mimeType))
      throw new AssessmentMediaException('invalid_request');
    const origin = resolveSecureUploadOrigin(
      command.trustedOrigin,
      this.config,
    );
    const id = randomUUID();
    const bucket = this.storage.resolveBucket(FileVisibility.PRIVATE);
    const reserved = await this.repository.reserve(owner, {
      id,
      clientRequestId: command.clientRequestId,
      originalName,
      expectedMimeType: type.mimeType,
      expectedSizeBytes: BigInt(command.expectedSizeBytes),
      stagingBucket: bucket,
      stagingObjectKey: `assessment-media/${owner.schoolId}/staging/${id}`,
      finalBucket: bucket,
      finalObjectKey: `assessment-media/${owner.schoolId}/verified/${id}`,
      expiresAt: new Date(Date.now() + ASSESSMENT_UPLOAD_TTL_MS),
    });
    if (!reserved.created) return present(reserved.session);
    const session = reserved.session;
    try {
      const capability = await this.storage.createBoundedUploadCapability({
        bucket,
        objectKey: session.stagingObjectKey!,
        contentType: type.mimeType,
        expectedSizeBytes: Number(session.expectedSizeBytes),
        origin,
        expiresInSeconds: ASSESSMENT_SIGNED_CAPABILITY_TTL_SECONDS,
      });
      const url = capability.url;
      if (typeof url !== 'string' || !url.length)
        throw new AssessmentMediaException('capability_failed');
      const uploading = await this.repository.publishCapability(
        owner,
        session.id,
        capability.expiresAt,
      );
      return {
        ...present(uploading),
        uploadCapability: {
          mode: capability.mode,
          url,
          expiresAt: capability.expiresAt.toISOString(),
          ...(capability.formFields
            ? { formFields: capability.formFields }
            : {}),
        },
      };
    } catch (error) {
      this.logger.warn({
        event: 'assessment_media.capability.failed',
        schoolId: owner.schoolId,
        actorId: owner.actorId,
        reason: 'capability_failed',
      });
      await this.repository
        .fail(owner, session.id, 'capability_failed')
        .catch(() => undefined);
      if (error instanceof DomainException) throw error;
      throw new AssessmentMediaException('capability_failed');
    }
  }

  async complete(
    purpose: AssessmentMediaPurpose,
    contextId: string,
    uploadId: string,
  ): Promise<AssessmentMediaUploadDto> {
    this.runtime.assertUploadExecutionEnabled();
    const owner = assessmentMediaOwner(purpose, contextId);
    assertAssessmentUuid(uploadId);
    const claim = await this.repository.claim(owner, uploadId);
    if (claim.kind === 'expired') throw new AssessmentMediaException('expired');
    if (claim.kind === 'ready') return present(claim.session);
    try {
      const verified = await this.verifier.verify(claim.session, claim.policy);
      return present(
        await this.repository.finish(owner, uploadId, claim.claimId, verified),
      );
    } catch (error) {
      const reason =
        error instanceof AssessmentMediaException
          ? error.reason
          : 'verification_failed';
      this.logger.warn({
        event: 'assessment_media.verification.failed',
        schoolId: owner.schoolId,
        actorId: owner.actorId,
        reason,
      });
      try {
        await claim.compensate(reason);
      } catch {
        this.logger.error({
          event: 'assessment_media.verification.compensation_failed',
          schoolId: owner.schoolId,
          actorId: owner.actorId,
          uploadId,
          reason,
        });
      }
      if (error instanceof DomainException) throw error;
      throw new AssessmentMediaException('verification_failed');
    }
  }

  async status(
    purpose: AssessmentMediaPurpose,
    contextId: string,
    uploadId: string,
  ): Promise<AssessmentMediaUploadDto> {
    const owner = assessmentMediaOwner(purpose, contextId);
    assertAssessmentUuid(uploadId);
    return present(await this.repository.find(owner, uploadId));
  }

  async cancel(
    purpose: AssessmentMediaPurpose,
    contextId: string,
    uploadId: string,
  ): Promise<AssessmentMediaUploadDto> {
    const owner = assessmentMediaOwner(purpose, contextId);
    assertAssessmentUuid(uploadId);
    return present(await this.repository.cancel(owner, uploadId));
  }

  cleanupEligibility(
    purpose: AssessmentMediaPurpose,
    contextId: string,
    uploadId: string,
  ) {
    const owner = assessmentMediaOwner(purpose, contextId);
    assertAssessmentUuid(uploadId);
    return this.repository.cleanupEligibility(owner, uploadId);
  }
}
