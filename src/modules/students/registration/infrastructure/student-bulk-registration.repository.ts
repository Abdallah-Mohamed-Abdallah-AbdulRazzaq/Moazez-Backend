import { Injectable } from '@nestjs/common';
import {
  ImportJobStatus,
  Prisma,
  StudentBulkRegistrationBatchStatus,
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
    },
  });

export type StudentBulkRegistrationBatchRecord =
  Prisma.StudentBulkRegistrationBatchGetPayload<
    typeof STUDENT_BULK_REGISTRATION_BATCH_ARGS
  >;

@Injectable()
export class StudentBulkRegistrationRepository {
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
}
