import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  ImportJobStatus,
  MembershipStatus,
  OrganizationStatus,
  Prisma,
  SchoolStatus,
  StudentBulkRegistrationBatchStatus,
  StudentBulkRegistrationRowStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { STUDENTS_BULK_REGISTRATION_IMPORT_TYPE } from '../../../files/imports/domain/import-upload.constraints';
import { buildActiveStudentSeatWhere } from '../../../platform-admin/infrastructure/student-seat-usage.query';
import { assertStudentSeatLimitSnapshot } from '../../../platform-admin/application/student-seat-limit-policy.service';
import {
  buildLoginEmail,
  normalizeContactEmail,
  normalizeUsername,
} from '../../../settings/login-identity/domain/login-identity.policy';
import { LoginEmailTakenException } from '../../../settings/login-identity/domain/login-identity.exceptions';
import { StudentRoleMissingException } from '../../account/domain/account-linking.exceptions';
import { StudentEnrollmentInactiveYearException } from '../../enrollments/domain/enrollment.exceptions';
import { assertStudentPlacementCapacitySnapshot } from '../../enrollments/domain/student-placement-capacity-policy.service';
import {
  resolveStudentBirthDate,
  resolveStudentName,
  resolveStudentProfileFields,
} from '../../students/domain/student-record.inputs';
import {
  isStudentBulkRegistrationNormalizedData,
  type StudentBulkRegistrationNormalizedData,
  type StudentBulkRegistrationRowError,
} from '../domain/student-bulk-registration-csv';
import { readStudentBulkRegistrationExecutionMetadata } from '../domain/student-bulk-registration-execution.metadata';
import {
  STUDENT_BULK_REGISTRATION_EXECUTION_RECOVERY_WINDOW_EXPIRED_CODE,
  STUDENT_BULK_REGISTRATION_EXECUTION_TENANT_INELIGIBLE_CODE,
} from '../domain/student-bulk-registration.constants';
import {
  StudentBulkRegistrationExecutionInvariantException,
  StudentBulkRegistrationExecutionMetadataException,
  StudentBulkRegistrationPlacementInvalidException,
  StudentBulkRegistrationExecutionTenantIneligibleException,
  StudentBulkRegistrationRowDataInvalidException,
} from '../domain/student-bulk-registration.exceptions';

export const STUDENT_BULK_REGISTRATION_TRANSACTION_MAX_ATTEMPTS = 3;

const EXECUTION_BATCH_SELECT =
  Prisma.validator<Prisma.StudentBulkRegistrationBatchSelect>()({
    id: true,
    schoolId: true,
    organizationId: true,
    sourceImportJobId: true,
    academicYearId: true,
    termId: true,
    classroomId: true,
    enrollmentDate: true,
    status: true,
    totalRows: true,
    validRows: true,
    invalidRows: true,
    createdRows: true,
    failedRows: true,
    startedAt: true,
    completedAt: true,
    school: { select: { organizationId: true } },
    sourceImportJob: {
      select: {
        id: true,
        schoolId: true,
        type: true,
        status: true,
        reportJson: true,
      },
    },
  });

export type StudentBulkRegistrationExecutionBatch =
  Prisma.StudentBulkRegistrationBatchGetPayload<{
    select: typeof EXECUTION_BATCH_SELECT;
  }>;

const EXECUTION_RECOVERY_BATCH_SELECT =
  Prisma.validator<Prisma.StudentBulkRegistrationBatchSelect>()({
    id: true,
    schoolId: true,
    organizationId: true,
    sourceImportJobId: true,
    status: true,
    totalRows: true,
    validRows: true,
    invalidRows: true,
    createdRows: true,
    failedRows: true,
    createdAt: true,
    startedAt: true,
    completedAt: true,
    school: {
      select: {
        id: true,
        organizationId: true,
        status: true,
        deletedAt: true,
        organization: {
          select: { id: true, status: true, deletedAt: true },
        },
      },
    },
    sourceImportJob: {
      select: {
        id: true,
        schoolId: true,
        type: true,
        status: true,
        reportJson: true,
      },
    },
  });

export type StudentBulkRegistrationExecutionRowCounts = Record<
  StudentBulkRegistrationRowStatus,
  number
>;

