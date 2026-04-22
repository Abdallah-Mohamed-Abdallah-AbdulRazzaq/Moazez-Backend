import { FileVisibility, Prisma } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { StoredFileMetadata } from '../domain/stored-file-metadata';

const FILE_RECORD_ARGS = Prisma.validator<Prisma.FileDefaultArgs>()({
  select: {
    id: true,
    organizationId: true,
    schoolId: true,
    uploaderId: true,
    bucket: true,
    objectKey: true,
    originalName: true,
    mimeType: true,
    sizeBytes: true,
    checksumSha256: true,
    visibility: true,
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
  },
});

type FileRecordRow = Prisma.FileGetPayload<typeof FILE_RECORD_ARGS>;

@Injectable()
export class FilesRepository {
  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  constructor(private readonly prisma: PrismaService) {}

  async createFileRecord(data: {
    organizationId: string | null;
    schoolId: string | null;
    uploaderId: string | null;
    bucket: string;
    objectKey: string;
    originalName: string;
    mimeType: string;
    sizeBytes: bigint;
    checksumSha256: string | null;
    visibility: FileVisibility;
  }): Promise<StoredFileMetadata> {
    const file = await this.prisma.file.create({
      data,
      ...FILE_RECORD_ARGS,
    });

    return this.mapRecord(file);
  }

  async findScopedFileById(fileId: string): Promise<StoredFileMetadata | null> {
    const file = await this.scopedPrisma.file.findFirst({
      where: { id: fileId },
      ...FILE_RECORD_ARGS,
    });

    return file ? this.mapRecord(file) : null;
  }

  async softDeleteFile(fileId: string): Promise<void> {
    await this.prisma.file.update({
      where: { id: fileId },
      data: { deletedAt: new Date() },
    });
  }

  private mapRecord(file: FileRecordRow): StoredFileMetadata {
    return {
      id: file.id,
      organizationId: file.organizationId,
      schoolId: file.schoolId,
      uploaderId: file.uploaderId,
      bucket: file.bucket,
      objectKey: file.objectKey,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      checksumSha256: file.checksumSha256,
      visibility: file.visibility,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      deletedAt: file.deletedAt,
    };
  }
}
