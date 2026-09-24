import { Injectable } from '@nestjs/common';
import {
  FileUploadPurpose,
  FileUploadSessionStatus,
  Prisma,
  type FileUploadSession,
} from '@prisma/client';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { missingAcademicCapabilityCleanupDeadline } from '../domain/academic-content-file.cleanup-deadline';

export type AcademicUploadIdentity = {
  uploadId: string;
  schoolId: string;
  actorId: string;
  contentId: string;
};

@Injectable()
export class AcademicContentFileRepository {
  constructor(readonly prisma: PrismaService) {}

  findContent(contentId: string, schoolId: string) {
    return this.prisma.academicContent.findFirst({
      where: { id: contentId, schoolId, deletedAt: null },
    });
  }

  findRequest(schoolId: string, actorId: string, clientRequestId: string) {
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

  create(data: Prisma.FileUploadSessionUncheckedCreateInput) {
    return this.prisma.fileUploadSession.create({ data });
  }

  async lock(
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

  async lockById(
    tx: Prisma.TransactionClient,
    uploadId: string,
  ): Promise<FileUploadSession | null> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM file_upload_sessions WHERE id = ${uploadId}::uuid
        AND purpose = 'ACADEMIC_CONTENT'::file_upload_purpose FOR UPDATE`;
    if (rows.length === 0) return null;
    return tx.fileUploadSession.findUnique({ where: { id: uploadId } });
  }

  async readyLink(tx: Prisma.TransactionClient, session: FileUploadSession) {
    if (!session.fileId || !session.purposeContextId) return null;
    const [file, asset] = await Promise.all([
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
    return file && asset ? { file, asset } : null;
  }

  async expireAbandoned(now: Date): Promise<number> {
    // The provider may still accept a resumable URI after ACC's 24-hour
    // application TTL. A malformed old UPLOADING row is deferred a full
    // supported capability lifetime from discovery, never treated as absent.
    const missingCapabilityDeadline =
      missingAcademicCapabilityCleanupDeadline(now);
    return this.prisma.$executeRaw`
      UPDATE file_upload_sessions
      SET status = 'EXPIRED'::file_upload_session_status,
          final_cleanup_eligible_at = CASE
            WHEN status = 'CREATED'::file_upload_session_status THEN ${now}
            ELSE GREATEST(
              ${now},
              COALESCE(latest_upload_url_expires_at, ${missingCapabilityDeadline})
            )
          END,
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
              is: { academicContentAssets: { none: { deletedAt: null } } },
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