export type StudentBulkRegistrationExecutionRecoveryCandidate =
  Prisma.StudentBulkRegistrationBatchGetPayload<{
    select: typeof EXECUTION_RECOVERY_BATCH_SELECT;
  }> & {
    rowCounts: StudentBulkRegistrationExecutionRowCounts;
    rowSchoolMismatch: boolean;
  };

export type StudentBulkRegistrationProvisioningResult =
  | {
      kind: 'created';
      rowId: string;
      studentId: string;
      userId: string;
      enrollmentId: string;
    }
  | { kind: 'not_required'; rowId: string };

@Injectable()
export class StudentBulkRegistrationExecutionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async claimExecution(input: {
    batchId: string;
    schoolId: string;
    organizationId: string;
    sourceImportJobId: string;
    reportJson: Prisma.InputJsonValue;
    actorId: string;
    actorUserType: UserType;
    validRows: number;
    academicYearId: string;
    classroomId: string;
    startedAt: Date;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.studentBulkRegistrationBatch.updateMany({
        where: {
          id: input.batchId,
          schoolId: input.schoolId,
          organizationId: input.organizationId,
          sourceImportJobId: input.sourceImportJobId,
          status: StudentBulkRegistrationBatchStatus.READY,
        },
        data: {
          status: StudentBulkRegistrationBatchStatus.EXECUTING,
          startedAt: input.startedAt,
          completedAt: null,
        },
      });
      if (claimed.count !== 1) return false;

      const importJobUpdated = await tx.importJob.updateMany({
        where: {
          id: input.sourceImportJobId,
          schoolId: input.schoolId,
          status: ImportJobStatus.COMPLETED,
        },
        data: { reportJson: input.reportJson },
      });
      if (importJobUpdated.count !== 1) {
        throw new StudentBulkRegistrationExecutionInvariantException({
          field: 'sourceImportJob',
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          userType: input.actorUserType,
          organizationId: input.organizationId,
          schoolId: input.schoolId,
          module: 'students',
          action: 'students.bulk_registration.confirm',
          resourceType: 'student_bulk_registration_batch',
          resourceId: input.batchId,
          outcome: AuditOutcome.SUCCESS,
          after: {
            status: StudentBulkRegistrationBatchStatus.EXECUTING,
            validRows: input.validRows,
            academicYearId: input.academicYearId,
            classroomId: input.classroomId,
          },
        },
      });

      return true;
    });
  }

  findExecutionBatchById(
    batchId: string,
  ): Promise<StudentBulkRegistrationExecutionBatch | null> {
    return this.prisma.studentBulkRegistrationBatch.findUnique({
      where: { id: batchId },
      select: EXECUTION_BATCH_SELECT,
    });
  }

  async listExecutionRecoveryCandidates(input: {
    createdBefore: Date;
    cursor?: { createdAt: Date; id: string };
    limit: number;
  }): Promise<StudentBulkRegistrationExecutionRecoveryCandidate[]> {
    const batches = await this.prisma.studentBulkRegistrationBatch.findMany({
      where: {
        status: StudentBulkRegistrationBatchStatus.EXECUTING,
        createdAt: { lte: input.createdBefore },
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
      select: EXECUTION_RECOVERY_BATCH_SELECT,
    });
    if (batches.length === 0) return [];

    const groupedRows = await this.prisma.studentBulkRegistrationRow.groupBy({
      by: ['batchId', 'schoolId', 'status'],
      where: { batchId: { in: batches.map((batch) => batch.id) } },
      _count: { _all: true },
    });
    const counts = new Map<
      string,
      {
        rowCounts: StudentBulkRegistrationExecutionRowCounts;
        rowSchoolMismatch: boolean;
      }
    >();
    const schoolIdByBatchId = new Map(
      batches.map((batch) => [batch.id, batch.schoolId]),
    );
    for (const batch of batches) {
      counts.set(batch.id, {
        rowCounts: emptyExecutionRowCounts(),
        rowSchoolMismatch: false,
      });
    }
    for (const row of groupedRows) {
      const aggregate = counts.get(row.batchId);
      if (!aggregate) continue;
      aggregate.rowCounts[row.status] += row._count._all;
      if (row.schoolId !== schoolIdByBatchId.get(row.batchId)) {
        aggregate.rowSchoolMismatch = true;
      }
    }

    return batches.map((batch) => ({
      ...batch,
      ...(counts.get(batch.id) ?? {
        rowCounts: emptyExecutionRowCounts(),
        rowSchoolMismatch: false,
      }),
    }));
  }

  async listValidRowIds(input: {
    batchId: string;
    schoolId: string;
  }): Promise<string[]> {
    const rows = await this.prisma.studentBulkRegistrationRow.findMany({
      where: {
        batchId: input.batchId,
        schoolId: input.schoolId,
        status: StudentBulkRegistrationRowStatus.VALID,
      },
      orderBy: { rowNumber: 'asc' },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async provisionRow(input: {
    batchId: string;
    schoolId: string;
    rowId: string;
  }): Promise<StudentBulkRegistrationProvisioningResult> {
    for (
      let attempt = 1;
      attempt <= STUDENT_BULK_REGISTRATION_TRANSACTION_MAX_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await this.prisma.$transaction(
          (tx) => this.provisionRowInTransaction(tx, input),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (
          isPrismaErrorCode(error, 'P2034') &&
          attempt < STUDENT_BULK_REGISTRATION_TRANSACTION_MAX_ATTEMPTS
        ) {
          continue;
        }
        if (isUserEmailUniqueConflict(error)) {
          throw new LoginEmailTakenException('redacted');
        }
        throw error;
      }
    }

    throw new Error('bulk_registration_serialization_retry_exhausted');
  }

  async markRowFailed(input: {
    batchId: string;
    schoolId: string;
    rowId: string;
    error: StudentBulkRegistrationRowError;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const rowUpdated = await tx.studentBulkRegistrationRow.updateMany({
        where: {
          id: input.rowId,
          batchId: input.batchId,
          schoolId: input.schoolId,
          status: StudentBulkRegistrationRowStatus.VALID,
        },
        data: {
          status: StudentBulkRegistrationRowStatus.FAILED,
          errorsJson: [input.error] as unknown as Prisma.InputJsonValue,
        },
      });
      if (rowUpdated.count !== 1) return false;

      const batchUpdated = await tx.studentBulkRegistrationBatch.updateMany({
        where: {
          id: input.batchId,
          schoolId: input.schoolId,
          status: StudentBulkRegistrationBatchStatus.EXECUTING,
        },
        data: { failedRows: { increment: 1 } },
      });
      if (batchUpdated.count !== 1) {
        throw new StudentBulkRegistrationExecutionInvariantException({
          field: 'batchStatus',
        });
      }
      return true;
    });
  }

  async terminalizeRemainingValidRows(input: {
    batchId: string;
    schoolId: string;
    reasonCode:
      | typeof STUDENT_BULK_REGISTRATION_EXECUTION_RECOVERY_WINDOW_EXPIRED_CODE
      | typeof STUDENT_BULK_REGISTRATION_EXECUTION_TENANT_INELIGIBLE_CODE;
  }): Promise<number> {
    for (
      let attempt = 1;
      attempt <= STUDENT_BULK_REGISTRATION_TRANSACTION_MAX_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const batch = await tx.studentBulkRegistrationBatch.findFirst({
              where: {
                id: input.batchId,
                schoolId: input.schoolId,
                status: StudentBulkRegistrationBatchStatus.EXECUTING,
              },
              select: EXECUTION_BATCH_SELECT,
            });
            if (!batch) return 0;
            const metadata = requireExecutionMetadata(batch);
            const rows = await tx.studentBulkRegistrationRow.updateMany({
              where: {
                batchId: input.batchId,
                schoolId: input.schoolId,
                status: StudentBulkRegistrationRowStatus.VALID,
              },
              data: {
                status: StudentBulkRegistrationRowStatus.FAILED,
                errorsJson: [
                  { code: input.reasonCode, field: null },
                ] as unknown as Prisma.InputJsonValue,
              },
            });
            if (rows.count === 0) return 0;

            const updated = await tx.studentBulkRegistrationBatch.updateMany({
              where: {
                id: batch.id,
                schoolId: batch.schoolId,
                status: StudentBulkRegistrationBatchStatus.EXECUTING,
              },
              data: { failedRows: { increment: rows.count } },
            });
            if (updated.count !== 1) {
              throw new StudentBulkRegistrationExecutionInvariantException({
                field: 'batchStatus',
              });
            }
            await tx.auditLog.create({
              data: {
                actorId: metadata.requestedById,
                userType: metadata.requestedByUserType,
                organizationId: batch.organizationId,
                schoolId: batch.schoolId,
                module: 'students',
                action:
                  'students.bulk_registration.execution_recovery_terminalize',
                resourceType: 'student_bulk_registration_batch',
                resourceId: batch.id,
                outcome: AuditOutcome.SUCCESS,
                after: {
                  reasonCode: input.reasonCode,
                  terminalizedRows: rows.count,
                },
              },
            });
            return rows.count;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (
          isPrismaErrorCode(error, 'P2034') &&
          attempt < STUDENT_BULK_REGISTRATION_TRANSACTION_MAX_ATTEMPTS
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new Error('bulk_registration_serialization_retry_exhausted');
  }

  async finalizeExecution(input: {
    batchId: string;
    schoolId: string;
  }): Promise<
    | { terminal: false }
    | {
        terminal: true;
        status: StudentBulkRegistrationBatchStatus;
        createdRows: number;
        failedRows: number;
      }
  > {
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.studentBulkRegistrationBatch.findFirst({
        where: {
          id: input.batchId,
          schoolId: input.schoolId,
          status: StudentBulkRegistrationBatchStatus.EXECUTING,
        },
        select: EXECUTION_BATCH_SELECT,
      });
      if (!batch) return { terminal: false } as const;
      const metadata = requireExecutionMetadata(batch);

      const [validRows, processingRows, createdRows, failedRows, otherRows] =
        await Promise.all([
          countRows(tx, input, StudentBulkRegistrationRowStatus.VALID),
          countRows(tx, input, StudentBulkRegistrationRowStatus.PROCESSING),
          countRows(tx, input, StudentBulkRegistrationRowStatus.CREATED),
          countRows(tx, input, StudentBulkRegistrationRowStatus.FAILED),
          tx.studentBulkRegistrationRow.count({
            where: {
              batchId: input.batchId,
              schoolId: input.schoolId,
              status: {
                in: [
                  StudentBulkRegistrationRowStatus.PENDING,
                  StudentBulkRegistrationRowStatus.INVALID,
                ],
              },
            },
          }),
        ]);

      if (validRows > 0 || processingRows > 0) return { terminal: false };
      if (
        otherRows > 0 ||
        createdRows + failedRows !== batch.validRows ||
        batch.validRows !== batch.totalRows ||
        batch.invalidRows !== 0
      ) {
        throw new StudentBulkRegistrationExecutionInvariantException({
          field: 'rowCounts',
        });
      }

      const status =
        createdRows > 0 && failedRows === 0
          ? StudentBulkRegistrationBatchStatus.COMPLETED
          : createdRows > 0
            ? StudentBulkRegistrationBatchStatus.EXECUTION_PARTIAL_FAILED
            : StudentBulkRegistrationBatchStatus.FAILED;
      const completedAt = new Date();
      const updated = await tx.studentBulkRegistrationBatch.updateMany({
        where: {
          id: input.batchId,
          schoolId: input.schoolId,
          status: StudentBulkRegistrationBatchStatus.EXECUTING,
        },
        data: { status, createdRows, failedRows, completedAt },
      });
      if (updated.count !== 1) return { terminal: false };

      await tx.auditLog.create({
        data: {
          actorId: metadata.requestedById,
          userType: metadata.requestedByUserType,
          organizationId: batch.organizationId,
          schoolId: batch.schoolId,
          module: 'students',
          action: 'students.bulk_registration.execute',
          resourceType: 'student_bulk_registration_batch',
          resourceId: batch.id,
          outcome: AuditOutcome.SUCCESS,
          after: { status, createdRows, failedRows },
        },
      });

      return { terminal: true, status, createdRows, failedRows };
    });
  }

  private async provisionRowInTransaction(
    tx: Prisma.TransactionClient,
    input: { batchId: string; schoolId: string; rowId: string },
  ): Promise<StudentBulkRegistrationProvisioningResult> {
    const batch = await tx.studentBulkRegistrationBatch.findFirst({
      where: {
        id: input.batchId,
        schoolId: input.schoolId,
        status: StudentBulkRegistrationBatchStatus.EXECUTING,
      },
      select: EXECUTION_BATCH_SELECT,
    });
    if (!batch) return { kind: 'not_required', rowId: input.rowId };
    const metadata = requireExecutionMetadata(batch);

    const claimed = await tx.studentBulkRegistrationRow.updateMany({
      where: {
        id: input.rowId,
        batchId: input.batchId,
        schoolId: input.schoolId,
        status: StudentBulkRegistrationRowStatus.VALID,
      },
      data: { status: StudentBulkRegistrationRowStatus.PROCESSING },
    });
    if (claimed.count !== 1) {
      return { kind: 'not_required', rowId: input.rowId };
    }

    const row = await tx.studentBulkRegistrationRow.findFirstOrThrow({
      where: {
        id: input.rowId,
        batchId: input.batchId,
        schoolId: input.schoolId,
      },
      select: { id: true, normalizedDataJson: true },
    });
    if (!isStudentBulkRegistrationNormalizedData(row.normalizedDataJson)) {
      throw new StudentBulkRegistrationRowDataInvalidException();
    }
    const normalizedData = row.normalizedDataJson;

    await assertExecutionTenantEligible(tx, batch);
    await assertFinalPlacement(tx, batch);
    const role = await tx.role.findFirst({
      where: {
        id: metadata.studentRoleId,
        key: 'student',
        deletedAt: null,
        OR: [{ schoolId: batch.schoolId }, { schoolId: null, isSystem: true }],
      },
      select: { id: true },
    });
    if (!role) {
      throw new StudentRoleMissingException({
        roleId: metadata.studentRoleId,
      });
    }

    const username = normalizeUsername(normalizedData.username);
    const loginEmail = buildLoginEmail(username, metadata.loginDomain);
    const emailOwner = await tx.user.findFirst({
      where: {
        email: { equals: loginEmail, mode: Prisma.QueryMode.insensitive },
        deletedAt: null,
      },
      select: { id: true },
    });
    if (emailOwner) throw new LoginEmailTakenException(loginEmail);

    await assertFinalCapacity(tx, batch);
    const names = resolveStudentName(toStudentNameFields(normalizedData));
    const profile = resolveStudentProfileFields(
      toStudentProfileFields(normalizedData),
    );
    const birthDate = resolveStudentBirthDate(normalizedData.dateOfBirth);
    const contactEmail = normalizedData.contactEmail
      ? normalizeContactEmail(normalizedData.contactEmail)
      : null;

    const user = await tx.user.create({
      data: {
        email: loginEmail,
        username,
        contactEmail,
        phone: null,
        firstName: names.firstName,
        lastName: names.lastName,
        userType: UserType.STUDENT,
        status: UserStatus.ACTIVE,
        passwordHash: null,
        mustChangePassword: false,
        passwordProvisionedAt: null,
        passwordChangedAt: null,
        credentialVersion: 0,
      },
      select: { id: true },
    });
    await tx.membership.create({
      data: {
        userId: user.id,
        organizationId: batch.organizationId,
        schoolId: batch.schoolId,
        roleId: role.id,
        userType: UserType.STUDENT,
        status: MembershipStatus.ACTIVE,
      },
      select: { id: true },
    });
    const student = await tx.student.create({
      data: {
        schoolId: batch.schoolId,
        organizationId: batch.organizationId,
        applicationId: null,
        userId: user.id,
        firstName: names.firstName,
        lastName: names.lastName,
        fatherNameEn: profile.fatherNameEn,
        grandfatherNameEn: profile.grandfatherNameEn,
        firstNameAr: profile.firstNameAr,
        fatherNameAr: profile.fatherNameAr,
        grandfatherNameAr: profile.grandfatherNameAr,
        familyNameAr: profile.familyNameAr,
        birthDate,
        gender: profile.gender,
        nationality: profile.nationality,
        addressLine: profile.addressLine,
        city: profile.city,
        district: profile.district,
        studentPhone: profile.studentPhone,
        studentEmail: contactEmail,
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    const enrollment = await tx.enrollment.create({
      data: {
        schoolId: batch.schoolId,
        studentId: student.id,
        academicYearId: batch.academicYearId,
        termId: batch.termId,
        classroomId: batch.classroomId,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: batch.enrollmentDate,
        endedAt: null,
        exitReason: null,
      },
      select: { id: true },
    });

    await tx.auditLog.create({
      data: {
        actorId: metadata.requestedById,
        userType: metadata.requestedByUserType,
        organizationId: batch.organizationId,
        schoolId: batch.schoolId,
        module: 'students',
        action: 'students.bulk_registration.row_provisioned',
        resourceType: 'student',
        resourceId: student.id,
        outcome: AuditOutcome.SUCCESS,
        after: {
          batchId: batch.id,
          rowId: row.id,
          userId: user.id,
          enrollmentId: enrollment.id,
          academicYearId: batch.academicYearId,
          classroomId: batch.classroomId,
        },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: metadata.requestedById,
        userType: metadata.requestedByUserType,
        organizationId: batch.organizationId,
        schoolId: batch.schoolId,
        module: 'students',
        action: 'students.account.create',
        resourceType: 'student',
        resourceId: student.id,
        outcome: AuditOutcome.SUCCESS,
        after: { userId: user.id, generatedCredential: false },
      },
    });

    const rowUpdated = await tx.studentBulkRegistrationRow.updateMany({
      where: {
        id: row.id,
        batchId: batch.id,
        schoolId: batch.schoolId,
        status: StudentBulkRegistrationRowStatus.PROCESSING,
      },
      data: {
        status: StudentBulkRegistrationRowStatus.CREATED,
        errorsJson: Prisma.DbNull,
        studentId: student.id,
        userId: user.id,
        enrollmentId: enrollment.id,
      },
    });
    if (rowUpdated.count !== 1) {
      throw new StudentBulkRegistrationExecutionInvariantException({
        field: 'rowStatus',
      });
    }
    const batchUpdated = await tx.studentBulkRegistrationBatch.updateMany({
      where: {
        id: batch.id,
        schoolId: batch.schoolId,
        status: StudentBulkRegistrationBatchStatus.EXECUTING,
      },
      data: { createdRows: { increment: 1 } },
    });
    if (batchUpdated.count !== 1) {
      throw new StudentBulkRegistrationExecutionInvariantException({
        field: 'batchStatus',
      });
    }

    return {
      kind: 'created',
      rowId: row.id,
      studentId: student.id,
      userId: user.id,
      enrollmentId: enrollment.id,
    };
  }
}

async function assertFinalPlacement(
  tx: Prisma.TransactionClient,
  batch: StudentBulkRegistrationExecutionBatch,
): Promise<void> {
  const academicYear = await tx.academicYear.findFirst({
    where: {
      id: batch.academicYearId,
      schoolId: batch.schoolId,
      deletedAt: null,
    },
    select: { id: true, isActive: true },
  });
  if (!academicYear?.isActive) {
    throw new StudentEnrollmentInactiveYearException({
      academicYearId: batch.academicYearId,
    });
  }
  if (batch.termId) {
    const term = await tx.term.findFirst({
      where: { id: batch.termId, schoolId: batch.schoolId, deletedAt: null },
      select: { academicYearId: true },
    });
    if (!term || term.academicYearId !== batch.academicYearId) {
      throw new StudentBulkRegistrationPlacementInvalidException('termId');
    }
  }
}

async function assertExecutionTenantEligible(
  tx: Prisma.TransactionClient,
  batch: StudentBulkRegistrationExecutionBatch,
): Promise<void> {
  const school = await tx.school.findUnique({
    where: { id: batch.schoolId },
    select: {
      id: true,
      organizationId: true,
      status: true,
      deletedAt: true,
      organization: {
        select: { id: true, status: true, deletedAt: true },
      },
    },
  });
  if (
    !school ||
    school.id !== batch.schoolId ||
    school.organizationId !== batch.organizationId ||
    school.organization.id !== batch.organizationId
  ) {
    throw new StudentBulkRegistrationExecutionInvariantException({
      field: 'tenantIdentity',
    });
  }
  if (
    school.status !== SchoolStatus.ACTIVE ||
    school.deletedAt !== null ||
    school.organization.status !== OrganizationStatus.ACTIVE ||
    school.organization.deletedAt !== null
  ) {
    throw new StudentBulkRegistrationExecutionTenantIneligibleException();
  }
}

async function assertFinalCapacity(
  tx: Prisma.TransactionClient,
  batch: StudentBulkRegistrationExecutionBatch,
): Promise<void> {
  const [entitlement, activeSeats, classroom] = await Promise.all([
    tx.schoolEntitlement.findFirst({
      where: { schoolId: batch.schoolId },
      select: { studentSeatLimit: true },
    }),
    tx.enrollment.findMany({
      where: buildActiveStudentSeatWhere({ schoolId: batch.schoolId }),
      distinct: ['studentId'],
      select: { studentId: true },
    }),
    tx.classroom.findFirst({
      where: {
        id: batch.classroomId,
        schoolId: batch.schoolId,
        deletedAt: null,
      },
      select: { id: true, capacity: true },
    }),
  ]);
  if (!classroom) {
    throw new StudentBulkRegistrationPlacementInvalidException('classroomId');
  }
  assertStudentSeatLimitSnapshot({
    schoolId: batch.schoolId,
    reason: 'bulk_registration_execution',
    limit: entitlement?.studentSeatLimit ?? null,
    used: activeSeats.length,
    incrementBy: 1,
    existingStudentHasSeat: false,
  });
  const activeCount = await tx.enrollment.count({
    where: {
      schoolId: batch.schoolId,
      academicYearId: batch.academicYearId,
      classroomId: batch.classroomId,
      status: StudentEnrollmentStatus.ACTIVE,
      deletedAt: null,
    },
  });
  assertStudentPlacementCapacitySnapshot({
    academicYearId: batch.academicYearId,
    classroomId: batch.classroomId,
    capacity: classroom.capacity,
    activeCount,
    incrementBy: 1,
  });
}

function requireExecutionMetadata(
  batch: StudentBulkRegistrationExecutionBatch,
) {
  if (
    batch.sourceImportJob.id !== batch.sourceImportJobId ||
    batch.sourceImportJob.schoolId !== batch.schoolId ||
    batch.sourceImportJob.type !== STUDENTS_BULK_REGISTRATION_IMPORT_TYPE ||
    batch.sourceImportJob.status !== ImportJobStatus.COMPLETED ||
    batch.school.organizationId !== batch.organizationId
  ) {
    throw new StudentBulkRegistrationExecutionInvariantException();
  }
  const metadata = readStudentBulkRegistrationExecutionMetadata(
    batch.sourceImportJob.reportJson,
  );
  if (!metadata) throw new StudentBulkRegistrationExecutionMetadataException();
  return metadata;
}

function toStudentNameFields(data: StudentBulkRegistrationNormalizedData) {
  return {
    first_name_en: data.firstNameEn,
    father_name_en: data.fatherNameEn,
    grandfather_name_en: data.grandfatherNameEn,
    family_name_en: data.familyNameEn,
    first_name_ar: data.firstNameAr,
    father_name_ar: data.fatherNameAr,
    grandfather_name_ar: data.grandfatherNameAr,
    family_name_ar: data.familyNameAr,
  };
}

function toStudentProfileFields(data: StudentBulkRegistrationNormalizedData) {
  return {
    ...toStudentNameFields(data),
    gender: data.gender,
    nationality: data.nationality,
    contact: {
      student_phone: data.studentPhone,
      student_email: data.contactEmail,
    },
  };
}

function countRows(
  tx: Prisma.TransactionClient,
  input: { batchId: string; schoolId: string },
  status: StudentBulkRegistrationRowStatus,
): Promise<number> {
  return tx.studentBulkRegistrationRow.count({
    where: { batchId: input.batchId, schoolId: input.schoolId, status },
  });
}

function emptyExecutionRowCounts(): StudentBulkRegistrationExecutionRowCounts {
  return {
    [StudentBulkRegistrationRowStatus.PENDING]: 0,
    [StudentBulkRegistrationRowStatus.VALID]: 0,
    [StudentBulkRegistrationRowStatus.INVALID]: 0,
    [StudentBulkRegistrationRowStatus.PROCESSING]: 0,
    [StudentBulkRegistrationRowStatus.CREATED]: 0,
    [StudentBulkRegistrationRowStatus.FAILED]: 0,
  };
}

function isPrismaErrorCode(error: unknown, code: string): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === code,
  );
}

function isUserEmailUniqueConflict(error: unknown): boolean {
  if (
    !isPrismaErrorCode(error, 'P2002') ||
    !error ||
    typeof error !== 'object'
  ) {
    return false;
  }
  const meta = 'meta' in error ? (error.meta as Record<string, unknown>) : null;
  const target = meta?.target;
  return (
    meta?.modelName === 'User' &&
    ((Array.isArray(target) && target.includes('email')) ||
      (typeof target === 'string' && target.toLowerCase().includes('email')))
  );
}
