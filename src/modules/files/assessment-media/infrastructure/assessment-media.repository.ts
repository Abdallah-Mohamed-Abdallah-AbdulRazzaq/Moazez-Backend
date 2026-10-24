import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AuditOutcome,
  FileUploadSessionStatus,
  FileVisibility,
  Prisma,
  PrismaClient,
  type FileUploadSession,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { getRequestContext } from '../../../../common/context/request-context';
import { TeacherAllocationOperationalWriteGate } from '../../../academics/teacher-allocation/application/teacher-allocation-operational-write-gate';
import { assertHomeworkMediaAuthorization } from '../../../homework/infrastructure/homework-media-authorization';
import { assertGradesMediaAuthorization } from '../../../grades/assessments/infrastructure/grades-media-authorization';
import { hasRetainedFileReferences } from '../../shared/infrastructure/file-lifetime.repository';
import {
  assessmentMediaOwner,
  ASSESSMENT_MEDIA_VERSION,
  AssessmentMediaException,
  assertAssessmentTransition,
  type AssessmentMediaOwner,
  type AssessmentMediaReason,
} from '../domain/assessment-media.contract';
import {
  assertAssessmentUploadPolicy,
  effectiveAssessmentMediaPolicy,
  type EffectiveAssessmentMediaPolicy,
} from '../domain/assessment-media.policy';
import type { AssessmentVerifiedObject } from '../application/assessment-media-verifier';

type ReservedUpload = {
  id: string;
  clientRequestId: string;
  originalName: string;
  expectedMimeType: string;
  expectedSizeBytes: bigint;
  stagingBucket: string;
  stagingObjectKey: string;
  finalBucket: string;
  finalObjectKey: string;
  expiresAt: Date;
};
type ClaimResult =
  | { kind: 'expired' }
  | { kind: 'ready'; session: FileUploadSession }
  | {
      kind: 'claimed';
      session: FileUploadSession;
      claimId: string;
      policy: EffectiveAssessmentMediaPolicy;
    };

