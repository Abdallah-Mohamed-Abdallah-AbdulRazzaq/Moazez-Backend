import { Injectable, Optional } from '@nestjs/common';
import {
  AuditOutcome,
  FileUploadPurpose,
  FileUploadSessionStatus,
  Prisma,
  type FileUploadSession,
} from '@prisma/client';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { missingAcademicCapabilityCleanupDeadline } from '../domain/academic-content-file.cleanup-deadline';
import {
  AcademicContentEffectiveFilePolicy,
  effectiveAcademicContentFilePolicy,
  sameAcademicContentFilePolicy,
} from '../domain/academic-content-file-policy';
import {
  assertAcademicContentMutable,
  assertAcademicContentTermWritable,
} from '../../domain/academic-content-lifecycle.policy';
import { NotFoundDomainException } from '../../../../../common/exceptions/domain-exception';
import { TeacherAllocationOperationalWriteGate } from '../../../teacher-allocation/application/teacher-allocation-operational-write-gate';
import {
  authorizeTeacherAcademicContentMutation,
  type AcademicContentTeacherWriteScope,
} from '../../infrastructure/academic-content-teacher-write.authorization';
import type {
  AcademicContentFileTransaction,
  AcademicContentFileWriteAuthorization,
  AcademicUploadIdentity,
  AcademicUploadIntent,
} from '../application/academic-content-file.unit-of-work';

export type { AcademicUploadIdentity } from '../application/academic-content-file.unit-of-work';

