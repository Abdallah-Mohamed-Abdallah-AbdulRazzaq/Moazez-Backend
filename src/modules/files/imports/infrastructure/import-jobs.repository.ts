import { Injectable } from '@nestjs/common';
import { ImportJobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { ImportJobRecord } from '../domain/import-job.types';

const IMPORT_JOB_RECORD_ARGS = Prisma.validator<Prisma.ImportJobDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    uploadedFileId: true,
    type: true,
    status: true,
    reportJson: true,
    createdById: true,
    createdAt: true,
    updatedAt: true,
    uploadedFile: {
      select: {
        id: true,
        bucket: true,
        objectKey: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        visibility: true,
      },
    },
  },
});

type ImportJobRecordRow = Prisma.ImportJobGetPayload<
  typeof IMPORT_JOB_RECORD_ARGS
>;

@Injectable()
export class ImportJobsRepository {
  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  constructor(private readonly prisma: PrismaService) {}

  async createImportJob(data: {
    schoolId: string;
    uploadedFileId: string;
    type: string;
    createdById: string | null;
    status?: ImportJobStatus;
    reportJson?: Prisma.InputJsonValue | null;
  }): Promise<ImportJobRecord> {
    const job = await this.prisma.importJob.create({
      data: {
        schoolId: data.schoolId,
        uploadedFileId: data.uploadedFileId,
        type: data.type,
        createdById: data.createdById,
        status: data.status ?? ImportJobStatus.PENDING,
        reportJson: data.reportJson ?? undefined,
      },
      ...IMPORT_JOB_RECORD_ARGS,
    });

    return this.mapRecord(job);
  }

  async findScopedImportJobById(
    importJobId: string,
  ): Promise<ImportJobRecord | null> {
    const job = await this.scopedPrisma.importJob.findFirst({
      where: { id: importJobId },
      ...IMPORT_JOB_RECORD_ARGS,
    });

    return job ? this.mapRecord(job) : null;
  }

  async findImportJobById(importJobId: string): Promise<ImportJobRecord | null> {
    const job = await this.prisma.importJob.findUnique({
      where: { id: importJobId },
      ...IMPORT_JOB_RECORD_ARGS,
    });

    return job ? this.mapRecord(job) : null;
  }

  async updateImportJob(data: {
    importJobId: string;
    status?: ImportJobStatus;
    reportJson?: Prisma.InputJsonValue | null;
  }): Promise<ImportJobRecord> {
    const job = (await this.prisma.importJob.update({
      where: { id: data.importJobId },
      data: {
        status: data.status,
        reportJson:
          data.reportJson === undefined
            ? undefined
            : data.reportJson === null
              ? Prisma.JsonNull
              : data.reportJson,
      },
      ...IMPORT_JOB_RECORD_ARGS,
    })) as ImportJobRecordRow;

    return this.mapRecord(job);
  }

  private mapRecord(job: ImportJobRecordRow): ImportJobRecord {
    return {
      id: job.id,
      schoolId: job.schoolId,
      uploadedFileId: job.uploadedFileId,
      type: job.type,
      status: job.status,
      reportJson: job.reportJson,
      createdById: job.createdById,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      uploadedFile: job.uploadedFile
        ? {
            id: job.uploadedFile.id,
            bucket: job.uploadedFile.bucket,
            objectKey: job.uploadedFile.objectKey,
            originalName: job.uploadedFile.originalName,
            mimeType: job.uploadedFile.mimeType,
            sizeBytes: job.uploadedFile.sizeBytes,
            visibility: job.uploadedFile.visibility,
          }
        : null,
    };
  }
}
