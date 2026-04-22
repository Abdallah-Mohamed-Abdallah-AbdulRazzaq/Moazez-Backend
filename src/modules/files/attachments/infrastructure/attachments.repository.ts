import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AttachmentRecord } from '../domain/attachment-record';

const ATTACHMENT_RECORD_ARGS = Prisma.validator<Prisma.AttachmentDefaultArgs>()({
  select: {
    id: true,
    fileId: true,
    schoolId: true,
    resourceType: true,
    resourceId: true,
    createdById: true,
    createdAt: true,
    file: {
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        visibility: true,
      },
    },
  },
});

type AttachmentRecordRow = Prisma.AttachmentGetPayload<
  typeof ATTACHMENT_RECORD_ARGS
>;

export type DeleteAttachmentResult =
  | { status: 'deleted' }
  | { status: 'not_found' };

@Injectable()
export class AttachmentsRepository {
  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  constructor(private readonly prisma: PrismaService) {}

  async createAttachment(data: {
    fileId: string;
    schoolId: string;
    resourceType: string;
    resourceId: string;
    createdById: string | null;
  }): Promise<AttachmentRecord> {
    const attachment = await this.prisma.attachment.create({
      data,
      ...ATTACHMENT_RECORD_ARGS,
    });

    return this.mapRecord(attachment);
  }

  async findAttachmentById(
    attachmentId: string,
  ): Promise<AttachmentRecord | null> {
    const attachment = await this.scopedPrisma.attachment.findFirst({
      where: { id: attachmentId },
      ...ATTACHMENT_RECORD_ARGS,
    });

    return attachment ? this.mapRecord(attachment) : null;
  }

  async listAttachmentsForResource(params: {
    resourceType: string;
    resourceId: string;
  }): Promise<AttachmentRecord[]> {
    const attachments = await this.scopedPrisma.attachment.findMany({
      where: {
        resourceType: params.resourceType,
        resourceId: params.resourceId,
      },
      orderBy: { createdAt: 'asc' },
      ...ATTACHMENT_RECORD_ARGS,
    });

    return attachments.map((attachment) => this.mapRecord(attachment));
  }

  async deleteAttachment(
    attachmentId: string,
  ): Promise<DeleteAttachmentResult> {
    const result = await this.scopedPrisma.attachment.deleteMany({
      where: { id: attachmentId },
    });

    return result.count > 0 ? { status: 'deleted' } : { status: 'not_found' };
  }

  private mapRecord(attachment: AttachmentRecordRow): AttachmentRecord {
    return {
      id: attachment.id,
      fileId: attachment.fileId,
      schoolId: attachment.schoolId,
      resourceType: attachment.resourceType,
      resourceId: attachment.resourceId,
      createdById: attachment.createdById,
      createdAt: attachment.createdAt,
      file: {
        id: attachment.file.id,
        originalName: attachment.file.originalName,
        mimeType: attachment.file.mimeType,
        sizeBytes: attachment.file.sizeBytes,
        visibility: attachment.file.visibility,
      },
    };
  }
}