@Injectable()
export class AcademicContentFileRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly teacherGate?: TeacherAllocationOperationalWriteGate,
  ) {}

  private async lockContent(
    tx: Prisma.TransactionClient,
    contentId: string,
    schoolId: string,
    now: Date,
    authorization?: AcademicContentFileWriteAuthorization,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM academic_contents
      WHERE id = ${contentId}::uuid AND school_id = ${schoolId}::uuid
        AND deleted_at IS NULL FOR UPDATE`;
    if (!rows.length)
      throw new NotFoundDomainException('Academic content not found');
    const content = await tx.academicContent.findFirst({
      where: { id: contentId, schoolId, deletedAt: null },
      select: { status: true, termId: true, createdByUserId: true },
    });
    if (!content)
      throw new NotFoundDomainException('Academic content not found');
    if (authorization) {
      const scope = authorization.teacherScope;
      if (scope.schoolId !== schoolId)
        throw new NotFoundDomainException('Academic content not found');
      await authorizeTeacherAcademicContentMutation(
        tx,
        this.teacherGate,
        { ...scope, id: contentId },
        content.createdByUserId,
      );
      if (authorization.ownershipOnly) return;
    }
    assertAcademicContentMutable(content.status);
    const term = await tx.term.findFirst({
      where: { id: content.termId, schoolId, deletedAt: null },
      select: { startDate: true, endDate: true, isActive: true },
    });
    if (!term) throw new NotFoundDomainException('Term not found');
    assertAcademicContentTermWritable(term, now);
  }

  withTransaction<T>(
    callback: (context: AcademicContentFileTransaction) => Promise<T>,
    options?: { maxWait: number; timeout: number },
  ): Promise<T> {
    return this.prisma.$transaction(
      (tx) => callback(this.createTransactionContext(tx)),
      options,
    );
  }

  private createTransactionContext(
    tx: Prisma.TransactionClient,
  ): AcademicContentFileTransaction {
    const context: AcademicContentFileTransaction = {
      lockUpload: (owner: AcademicUploadIdentity) => this.lock(tx, owner),
      lockUploadById: (uploadId: string) => this.lockById(tx, uploadId),
      readyLink: (session: FileUploadSession) => this.readyLink(tx, session),
      updateUpload: ({ id, schoolId }, data) =>
        tx.fileUploadSession.update({
          where: { id, schoolId, purpose: FileUploadPurpose.ACADEMIC_CONTENT },
          data,
        }),
      lockMutableContent: (contentId, schoolId, now, authorization) =>
        this.lockContent(tx, contentId, schoolId, now, authorization),
      createFile: (data) => tx.file.create({ data }),
      createAsset: async (data) => {
        const latest = await tx.academicContentAsset.aggregate({
          where: {
            schoolId: data.schoolId,
            academicContentId: data.academicContentId,
            deletedAt: null,
          },
          _max: { sortOrder: true },
        });
        return tx.academicContentAsset.create({
          data: { ...data, sortOrder: (latest._max.sortOrder ?? -1) + 1 },
        });
      },
      recordCompletedAudit: async (input) => {
        await tx.auditLog.create({
          data: {
            actorId: input.actorId,
            organizationId: input.organizationId,
            schoolId: input.schoolId,
            module: 'academic-content',
            action: 'file.upload.completed',
            resourceType: 'AcademicContentAsset',
            resourceId: input.assetId,
            outcome: AuditOutcome.SUCCESS,
            after: {
              uploadId: input.uploadId,
              contentId: input.contentId,
              fileId: input.fileId,
            },
          },
        });
      },
      findActiveAsset: (input) =>
        tx.academicContentAsset.findFirst({
          where: {
            id: input.assetId,
            schoolId: input.schoolId,
            academicContentId: input.contentId,
            deletedAt: null,
          },
        }),
      findUploadIdForFile: async (fileId, schoolId) => {
        const upload = await tx.fileUploadSession.findFirst({
          where: {
            purpose: FileUploadPurpose.ACADEMIC_CONTENT,
            schoolId,
            fileId,
          },
          select: { id: true },
        });
        return upload?.id ?? null;
      },
      lockActiveFile: async (fileId, schoolId) => {
        const rows = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM files WHERE id = ${fileId}::uuid
            AND school_id = ${schoolId}::uuid AND deleted_at IS NULL FOR UPDATE`;
        return rows.length > 0;
      },
      lockActiveAsset: async (input) => {
        const rows = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM academic_content_assets
          WHERE id = ${input.assetId}::uuid
            AND school_id = ${input.schoolId}::uuid
            AND academic_content_id = ${input.contentId}::uuid
            AND deleted_at IS NULL FOR UPDATE`;
        return rows.length > 0;
      },
      softDeleteAsset: (assetId, schoolId, deletedAt) =>
        tx.academicContentAsset.update({
          where: { id: assetId, schoolId },
          data: { deletedAt },
        }),
      countAcademicContentFileReferences: async (fileId, schoolId) => {
        const current = await tx.academicContentAsset.count({
          where: { schoolId, fileId, deletedAt: null },
        });
        const historical = await tx.academicContentRevisionAsset.count({
          where: { schoolId, fileId },
        });
        return current + historical;
      },
      extendReadyCleanup: async (fileId, schoolId, eligibleAt) => {
        await tx.fileUploadSession.updateMany({
          where: {
            purpose: FileUploadPurpose.ACADEMIC_CONTENT,
            schoolId,
            fileId,
            status: FileUploadSessionStatus.READY,
            OR: [
              { finalCleanupEligibleAt: null },
              { finalCleanupEligibleAt: { lt: eligibleAt } },
            ],
          },
          data: { finalCleanupEligibleAt: eligibleAt },
        });
      },
      softDeleteFile: async (fileId, schoolId, deletedAt) => {
        await tx.file.updateMany({
          where: { id: fileId, schoolId, deletedAt: null },
          data: { deletedAt },
        });
      },
    };
    return Object.freeze(context);
  }

  findPolicy(schoolId: string) {
    return this.prisma.academicContentFilePolicy.findUnique({
      where: { schoolId },
    });
  }

  async updatePolicy(input: {
    schoolId: string;
    organizationId: string;
    actorId: string;
    changes: Partial<AcademicContentEffectiveFilePolicy>;
  }): Promise<AcademicContentEffectiveFilePolicy> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const current = await tx.academicContentFilePolicy.findUnique({
              where: { schoolId: input.schoolId },
            });
            const before = effectiveAcademicContentFilePolicy(current);
            const after = effectiveAcademicContentFilePolicy({
              ...before,
              ...input.changes,
            });
            if (sameAcademicContentFilePolicy(before, after)) return before;
            const policy = current
              ? await tx.academicContentFilePolicy.update({
                  where: { schoolId: input.schoolId },
                  data: after,
                })
              : await tx.academicContentFilePolicy.create({
                  data: { schoolId: input.schoolId, ...after },
                });
            const auditValue = (value: AcademicContentEffectiveFilePolicy) => ({
              ...value,
              maximumFileSizeBytes: String(value.maximumFileSizeBytes),
            });
            await tx.auditLog.create({
              data: {
                actorId: input.actorId,
                organizationId: input.organizationId,
                schoolId: input.schoolId,
                module: 'academic-content',
                action: 'academics.academic_content.file_policy.update',
                resourceType: 'academic_content_file_policy',
                resourceId: policy.id,
                outcome: AuditOutcome.SUCCESS,
                before: auditValue(before),
                after: auditValue(after),
              },
            });
            return after;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          !['P2034', 'P2002'].includes(error.code) ||
          attempt === 2
        )
          throw error;
      }
    }
    throw new Error('Unreachable Academic Content policy retry state');
  }

  findContent(contentId: string, schoolId: string) {
    return this.prisma.academicContent.findFirst({
      where: { id: contentId, schoolId, deletedAt: null },
      include: {
        term: { select: { startDate: true, endDate: true, isActive: true } },
      },
    });
  }

  private findRequest(
    schoolId: string,
    actorId: string,
    clientRequestId: string,
  ) {
    return this.prisma.fileUploadSession.findUnique({
      where: {
        schoolId_createdByUserId_purpose_clientRequestId: {
          schoolId,
          createdByUserId: actorId,
          purpose: FileUploadPurpose.ACADEMIC_CONTENT,
          clientRequestId,
        },
      },
    });
  }

  async createOrFindRequest(
    data: AcademicUploadIntent,
    teacherScope?: AcademicContentTeacherWriteScope,
    validatePolicy?: (policy: AcademicContentEffectiveFilePolicy) => void,
  ) {
    if (teacherScope) {
      if (!validatePolicy) throw new Error('Upload policy validation required');
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await this.prisma.$transaction(async (tx) => {
            await this.lockContent(
              tx,
              data.purposeContextId,
              data.schoolId,
              new Date(),
              { teacherScope },
            );
            validatePolicy(
              effectiveAcademicContentFilePolicy(
                await tx.academicContentFilePolicy.findUnique({
                  where: { schoolId: data.schoolId },
                }),
              ),
            );
            const existing = await tx.fileUploadSession.findUnique({
              where: {
                schoolId_createdByUserId_purpose_clientRequestId: {
                  schoolId: data.schoolId,
                  createdByUserId: data.createdByUserId,
                  purpose: FileUploadPurpose.ACADEMIC_CONTENT,
                  clientRequestId: data.clientRequestId,
                },
              },
            });
            if (existing) return { session: existing, created: false as const };
            const session = await tx.fileUploadSession.create({
              data: {
                ...data,
                purpose: FileUploadPurpose.ACADEMIC_CONTENT,
                status: FileUploadSessionStatus.CREATED,
              },
            });
            return { session, created: true as const };
          });
        } catch (error) {
          if (
            !(error instanceof Prisma.PrismaClientKnownRequestError) ||
            error.code !== 'P2002' ||
            attempt === 2
          )
            throw error;
        }
      }
      throw new Error('Unreachable Academic Content upload idempotency retry');
    }
    try {
      const session = await this.prisma.fileUploadSession.create({
        data: {
          ...data,
          purpose: FileUploadPurpose.ACADEMIC_CONTENT,
          status: FileUploadSessionStatus.CREATED,
        },
      });
      return { session, created: true as const };
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      )
        throw error;
      const existing = await this.findRequest(
        data.schoolId,
        data.createdByUserId,
        data.clientRequestId,
      );
      if (!existing) throw error;
      return { session: existing, created: false as const };
    }
  }

  private ownedStatusWhere(
    owner: AcademicUploadIdentity,
    status: FileUploadSessionStatus,
  ) {
    return {
      id: owner.uploadId,
      schoolId: owner.schoolId,
      createdByUserId: owner.actorId,
      purpose: FileUploadPurpose.ACADEMIC_CONTENT,
      purposeContextId: owner.contentId,
      status,
    };
  }

  async markCapabilityFailed(
    owner: AcademicUploadIdentity,
    now: Date,
    capabilityExpiresAt?: Date,
  ): Promise<void> {
    await this.prisma.fileUploadSession.updateMany({
      where: this.ownedStatusWhere(owner, FileUploadSessionStatus.CREATED),
      data: {
        status: FileUploadSessionStatus.FAILED,
        failedAt: now,
        failureReason: 'resumable_capability_failed',
        latestUploadUrlExpiresAt: capabilityExpiresAt,
        finalCleanupEligibleAt: capabilityExpiresAt
          ? new Date(Math.max(now.getTime(), capabilityExpiresAt.getTime()))
          : now,
      },
    });
  }

  async persistCapabilityExpiry(
    owner: AcademicUploadIdentity,
    capabilityExpiresAt: Date,
    teacherScope?: AcademicContentTeacherWriteScope,
  ): Promise<boolean> {
    if (teacherScope) {
      return this.prisma.$transaction(async (tx) => {
        const session = await this.lock(tx, owner);
        if (!session)
          throw new NotFoundDomainException('Academic upload not found');
        await this.lockContent(
          tx,
          owner.contentId,
          owner.schoolId,
          new Date(),
          { teacherScope },
        );
        const result = await tx.fileUploadSession.updateMany({
          where: this.ownedStatusWhere(owner, FileUploadSessionStatus.CREATED),
          data: {
            status: FileUploadSessionStatus.UPLOADING,
            latestUploadUrlExpiresAt: capabilityExpiresAt,
          },
        });
        return result.count === 1;
      });
    }
    const result = await this.prisma.fileUploadSession.updateMany({
      where: this.ownedStatusWhere(owner, FileUploadSessionStatus.CREATED),
      data: {
        status: FileUploadSessionStatus.UPLOADING,
        latestUploadUrlExpiresAt: capabilityExpiresAt,
      },
    });
    return result.count === 1;
  }

  /** Cleanup compensation after issuance, independent of mutable ownership. */
  async fenceIssuedCapability(
    owner: AcademicUploadIdentity,
    capabilityExpiresAt: Date,
    now = new Date(),
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const session = await this.lock(tx, owner);
      if (!session)
        throw new NotFoundDomainException('Academic upload not found');
      const latestUploadUrlExpiresAt = new Date(
        Math.max(
          Number(session.latestUploadUrlExpiresAt ?? capabilityExpiresAt),
          Number(capabilityExpiresAt),
        ),
      );
      const terminal = new Set<FileUploadSessionStatus>([
        FileUploadSessionStatus.CREATED,
        FileUploadSessionStatus.FAILED,
        FileUploadSessionStatus.CANCELLED,
        FileUploadSessionStatus.EXPIRED,
        FileUploadSessionStatus.READY,
        FileUploadSessionStatus.PURGED,
      ]).has(session.status);
      const finalCleanupEligibleAt = terminal
        ? new Date(
            Math.max(
              Number(now),
              Number(latestUploadUrlExpiresAt),
              Number(session.finalCleanupEligibleAt ?? now),
            ),
          )
        : null;
      await tx.fileUploadSession.updateMany({
        where: this.ownedStatusWhere(owner, session.status),
        data: {
          latestUploadUrlExpiresAt,
          ...(session.status === FileUploadSessionStatus.CREATED
            ? {
                status: FileUploadSessionStatus.FAILED,
                failedAt: now,
                failureReason: 'resumable_capability_failed',
              }
            : {}),
          ...(terminal ? { finalCleanupEligibleAt } : {}),
        },
      });
    });
  }

  async markVerificationFailed(input: {
    owner: AcademicUploadIdentity;
    failedAt: Date;
    reason: string;
    cleanupEligibleAt: Date;
  }): Promise<void> {
    await this.prisma.fileUploadSession.updateMany({
      where: this.ownedStatusWhere(
        input.owner,
        FileUploadSessionStatus.VERIFYING,
      ),
      data: {
        status: FileUploadSessionStatus.FAILED,
        failedAt: input.failedAt,
        failureReason: input.reason,
        finalCleanupEligibleAt: input.cleanupEligibleAt,
      },
    });
  }

  async releaseVerification(owner: AcademicUploadIdentity): Promise<void> {
    await this.prisma.fileUploadSession.updateMany({
      where: this.ownedStatusWhere(owner, FileUploadSessionStatus.VERIFYING),
      data: { status: FileUploadSessionStatus.UPLOADING },
    });
  }

  async findCurrentAssetFile(input: {
    schoolId: string;
    contentId: string;
    assetId: string;
  }) {
    const asset = await this.prisma.academicContentAsset.findFirst({
      where: {
        id: input.assetId,
        schoolId: input.schoolId,
        academicContentId: input.contentId,
        deletedAt: null,
        file: { is: { schoolId: input.schoolId, deletedAt: null } },
      },
      include: { file: true },
    });
    return asset?.file ?? null;
  }

  async findRevisionAssetFile(input: {
    schoolId: string;
    contentId: string;
    revisionId: string;
    fileId: string;
  }) {
    const asset = await this.prisma.academicContentRevisionAsset.findFirst({
      where: {
        schoolId: input.schoolId,
        revisionId: input.revisionId,
        fileId: input.fileId,
        revision: {
          is: { schoolId: input.schoolId, academicContentId: input.contentId },
        },
        file: { is: { schoolId: input.schoolId, deletedAt: null } },
      },
      include: { file: true },
    });
    return asset?.file ?? null;
  }

  async releaseTerminalCleanupClaim(input: {
    uploadId: string;
    schoolId: string;
    contentId: string;
    claimedAt: Date;
  }): Promise<void> {
    await this.prisma.fileUploadSession.updateMany({
      where: {
        id: input.uploadId,
        schoolId: input.schoolId,
        purpose: FileUploadPurpose.ACADEMIC_CONTENT,
        purposeContextId: input.contentId,
        status: {
          in: [
            FileUploadSessionStatus.FAILED,
            FileUploadSessionStatus.CANCELLED,
            FileUploadSessionStatus.EXPIRED,
          ],
        },
        finalCleanupClaimedAt: input.claimedAt,
        finalObjectDeletedAt: null,
      },
      data: { finalCleanupClaimedAt: null },
    });
  }

  private async lock(
    tx: Prisma.TransactionClient,
    identity: AcademicUploadIdentity,
  ): Promise<FileUploadSession | null> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM file_upload_sessions
      WHERE id = ${identity.uploadId}::uuid AND school_id = ${identity.schoolId}::uuid
        AND created_by_user_id = ${identity.actorId}::uuid
        AND purpose = 'ACADEMIC_CONTENT'::file_upload_purpose
        AND purpose_context_id = ${identity.contentId}::uuid
      FOR UPDATE`;
    if (rows.length === 0) return null;
    return tx.fileUploadSession.findUnique({
      where: { id: identity.uploadId },
    });
  }

  private async lockById(
    tx: Prisma.TransactionClient,
    uploadId: string,
  ): Promise<FileUploadSession | null> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM file_upload_sessions WHERE id = ${uploadId}::uuid
        AND purpose = 'ACADEMIC_CONTENT'::file_upload_purpose FOR UPDATE`;
    if (rows.length === 0) return null;
    return tx.fileUploadSession.findUnique({ where: { id: uploadId } });
  }

  private async readyLink(
    tx: Prisma.TransactionClient,
    session: FileUploadSession,
  ) {
    if (!session.fileId || !session.purposeContextId) return null;
    const [content, file, asset] = await Promise.all([
      tx.academicContent.findFirst({
        where: {
          id: session.purposeContextId,
          schoolId: session.schoolId,
          deletedAt: null,
        },
        select: { id: true },
      }),
      tx.file.findFirst({
        where: {
          id: session.fileId,
          schoolId: session.schoolId,
          deletedAt: null,
        },
      }),
      tx.academicContentAsset.findFirst({
        where: {
          schoolId: session.schoolId,
          academicContentId: session.purposeContextId,
          fileId: session.fileId,
          deletedAt: null,
        },
      }),
    ]);
    return content && file && asset ? { file, asset } : null;
  }

  async expireAbandoned(now: Date): Promise<number> {
    // The provider may still accept a resumable URI after ACC's 24-hour
    // application TTL. CREATED can also be awaiting capability persistence.
    // A row without a recorded expiry is deferred a full
    // supported capability lifetime from discovery, never treated as absent.
    const missingCapabilityDeadline =
      missingAcademicCapabilityCleanupDeadline(now);
    return this.prisma.$executeRaw`
      UPDATE file_upload_sessions
      SET status = 'EXPIRED'::file_upload_session_status,
          final_cleanup_eligible_at = GREATEST(
              ${now},
              COALESCE(latest_upload_url_expires_at, ${missingCapabilityDeadline})
            ),
          updated_at = ${now}
      WHERE purpose = 'ACADEMIC_CONTENT'::file_upload_purpose
        AND status IN (
          'CREATED'::file_upload_session_status,
          'UPLOADING'::file_upload_session_status
        )
        AND expires_at <= ${now}`;
  }

  async recoverStaleVerification(staleBefore: Date): Promise<number> {
    const result = await this.prisma.fileUploadSession.updateMany({
      where: {
        purpose: FileUploadPurpose.ACADEMIC_CONTENT,
        status: FileUploadSessionStatus.VERIFYING,
        fileId: null,
        updatedAt: { lt: staleBefore },
      },
      data: { status: FileUploadSessionStatus.UPLOADING },
    });
    return result.count;
  }

  async cleanupCandidates(now: Date, staleBefore: Date, take = 100) {
    return this.prisma.fileUploadSession.findMany({
      where: {
        purpose: FileUploadPurpose.ACADEMIC_CONTENT,
        finalCleanupEligibleAt: { lte: now },
        finalObjectDeletedAt: null,
        OR: [
          {
            status: {
              in: [
                FileUploadSessionStatus.FAILED,
                FileUploadSessionStatus.CANCELLED,
                FileUploadSessionStatus.EXPIRED,
              ],
            },
            OR: [
              { finalCleanupClaimedAt: null },
              { finalCleanupClaimedAt: { lt: staleBefore } },
            ],
          },
          {
            status: FileUploadSessionStatus.READY,
            file: {
              is: {
                academicContentAssets: { none: { deletedAt: null } },
                academicContentRevisionAssets: { none: {} },
              },
            },
          },
        ],
      },
      select: { id: true },
      orderBy: { finalCleanupEligibleAt: 'asc' },
      take,
    });
  }
}
