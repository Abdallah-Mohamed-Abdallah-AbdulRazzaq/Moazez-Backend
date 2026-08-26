import { Injectable } from '@nestjs/common';
import {
  ImportJobStatus,
  Prisma,
  StudentBulkRegistrationBatchStatus,
  StudentBulkRegistrationRowStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { STUDENTS_BULK_REGISTRATION_IMPORT_TYPE } from '../../../files/imports/domain/import-upload.constraints';
import { STUDENT_BULK_REGISTRATION_TEMPLATE_VERSION } from '../domain/student-bulk-registration.constants';

const STUDENT_BULK_REGISTRATION_BATCH_ARGS =
  Prisma.validator<Prisma.StudentBulkRegistrationBatchDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      organizationId: true,
      sourceImportJobId: true,
      academicYearId: true,
      termId: true,
      classroomId: true,
      enrollmentDate: true,
      templateVersion: true,
      status: true,
      totalRows: true,
      validRows: true,
      invalidRows: true,
      createdRows: true,
      failedRows: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,
      validatedAt: true,
      startedAt: true,
      completedAt: true,
      sourceImportJob: {
        select: {
          status: true,
          reportJson: true,
        },
      },
    },
  });

const STUDENT_BULK_REGISTRATION_ROW_ARGS =
  Prisma.validator<Prisma.StudentBulkRegistrationRowDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      batchId: true,
      rowNumber: true,
      normalizedDataJson: true,
      rowHash: true,
      status: true,
      errorsJson: true,
      studentId: true,
      userId: true,
      enrollmentId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

export type StudentBulkRegistrationBatchRecord =
  Prisma.StudentBulkRegistrationBatchGetPayload<
    typeof STUDENT_BULK_REGISTRATION_BATCH_ARGS
  >;

export type StudentBulkRegistrationRowRecord =
  Prisma.StudentBulkRegistrationRowGetPayload<
    typeof STUDENT_BULK_REGISTRATION_ROW_ARGS
  >;

@Injectable()
export class StudentBulkRegistrationRepository {
  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  constructor(private readonly prisma: PrismaService) {}

  createIntake(command: {
    schoolId: string;
    organizationId: string;
    uploadedFileId: string;
    createdById: string;
    reportJson: Prisma.InputJsonValue;
    academicYearId: string;
    termId: string | null;
    classroomId: string;
    enrollmentDate: Date;
  }): Promise<StudentBulkRegistrationBatchRecord> {
    return this.prisma.$transaction(async (tx) => {
      const importJob = await tx.importJob.create({
        data: {
          schoolId: command.schoolId,
          uploadedFileId: command.uploadedFileId,
          type: STUDENTS_BULK_REGISTRATION_IMPORT_TYPE,
          status: ImportJobStatus.PENDING,
          reportJson: command.reportJson,
          createdById: command.createdById,
        },
        select: { id: true },
      });

      return tx.studentBulkRegistrationBatch.create({
        data: {
          schoolId: command.schoolId,
          organizationId: command.organizationId,
          sourceImportJobId: importJob.id,
          academicYearId: command.academicYearId,
          termId: command.termId,
          classroomId: command.classroomId,
          enrollmentDate: command.enrollmentDate,
          templateVersion: STUDENT_BULK_REGISTRATION_TEMPLATE_VERSION,
          status: StudentBulkRegistrationBatchStatus.UPLOADED,
          totalRows: 0,
          validRows: 0,
          invalidRows: 0,
          createdRows: 0,
          failedRows: 0,
          createdById: command.createdById,
        },
        ...STUDENT_BULK_REGISTRATION_BATCH_ARGS,
      });
    });
  }

  findBatchById(
    batchId: string,
  ): Promise<StudentBulkRegistrationBatchRecord | null> {
    return this.scopedPrisma.studentBulkRegistrationBatch.findFirst({
      where: { id: batchId },
      ...STUDENT_BULK_REGISTRATION_BATCH_ARGS,
    });
  }

