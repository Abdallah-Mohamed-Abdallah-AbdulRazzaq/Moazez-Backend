import { Injectable } from '@nestjs/common';
import {
  ImportJobStatus,
  OrganizationStatus,
  Prisma,
  SchoolStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
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
      deletedAt: true,
      },
    },
  },
});

type ImportJobRecordRow = Prisma.ImportJobGetPayload<
  typeof IMPORT_JOB_RECORD_ARGS
>;

export type ImportJobRecoveryCandidate = ImportJobRecord & {
  organizationId: string;
  actorUserType: UserType | null;
  ineligibilityCode:
    | 'import_terminal_source_ineligible'
    | 'import_terminal_tenant_ineligible'
    | null;
};

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

  async findImportJobById(
    importJobId: string,
  ): Promise<ImportJobRecord | null> {
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

  async claimImportJobProcessing(input: {
    importJobId: string;
    retryableFailed: boolean;
    staleProcessingBefore: Date;
    reportJson: Prisma.InputJsonValue;
  }): Promise<ImportJobRecord | null> {
    const eligibleStates: Prisma.ImportJobWhereInput[] = [
      { status: ImportJobStatus.PENDING },
      ...(input.retryableFailed
        ? [{ status: ImportJobStatus.FAILED } as const]
        : []),
      {
        status: ImportJobStatus.PROCESSING,
        updatedAt: { lte: input.staleProcessingBefore },
      },
    ];
    const claimed = await this.prisma.importJob.updateMany({
      where: { id: input.importJobId, OR: eligibleStates },
      data: {
        status: ImportJobStatus.PROCESSING,
        reportJson: input.reportJson,
      },
    });
    if (claimed.count !== 1) return null;
    return this.findImportJobById(input.importJobId);
  }

  async listRecoveryCandidates(input: {
    createdBefore: Date;
    cursor?: { createdAt: Date; id: string };
    limit: number;
  }): Promise<ImportJobRecoveryCandidate[]> {
    const jobs = await this.prisma.importJob.findMany({
      where: {
        createdAt: { lte: input.createdBefore },
        status: {
          in: [
            ImportJobStatus.PENDING,
            ImportJobStatus.PROCESSING,
            ImportJobStatus.FAILED,
          ],
        },
        ...(input.cursor
          ? {
              OR: [
                { createdAt: { gt: input.cursor.createdAt } },
                {
                  createdAt: input.cursor.createdAt,
                  id: { gt: input.cursor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: input.limit,
      select: {
        ...IMPORT_JOB_RECORD_ARGS.select,
        school: {
          select: {
            organizationId: true,
            status: true,
            deletedAt: true,
            organization: { select: { status: true, deletedAt: true } },
          },
        },
        createdBy: {
          where: { deletedAt: null, status: UserStatus.ACTIVE },
          select: { userType: true },
        },
      },
    });
    return jobs.map((job) => {
      const tenantIneligible =
        job.school.status !== SchoolStatus.ACTIVE ||
        job.school.deletedAt !== null ||
        job.school.organization.status !== OrganizationStatus.ACTIVE ||
        job.school.organization.deletedAt !== null;
      return {
        ...this.mapRecord(job),
        organizationId: job.school.organizationId,
        actorUserType: job.createdBy?.userType ?? null,
        ineligibilityCode: tenantIneligible
          ? 'import_terminal_tenant_ineligible'
          : job.uploadedFile?.deletedAt
            ? 'import_terminal_source_ineligible'
            : null,
      };
    });
  }

  async findRecoveryContextById(
    importJobId: string,
  ): Promise<ImportJobRecoveryCandidate | null> {
    const job = await this.prisma.importJob.findFirst({
      where: { id: importJobId },
      select: {
        ...IMPORT_JOB_RECORD_ARGS.select,
        school: {
          select: {
            organizationId: true,
            status: true,
            deletedAt: true,
            organization: { select: { status: true, deletedAt: true } },
          },
        },
        createdBy: {
          where: { deletedAt: null, status: UserStatus.ACTIVE },
          select: { userType: true },
        },
      },
    });
    if (!job) return null;
    const tenantIneligible =
      job.school.status !== SchoolStatus.ACTIVE ||
      job.school.deletedAt !== null ||
      job.school.organization.status !== OrganizationStatus.ACTIVE ||
      job.school.organization.deletedAt !== null;
    return {
      ...this.mapRecord(job),
      organizationId: job.school.organizationId,
      actorUserType: job.createdBy?.userType ?? null,
      ineligibilityCode: tenantIneligible
        ? 'import_terminal_tenant_ineligible'
        : job.uploadedFile?.deletedAt
          ? 'import_terminal_source_ineligible'
          : null,
    };
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
            deletedAt: job.uploadedFile.deletedAt,
          }
        : null,
    };
  }
}