@Injectable()
export class AssessmentMediaRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gate: TeacherAllocationOperationalWriteGate,
  ) {}

  private transaction<T>(
    owner: AssessmentMediaOwner,
    operation: (
      tx: Prisma.TransactionClient,
      policy: EffectiveAssessmentMediaPolicy,
    ) => Promise<T>,
    ownershipOnly = false,
  ): Promise<T> {
    const scoped = this.prisma.scoped as unknown as PrismaClient;
    return scoped.$transaction(
      async (tx) => {
        await this.authorize(tx, owner, ownershipOnly);
        await tx.$queryRaw`SELECT id FROM school_assessment_media_policies
        WHERE school_id = ${owner.schoolId}::uuid FOR SHARE`;
        const row = await tx.schoolAssessmentMediaPolicy.findFirst({
          where: { schoolId: owner.schoolId },
        });
        return operation(tx, effectiveAssessmentMediaPolicy(row));
      },
      { maxWait: 5000, timeout: 15_000 },
    );
  }

  private async authorize(
    tx: Prisma.TransactionClient,
    owner: AssessmentMediaOwner,
    ownershipOnly: boolean,
  ): Promise<void> {
    const ctx = getRequestContext();
    const resolved = assessmentMediaOwner(owner.purpose, owner.contextId);
    if (
      owner.permission !== resolved.permission ||
      owner.studentPurpose !== resolved.studentPurpose ||
      owner.roleId !== resolved.roleId
    )
      throw new AssessmentMediaException('upload_not_found');
    if (
      ctx?.actor?.id.toLowerCase() !== owner.actorId ||
      ctx.actor.userType !== owner.userType ||
      ctx.activeMembership?.membershipId.toLowerCase() !== owner.membershipId ||
      ctx.activeMembership.schoolId?.toLowerCase() !== owner.schoolId ||
      ctx.activeMembership.organizationId.toLowerCase() !==
        owner.organizationId ||
      ctx.bypass.bypassSchoolScope ||
      ctx.bypass.includeSoftDeleted
    )
      throw new AssessmentMediaException('upload_not_found');
    // NO KEY UPDATE serializes assessment reservations without blocking unrelated
    // FK KEY SHARE readers. All storage work stays outside this short mutex.
    const schools = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT s.id FROM schools s JOIN organizations o ON o.id = s.organization_id
      WHERE s.id = ${owner.schoolId}::uuid AND o.id = ${owner.organizationId}::uuid
        AND s.deleted_at IS NULL AND o.deleted_at IS NULL
        AND s.status = 'ACTIVE' AND o.status = 'ACTIVE'
      FOR NO KEY UPDATE OF s FOR SHARE OF o`;
    if (!schools.length) throw new AssessmentMediaException('upload_not_found');
    const membership = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT m.id FROM memberships m
      JOIN users u ON u.id = m.user_id
      JOIN roles r ON r.id = m.role_id
      JOIN role_permissions rp ON rp.role_id = r.id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE m.id = ${owner.membershipId}::uuid AND m.user_id = ${owner.actorId}::uuid
        AND m.organization_id = ${owner.organizationId}::uuid AND m.role_id = ${owner.roleId}::uuid
        AND (m.school_id = ${owner.schoolId}::uuid OR (m.school_id IS NULL AND m.user_type = 'ORGANIZATION_USER'))
        AND m.user_type::text = ${owner.userType} AND u.user_type::text = ${owner.userType}
        AND m.status = 'ACTIVE' AND m.ended_at IS NULL AND m.deleted_at IS NULL
        AND u.deleted_at IS NULL AND u.status = 'ACTIVE' AND r.deleted_at IS NULL AND p.code = ${owner.permission}
        AND (r.school_id IS NULL OR r.school_id = ${owner.schoolId}::uuid)
      FOR SHARE OF m, u, r, rp, p`;
    if (!membership.length)
      throw new AssessmentMediaException('upload_not_found');
    if (
      owner.purpose === 'HOMEWORK_ASSIGNMENT_MEDIA' ||
      owner.purpose === 'HOMEWORK_SUBMISSION_MEDIA'
    )
      await assertHomeworkMediaAuthorization(
        tx,
        owner.contextId,
        owner.studentPurpose,
        this.gate,
        ownershipOnly,
      );
    else
      await assertGradesMediaAuthorization(
        tx,
        owner.contextId,
        owner.studentPurpose,
        this.gate,
        ownershipOnly,
      );
  }

  private async lock(
    tx: Prisma.TransactionClient,
    owner: AssessmentMediaOwner,
    uploadId: string,
  ): Promise<FileUploadSession> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM file_upload_sessions WHERE id = ${uploadId}::uuid
        AND school_id = ${owner.schoolId}::uuid AND organization_id = ${owner.organizationId}::uuid
        AND created_by_user_id = ${owner.actorId}::uuid AND purpose::text = ${owner.purpose}
        AND purpose_context_id = ${owner.contextId}::uuid FOR UPDATE`;
    const session = rows.length
      ? await tx.fileUploadSession.findFirst({ where: { id: uploadId } })
      : null;
    if (!session) throw new AssessmentMediaException('upload_not_found');
    return session;
  }

  async reserve(
    owner: AssessmentMediaOwner,
    data: ReservedUpload,
  ): Promise<{ created: boolean; session: FileUploadSession }> {
    return this.transaction(owner, async (tx, policy) => {
      const existing = await tx.fileUploadSession.findFirst({
        where: {
          createdByUserId: owner.actorId,
          purpose: owner.purpose,
          clientRequestId: data.clientRequestId,
        },
      });
      if (existing) {
        if (
          existing.purposeContextId !== owner.contextId ||
          existing.originalName !== data.originalName ||
          existing.expectedMimeType !== data.expectedMimeType ||
          existing.expectedSizeBytes !== data.expectedSizeBytes
        )
          throw new AssessmentMediaException('idempotency_conflict');
        if (existing.status === 'READY')
          await this.assertReadyRelationship(tx, existing);
        return { created: false, session: existing };
      }
      assertAssessmentUploadPolicy(
        policy,
        owner,
        data.expectedMimeType,
        data.expectedSizeBytes,
      );
      const now = new Date();
      // Aggregate in PostgreSQL: retained history must not require unbounded
      // application buffering. The school mutex makes reservation checks atomic.
      const [usage] = await tx.$queryRaw<
        Array<{
          resourceCount: bigint;
          resourceBytes: bigint;
          physicalBytes: bigint;
          concurrentCount: bigint;
          hourlyCount: bigint;
        }>
      >`
        WITH reserved AS (
          SELECT *, (latest_upload_url_expires_at > ${now}
            OR (status IN ('CREATED', 'UPLOADING', 'VERIFYING') AND expires_at > ${now})) AS active
          FROM file_upload_sessions
          WHERE school_id = ${owner.schoolId}::uuid AND organization_id = ${owner.organizationId}::uuid
            AND purpose IN ('HOMEWORK_ASSIGNMENT_MEDIA', 'GRADE_ASSESSMENT_MEDIA', 'HOMEWORK_SUBMISSION_MEDIA', 'GRADE_SUBMISSION_MEDIA')
        )
        SELECT
          count(*) FILTER (WHERE purpose::text = ${owner.purpose} AND purpose_context_id = ${owner.contextId}::uuid
            AND (status = 'READY' OR active)) AS "resourceCount",
          COALESCE(sum(expected_size_bytes) FILTER (WHERE purpose::text = ${owner.purpose}
            AND purpose_context_id = ${owner.contextId}::uuid
            AND (staging_object_deleted_at IS NULL OR final_object_deleted_at IS NULL)), 0)::bigint AS "resourceBytes",
          COALESCE(sum((CASE WHEN staging_object_deleted_at IS NULL THEN expected_size_bytes ELSE 0 END)
            + (CASE WHEN final_object_deleted_at IS NULL THEN expected_size_bytes ELSE 0 END)), 0)::bigint AS "physicalBytes",
          count(*) FILTER (WHERE created_by_user_id = ${owner.actorId}::uuid AND active) AS "concurrentCount",
          count(*) FILTER (WHERE created_by_user_id = ${owner.actorId}::uuid
            AND created_at > ${new Date(now.getTime() - 3_600_000)}) AS "hourlyCount"
        FROM reserved`;
      if (
        usage.resourceCount >= BigInt(policy.maximumFilesPerResource) ||
        usage.resourceBytes + data.expectedSizeBytes >
          policy.maximumResourceBytes ||
        usage.physicalBytes + 2n * data.expectedSizeBytes >
          policy.maximumSchoolBytes ||
        usage.concurrentCount >= BigInt(policy.maximumConcurrentUploads)
      )
        throw new AssessmentMediaException('quota_exceeded');
      if (usage.hourlyCount >= BigInt(policy.maximumUploadsPerHour))
        throw new AssessmentMediaException('rate_exceeded');
      const session = await tx.fileUploadSession.create({
        data: {
          ...data,
          schoolId: owner.schoolId,
          organizationId: owner.organizationId,
          createdByUserId: owner.actorId,
          purpose: owner.purpose,
          purposeContextId: owner.contextId,
        },
      });
      await this.audit(tx, owner, session, 'created');
      return { created: true, session };
    });
  }

  async publishCapability(
    owner: AssessmentMediaOwner,
    uploadId: string,
    expiresAt: Date,
  ): Promise<FileUploadSession> {
    return this.transaction(owner, async (tx, policy) => {
      const session = await this.lock(tx, owner, uploadId);
      assertAssessmentUploadPolicy(
        policy,
        owner,
        session.expectedMimeType,
        session.expectedSizeBytes,
      );
      assertAssessmentTransition(
        session.status,
        FileUploadSessionStatus.UPLOADING,
      );
      const now = new Date();
      if (
        session.expiresAt <= now ||
        !Number.isFinite(expiresAt.getTime()) ||
        expiresAt <= now ||
        expiresAt.getTime() > now.getTime() + 7 * 24 * 3_600_000
      )
        throw new AssessmentMediaException('expired');
      return tx.fileUploadSession.update({
        where: { id: uploadId },
        data: { status: 'UPLOADING', latestUploadUrlExpiresAt: expiresAt },
      });
    });
  }

  async claim(
    owner: AssessmentMediaOwner,
    uploadId: string,
  ): Promise<ClaimResult> {
    return this.transaction(owner, async (tx, policy): Promise<ClaimResult> => {
      const session = await this.lock(tx, owner, uploadId);
      assertAssessmentUploadPolicy(
        policy,
        owner,
        session.expectedMimeType,
        session.expectedSizeBytes,
      );
      if (session.status === 'READY') {
        await this.assertReadyRelationship(tx, session);
        return { kind: 'ready', session };
      }
      if (session.expiresAt <= new Date()) {
        if (['CREATED', 'UPLOADING', 'VERIFYING'].includes(session.status))
          await tx.fileUploadSession.update({
            where: { id: uploadId },
            data: { status: 'EXPIRED', assessmentVerificationClaimId: null },
          });
        return { kind: 'expired' };
      }
      if (session.status === 'VERIFYING')
        throw new AssessmentMediaException('verification_in_progress');
      assertAssessmentTransition(
        session.status,
        FileUploadSessionStatus.VERIFYING,
      );
      if (session.status !== 'UPLOADING')
        throw new AssessmentMediaException('state_conflict');
      const claimId = randomUUID();
      const claimed = await tx.fileUploadSession.update({
        where: { id: uploadId },
        data: { status: 'VERIFYING', assessmentVerificationClaimId: claimId },
      });
      return { kind: 'claimed', session: claimed, claimId, policy };
    });
  }

  async finish(
    owner: AssessmentMediaOwner,
    uploadId: string,
    claimId: string,
    verified: AssessmentVerifiedObject,
  ): Promise<FileUploadSession> {
    return this.transaction(owner, async (tx, policy) => {
      const session = await this.lock(tx, owner, uploadId);
      assertAssessmentUploadPolicy(
        policy,
        owner,
        session.expectedMimeType,
        session.expectedSizeBytes,
      );
      if (
        session.status !== 'VERIFYING' ||
        session.assessmentVerificationClaimId !== claimId
      )
        throw new AssessmentMediaException('state_conflict');
      if (session.expiresAt <= new Date())
        throw new AssessmentMediaException('expired');
      const facts = verified.facts;
      if (
        facts.actualSizeBytes !== session.expectedSizeBytes ||
        facts.verifiedMimeType !== session.expectedMimeType ||
        verified.securityEvidence.verdict !== 'CLEAN' ||
        verified.securityEvidence.checksumSha256 !== facts.checksumSha256 ||
        (facts.durationSeconds !== null &&
          facts.durationSeconds > policy.maximumDurationSeconds) ||
        (facts.width !== null && facts.width > policy.maximumWidth) ||
        (facts.height !== null && facts.height > policy.maximumHeight)
      )
        throw new AssessmentMediaException('verification_failed');
      const file = await tx.file.create({
        data: {
          organizationId: owner.organizationId,
          schoolId: owner.schoolId,
          uploaderId: owner.actorId,
          bucket: session.finalBucket,
          objectKey: session.finalObjectKey,
          originalName: session.originalName,
          mimeType: facts.verifiedMimeType,
          sizeBytes: facts.actualSizeBytes,
          checksumSha256: facts.checksumSha256,
          visibility: FileVisibility.PRIVATE,
        },
        select: { id: true },
      });
      const ready = await tx.fileUploadSession.update({
        where: { id: uploadId },
        data: {
          status: 'READY',
          fileId: file.id,
          completedAt: new Date(),
          verifiedMimeType: facts.verifiedMimeType,
          actualSizeBytes: facts.actualSizeBytes,
          checksumSha256: facts.checksumSha256,
          durationSeconds: facts.durationSeconds,
          width: facts.width,
          height: facts.height,
          verifiedAt: facts.verifiedAt,
          verificationVersion: ASSESSMENT_MEDIA_VERSION,
          assessmentVerificationClaimId: null,
          assessmentSecurityEvidence: verified.securityEvidence,
        },
      });
      await this.audit(tx, owner, ready, 'ready');
      return ready;
    });
  }

  async fail(
    owner: AssessmentMediaOwner,
    uploadId: string,
    reason: AssessmentMediaReason,
    claimId?: string,
  ): Promise<void> {
    await this.transaction(
      owner,
      async (tx) => {
        const session = await this.lock(tx, owner, uploadId);
        if (
          !['CREATED', 'UPLOADING', 'VERIFYING'].includes(session.status) ||
          (claimId && session.assessmentVerificationClaimId !== claimId)
        )
          return;
        const expired = reason === 'expired' && session.expiresAt <= new Date();
        await tx.fileUploadSession.update({
          where: { id: uploadId },
          data: {
            status: expired ? 'EXPIRED' : 'FAILED',
            failedAt: expired ? null : new Date(),
            failureReason: expired ? null : reason,
            assessmentVerificationClaimId: null,
          },
        });
        await this.audit(
          tx,
          owner,
          session,
          expired ? 'expired' : 'failed',
          reason,
        );
      },
      true,
    );
  }

  async cancel(
    owner: AssessmentMediaOwner,
    uploadId: string,
  ): Promise<FileUploadSession> {
    return this.transaction(
      owner,
      async (tx) => {
        const session = await this.lock(tx, owner, uploadId);
        if (session.status === 'CANCELLED') return session;
        assertAssessmentTransition(
          session.status,
          FileUploadSessionStatus.CANCELLED,
        );
        const cancelled = await tx.fileUploadSession.update({
          where: { id: uploadId },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            assessmentVerificationClaimId: null,
          },
        });
        await this.audit(tx, owner, cancelled, 'cancelled');
        return cancelled;
      },
      true,
    );
  }

  async find(
    owner: AssessmentMediaOwner,
    uploadId: string,
    now = new Date(),
  ): Promise<FileUploadSession> {
    return this.transaction(
      owner,
      async (tx) => {
        let session = await this.lock(tx, owner, uploadId);
        if (
          ['CREATED', 'UPLOADING', 'VERIFYING'].includes(session.status) &&
          session.expiresAt <= now
        ) {
          session = await tx.fileUploadSession.update({
            where: { id: uploadId },
            data: { status: 'EXPIRED', assessmentVerificationClaimId: null },
          });
          await this.audit(tx, owner, session, 'expired');
        }
        if (session.status === 'READY')
          await this.assertReadyRelationship(tx, session);
        return session;
      },
      true,
    );
  }

  async cleanupEligibility(
    owner: AssessmentMediaOwner,
    uploadId: string,
    now = new Date(),
  ) {
    return this.transaction(
      owner,
      async (tx) => {
        const session = await this.lock(tx, owner, uploadId);
        const retainedReferences = session.fileId
          ? await hasRetainedFileReferences(tx, session.fileId)
          : false;
        return {
          uploadId,
          retainedReferences,
          deletionPermitted: false as const,
          capabilityExpired:
            !session.latestUploadUrlExpiresAt ||
            session.latestUploadUrlExpiresAt <= now,
          reason: retainedReferences
            ? ('retained_references' as const)
            : ('deletion_authority_not_approved' as const),
        };
      },
      true,
    );
  }

  private async assertReadyRelationship(
    tx: Prisma.TransactionClient,
    session: FileUploadSession,
  ): Promise<void> {
    const file = session.fileId
      ? await tx.file.findFirst({
          where: {
            id: session.fileId,
            organizationId: session.organizationId,
            uploaderId: session.createdByUserId,
            bucket: session.finalBucket,
            objectKey: session.finalObjectKey,
            mimeType: session.verifiedMimeType ?? '',
            sizeBytes: session.actualSizeBytes ?? 0n,
            checksumSha256: session.checksumSha256,
            visibility: FileVisibility.PRIVATE,
            deletedAt: null,
          },
          select: { id: true },
        })
      : null;
    if (
      !file ||
      session.verificationVersion !== ASSESSMENT_MEDIA_VERSION ||
      !session.assessmentSecurityEvidence
    )
      throw new AssessmentMediaException('ready_relationship_invalid');
  }

  private async audit(
    tx: Prisma.TransactionClient,
    owner: AssessmentMediaOwner,
    session: FileUploadSession,
    action: string,
    reason?: AssessmentMediaReason,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorId: owner.actorId,
        organizationId: owner.organizationId,
        schoolId: owner.schoolId,
        module: 'assessment-media',
        action: `upload.${action}`,
        resourceType: 'FileUploadSession',
        resourceId: session.id,
        outcome:
          action === 'failed' ? AuditOutcome.FAILURE : AuditOutcome.SUCCESS,
        after: {
          purpose: owner.purpose,
          contextId: owner.contextId,
          fileId: session.fileId,
          ...(reason ? { reason } : {}),
        },
      },
    });
  }
}