  async listRows(input: {
    batchId: string;
    page: number;
    limit: number;
    status?: StudentBulkRegistrationRowStatus;
  }): Promise<{
    batchFound: boolean;
    items: StudentBulkRegistrationRowRecord[];
    total: number;
  }> {
    const batch = await this.findBatchById(input.batchId);
    if (!batch) return { batchFound: false, items: [], total: 0 };
    const where: Prisma.StudentBulkRegistrationRowWhereInput = {
      batchId: input.batchId,
      ...(input.status ? { status: input.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.scopedPrisma.studentBulkRegistrationRow.findMany({
        where,
        orderBy: { rowNumber: 'asc' },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
        ...STUDENT_BULK_REGISTRATION_ROW_ARGS,
      }),
      this.scopedPrisma.studentBulkRegistrationRow.count({ where }),
    ]);
    return { batchFound: true, items, total };
  }

  async claimValidation(input: {
    importJobId: string;
    schoolId: string;
    retryableFailed: boolean;
    staleProcessingBefore: Date;
    reportJson: Prisma.InputJsonValue;
  }): Promise<StudentBulkRegistrationBatchRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const eligibleImportStates: Prisma.ImportJobWhereInput[] = [
        { status: ImportJobStatus.PENDING },
        ...(input.retryableFailed
          ? [{ status: ImportJobStatus.FAILED } as const]
          : []),
        {
          status: ImportJobStatus.PROCESSING,
          updatedAt: { lte: input.staleProcessingBefore },
        },
      ];
      const importClaim = await tx.importJob.updateMany({
        where: {
          id: input.importJobId,
          schoolId: input.schoolId,
          OR: eligibleImportStates,
        },
        data: {
          status: ImportJobStatus.PROCESSING,
          reportJson: input.reportJson,
        },
      });
      if (importClaim.count !== 1) return null;

      const batchClaim = await tx.studentBulkRegistrationBatch.updateMany({
        where: {
          sourceImportJobId: input.importJobId,
          schoolId: input.schoolId,
          OR: [
            { status: StudentBulkRegistrationBatchStatus.UPLOADED },
            {
              status: StudentBulkRegistrationBatchStatus.VALIDATING,
              updatedAt: { lte: input.staleProcessingBefore },
            },
          ],
        },
        data: { status: StudentBulkRegistrationBatchStatus.VALIDATING },
      });
      if (batchClaim.count !== 1) {
        throw new Error('bulk_registration_validation_batch_claim_failed');
      }
      return tx.studentBulkRegistrationBatch.findFirst({
        where: {
          sourceImportJobId: input.importJobId,
          schoolId: input.schoolId,
        },
        ...STUDENT_BULK_REGISTRATION_BATCH_ARGS,
      });
    });
  }

  async finalizeValidation(input: {
    importJobId: string;
    schoolId: string;
    batchId: string;
    batchStatus:
      | typeof StudentBulkRegistrationBatchStatus.READY
      | typeof StudentBulkRegistrationBatchStatus.VALIDATION_FAILED;
    rows: Array<{
      rowNumber: number;
      normalizedDataJson: Prisma.InputJsonValue;
      rowHash: string;
      status: StudentBulkRegistrationRowStatus;
      errorsJson: Prisma.InputJsonValue | null;
    }>;
    validRows: number;
    invalidRows: number;
    reportJson: Prisma.InputJsonValue;
    validatedAt: Date;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.studentBulkRegistrationRow.deleteMany({
        where: { batchId: input.batchId, schoolId: input.schoolId },
      });
      for (let index = 0; index < input.rows.length; index += 500) {
        await tx.studentBulkRegistrationRow.createMany({
          data: input.rows.slice(index, index + 500).map((row) => ({
            schoolId: input.schoolId,
            batchId: input.batchId,
            rowNumber: row.rowNumber,
            normalizedDataJson: row.normalizedDataJson,
            rowHash: row.rowHash,
            status: row.status,
            ...(row.errorsJson === null ? {} : { errorsJson: row.errorsJson }),
          })),
        });
      }
      const batchUpdate = await tx.studentBulkRegistrationBatch.updateMany({
        where: {
          id: input.batchId,
          schoolId: input.schoolId,
          sourceImportJobId: input.importJobId,
          status: StudentBulkRegistrationBatchStatus.VALIDATING,
        },
        data: {
          status: input.batchStatus,
          totalRows: input.rows.length,
          validRows: input.validRows,
          invalidRows: input.invalidRows,
          validatedAt: input.validatedAt,
        },
      });
      if (batchUpdate.count !== 1) {
        throw new Error('bulk_registration_validation_finalize_conflict');
      }
      await tx.importJob.update({
        where: { id: input.importJobId },
        data: {
          status: ImportJobStatus.COMPLETED,
          reportJson: input.reportJson,
        },
      });
    });
  }

  async failValidation(input: {
    importJobId: string;
    schoolId: string;
    batchStatus:
      | typeof StudentBulkRegistrationBatchStatus.UPLOADED
      | typeof StudentBulkRegistrationBatchStatus.FAILED;
    reportJson: Prisma.InputJsonValue;
  }): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.importJob.update({
        where: { id: input.importJobId },
        data: { status: ImportJobStatus.FAILED, reportJson: input.reportJson },
      }),
      this.prisma.studentBulkRegistrationBatch.updateMany({
        where: {
          sourceImportJobId: input.importJobId,
          schoolId: input.schoolId,
        },
        data: { status: input.batchStatus },
      }),
    ]);
  }
}
