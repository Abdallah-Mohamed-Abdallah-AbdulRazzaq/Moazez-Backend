import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  FileVisibility,
  MembershipStatus,
  OrganizationStatus,
  Prisma,
  SchoolStatus,
  StudentBulkRegistrationBatchStatus,
  StudentBulkRegistrationRowStatus,
  StudentCredentialAudienceMode,
  StudentCredentialBatchStatus,
  StudentCredentialMode,
  StudentCredentialRowStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { StudentsScope } from '../../students/domain/students-scope';
import {
  StudentCredentialAudienceInvalidException,
  StudentCredentialExecutionInvariantException,
  StudentCredentialExecutionTenantIneligibleException,
  StudentCredentialSecretArtifactException,
} from '../domain/student-credential.exceptions';
import {
  STUDENT_CREDENTIAL_SECRET_ARTIFACT_EXPIRED_CODE,
  STUDENT_CREDENTIAL_SECRET_ARTIFACT_INVALID_CODE,
} from '../domain/student-credential.constants';
import type { StudentCredentialAudienceSelection } from '../domain/student-credential.types';

const API_BATCH_ARGS =
  Prisma.validator<Prisma.StudentCredentialBatchDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      organizationId: true,
      audienceMode: true,
      credentialMode: true,
      sourceRegistrationBatchId: true,
      academicYearId: true,
      stageId: true,
      gradeId: true,
      sectionId: true,
      classroomId: true,
      status: true,
      totalRows: true,
      generatedRows: true,
      skippedRows: true,
      failedRows: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,
      startedAt: true,
      completedAt: true,
    },
  });

export type StudentCredentialBatchRecord =
  Prisma.StudentCredentialBatchGetPayload<typeof API_BATCH_ARGS>;

const EXECUTION_BATCH_SELECT =
  Prisma.validator<Prisma.StudentCredentialBatchSelect>()({
    ...API_BATCH_ARGS.select,
    secretArtifactFileId: true,
    secretArtifactVersion: true,
    secretArtifactStagedAt: true,
    secretArtifactExpiresAt: true,
    createdBy: { select: { userType: true } },
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
    secretArtifactFile: {
      select: {
        id: true,
        schoolId: true,
        organizationId: true,
        uploaderId: true,
        bucket: true,
        objectKey: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        checksumSha256: true,
        visibility: true,
        deletedAt: true,
      },
    },
  });

export type StudentCredentialExecutionBatch =
  Prisma.StudentCredentialBatchGetPayload<{
    select: typeof EXECUTION_BATCH_SELECT;
  }>;

const EXECUTION_ROW_SELECT =
  Prisma.validator<Prisma.StudentCredentialRowSelect>()({
    id: true,
    schoolId: true,
    batchId: true,
    studentId: true,
    userId: true,
    enrollmentId: true,
    status: true,
    credentialVersionBefore: true,
    credentialVersionAfter: true,
    generatedAt: true,
  });

export type StudentCredentialExecutionRow =
  Prisma.StudentCredentialRowGetPayload<{
    select: typeof EXECUTION_ROW_SELECT;
  }>;

const AUDIENCE_STUDENT_SELECT = Prisma.validator<Prisma.StudentSelect>()({
  id: true,
  schoolId: true,
  organizationId: true,
  userId: true,
  firstName: true,
  lastName: true,
  status: true,
  deletedAt: true,
  user: {
    select: {
      id: true,
      email: true,
      username: true,
      passwordHash: true,
      mustChangePassword: true,
      credentialVersion: true,
      userType: true,
      status: true,
      deletedAt: true,
      memberships: {
        select: {
          id: true,
          schoolId: true,
          organizationId: true,
          userType: true,
          status: true,
          deletedAt: true,
        },
      },
    },
  },
});

export type StudentCredentialAudienceStudent = Prisma.StudentGetPayload<{
  select: typeof AUDIENCE_STUDENT_SELECT;
}>;

export interface StudentCredentialAudienceQueryResult {
  students: StudentCredentialAudienceStudent[];
  totalMatched: number;
  missingSelectedStudents: number;
  references: ReadonlyMap<string, StudentCredentialAudienceReference>;
}

export interface StudentCredentialAudienceReference {
  studentId: string;
  expectedUserId: string | null;
  enrollmentId: string | null;
}

export type StudentCredentialRowCounts = Record<
  StudentCredentialRowStatus,
  number
>;

export interface StudentCredentialRecoveryCandidate extends StudentCredentialExecutionBatch {
  rowCounts: StudentCredentialRowCounts;
  rowSchoolMismatch: boolean;
}

export interface StudentCredentialExportRow {
  id: string;
  schoolId: string;
  batchId: string;
  studentId: string;
  userId: string | null;
  status: StudentCredentialRowStatus;
  credentialVersionAfter: number | null;
  generatedAt: Date | null;
  createdAt: Date;
  student: {
    id: string;
    schoolId: string;
    organizationId: string;
    userId: string | null;
    firstName: string;
    lastName: string;
    status: StudentStatus;
    deletedAt: Date | null;
  };
  user: {
    id: string;
    email: string;
    username: string | null;
    passwordHash: string | null;
    mustChangePassword: boolean;
    passwordProvisionedAt: Date | null;
    credentialVersion: number;
    userType: UserType;
    status: UserStatus;
    deletedAt: Date | null;
    memberships: Array<{
      schoolId: string | null;
      organizationId: string;
      userType: UserType;
      status: MembershipStatus;
      deletedAt: Date | null;
    }>;
  } | null;
}

export type StudentCredentialSecretArtifactCleanupCandidate =
  StudentCredentialExecutionBatch;

export type ApplyStudentCredentialRowResult =
  | { kind: 'generated'; credentialVersionAfter: number }
  | { kind: 'skipped'; reasonCode: string }
  | { kind: 'not_required' };

interface ApplyStudentCredentialRowInput {
  batchId: string;
  schoolId: string;
  rowId: string;
  artifactFileId: string;
  artifactVersion: number;
  artifactEntry: {
    rowId: string;
    studentId: string;
    userId: string;
  };
  passwordHash: string;
  generatedAt: Date;
}

const STUDENT_CREDENTIAL_TRANSACTION_MAX_ATTEMPTS = 3;

export interface StudentCredentialRecoveryPage {
  candidates: StudentCredentialRecoveryCandidate[];
}

@Injectable()
export class StudentCredentialBatchRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async resolveAudienceCandidates(
    scope: StudentsScope,
    selection: StudentCredentialAudienceSelection,
  ): Promise<StudentCredentialAudienceQueryResult> {
    const references = await this.resolveAudienceReferences(scope, selection);
    const ids = [...references.keys()];
    const students = await this.scopedPrisma.student.findMany({
      where:
        selection.audienceMode ===
          StudentCredentialAudienceMode.MISSING_PASSWORD && ids.length === 0
          ? {}
          : { id: { in: ids } },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { id: 'asc' }],
      select: AUDIENCE_STUDENT_SELECT,
    });

    if (
      selection.audienceMode ===
        StudentCredentialAudienceMode.SELECTED_STUDENTS ||
      selection.audienceMode === StudentCredentialAudienceMode.MISSING_PASSWORD
    ) {
      const currentEnrollmentIds =
        await this.resolveOptionalCurrentEnrollmentIds(
          students.map((student) => student.id),
        );
      for (const student of students) {
        const reference = references.get(student.id);
        references.set(student.id, {
          studentId: student.id,
          expectedUserId: reference?.expectedUserId ?? null,
          enrollmentId: currentEnrollmentIds.get(student.id) ?? null,
        });
      }
    }

    const totalMatched =
      selection.audienceMode === StudentCredentialAudienceMode.MISSING_PASSWORD
        ? students.length
        : references.size;
    const missingSelectedStudents =
      selection.audienceMode === StudentCredentialAudienceMode.SELECTED_STUDENTS
        ? Math.max(0, references.size - students.length)
        : 0;

    return {
      students,
      totalMatched,
      missingSelectedStudents,
      references,
    };
  }

  async createBatch(input: {
    scope: StudentsScope;
    selection: StudentCredentialAudienceSelection;
    credentialMode: StudentCredentialMode;
    targets: Array<{
      studentId: string;
      userId: string;
      enrollmentId: string | null;
      credentialVersion: number;
    }>;
  }): Promise<StudentCredentialBatchRecord> {
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.studentCredentialBatch.create({
        data: {
          schoolId: input.scope.schoolId,
          organizationId: input.scope.organizationId,
          audienceMode: input.selection.audienceMode,
          credentialMode: input.credentialMode,
          sourceRegistrationBatchId: input.selection.sourceRegistrationBatchId,
          academicYearId: input.selection.academicYearId,
          stageId: input.selection.stageId,
          gradeId: input.selection.gradeId,
          sectionId: input.selection.sectionId,
          classroomId: input.selection.classroomId,
          status: StudentCredentialBatchStatus.PENDING,
          totalRows: input.targets.length,
          generatedRows: 0,
          skippedRows: 0,
          failedRows: 0,
          createdById: input.scope.actorId,
          rows: {
            createMany: {
              data: input.targets.map((target) => ({
                studentId: target.studentId,
                userId: target.userId,
                enrollmentId: target.enrollmentId,
                status: StudentCredentialRowStatus.PENDING,
                credentialVersionBefore: target.credentialVersion,
                credentialVersionAfter: null,
                generatedAt: null,
              })),
            },
          },
        },
        ...API_BATCH_ARGS,
      });

      await tx.auditLog.create({
        data: {
          actorId: input.scope.actorId,
          userType: input.scope.userType,
          organizationId: input.scope.organizationId,
          schoolId: input.scope.schoolId,
          module: 'iam',
          action: 'iam.credentials.student_batch.create',
          resourceType: 'student_credential_batch',
          resourceId: batch.id,
          outcome: AuditOutcome.SUCCESS,
          after: {
            audienceMode: input.selection.audienceMode,
            credentialMode: input.credentialMode,
            totalRows: input.targets.length,
          },
        },
      });
      return batch;
    });
  }

  findScopedBatchById(
    batchId: string,
  ): Promise<StudentCredentialBatchRecord | null> {
    return this.scopedPrisma.studentCredentialBatch.findFirst({
      where: { id: batchId },
      ...API_BATCH_ARGS,
    });
  }

  findScopedExecutionBatchById(
    batchId: string,
  ): Promise<StudentCredentialExecutionBatch | null> {
    return this.scopedPrisma.studentCredentialBatch.findFirst({
      where: { id: batchId },
      select: EXECUTION_BATCH_SELECT,
    });
  }

  listGeneratedExportRows(input: {
    batchId: string;
    schoolId: string;
    organizationId: string;
  }): Promise<StudentCredentialExportRow[]> {
    return this.scopedPrisma.studentCredentialRow.findMany({
      where: {
        batchId: input.batchId,
        schoolId: input.schoolId,
        status: StudentCredentialRowStatus.GENERATED,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        schoolId: true,
        batchId: true,
        studentId: true,
        userId: true,
        status: true,
        credentialVersionAfter: true,
        generatedAt: true,
        createdAt: true,
        student: {
          select: {
            id: true,
            schoolId: true,
            organizationId: true,
            userId: true,
            firstName: true,
            lastName: true,
            status: true,
            deletedAt: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            passwordHash: true,
            mustChangePassword: true,
            passwordProvisionedAt: true,
            credentialVersion: true,
            userType: true,
            status: true,
            deletedAt: true,
            memberships: {
              where: {
                schoolId: input.schoolId,
                organizationId: input.organizationId,
                userType: UserType.STUDENT,
                status: MembershipStatus.ACTIVE,
                deletedAt: null,
              },
              select: {
                schoolId: true,
                organizationId: true,
                userType: true,
                status: true,
                deletedAt: true,
              },
            },
          },
        },
      },
    });
  }

  async recordExportAudit(input: {
    scope: StudentsScope;
    batchId: string;
    generatedRows: number;
    temporaryCredentialsExported: number;
    credentialChangedRows: number;
    accountIneligibleRows: number;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: input.scope.actorId,
        userType: input.scope.userType,
        organizationId: input.scope.organizationId,
        schoolId: input.scope.schoolId,
        module: 'iam',
        action: 'iam.credentials.student_batch.export',
        resourceType: 'student_credential_batch',
        resourceId: input.batchId,
        outcome: AuditOutcome.SUCCESS,
        after: {
          generatedRows: input.generatedRows,
          temporaryCredentialsExported: input.temporaryCredentialsExported,
          credentialChangedRows: input.credentialChangedRows,
          accountIneligibleRows: input.accountIneligibleRows,
        },
      },
    });
  }

  findExecutionBatchById(
    batchId: string,
  ): Promise<StudentCredentialExecutionBatch | null> {
    return this.prisma.studentCredentialBatch.findUnique({
      where: { id: batchId },
      select: EXECUTION_BATCH_SELECT,
    });
  }

  listExecutionRows(input: {
    batchId: string;
    schoolId: string;
  }): Promise<StudentCredentialExecutionRow[]> {
    return this.prisma.studentCredentialRow.findMany({
      where: { batchId: input.batchId, schoolId: input.schoolId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: EXECUTION_ROW_SELECT,
    });
  }

  async claimBatch(input: {
    batchId: string;
    schoolId: string;
    startedAt: Date;
  }): Promise<boolean> {
    const claimed = await this.prisma.studentCredentialBatch.updateMany({
      where: {
        id: input.batchId,
        schoolId: input.schoolId,
        status: StudentCredentialBatchStatus.PENDING,
        startedAt: null,
      },
      data: {
        status: StudentCredentialBatchStatus.PROCESSING,
        startedAt: input.startedAt,
      },
    });
    return claimed.count === 1;
  }

  async attachSecretArtifact(input: {
    batchId: string;
    schoolId: string;
    organizationId: string;
    uploaderId: string;
    bucket: string;
    objectKey: string;
    originalName: string;
    mimeType: string;
    sizeBytes: bigint;
    checksumSha256: string;
    artifactVersion: number;
    stagedAt: Date;
    expiresAt: Date;
  }): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.studentCredentialBatch.findFirst({
        where: {
          id: input.batchId,
          schoolId: input.schoolId,
          organizationId: input.organizationId,
          status: StudentCredentialBatchStatus.PROCESSING,
        },
        select: {
          secretArtifactFileId: true,
          secretArtifactVersion: true,
          secretArtifactStagedAt: true,
          secretArtifactExpiresAt: true,
        },
      });
      if (!batch) {
        throw new StudentCredentialExecutionInvariantException(
          'artifact_batch_not_processing',
        );
      }
      if (batch.secretArtifactFileId) return batch.secretArtifactFileId;
      if (
        batch.secretArtifactVersion !== null ||
        batch.secretArtifactStagedAt !== null ||
        batch.secretArtifactExpiresAt !== null
      ) {
        throw new StudentCredentialExecutionInvariantException(
          'artifact_staging_incomplete',
        );
      }

      const file = await tx.file.create({
        data: {
          schoolId: input.schoolId,
          organizationId: input.organizationId,
          uploaderId: input.uploaderId,
          bucket: input.bucket,
          objectKey: input.objectKey,
          originalName: input.originalName,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          checksumSha256: input.checksumSha256,
          visibility: FileVisibility.PRIVATE,
        },
        select: { id: true },
      });
      const attached = await tx.studentCredentialBatch.updateMany({
        where: {
          id: input.batchId,
          schoolId: input.schoolId,
          organizationId: input.organizationId,
          status: StudentCredentialBatchStatus.PROCESSING,
          secretArtifactFileId: null,
          secretArtifactVersion: null,
          secretArtifactStagedAt: null,
          secretArtifactExpiresAt: null,
        },
        data: {
          secretArtifactFileId: file.id,
          secretArtifactVersion: input.artifactVersion,
          secretArtifactStagedAt: input.stagedAt,
          secretArtifactExpiresAt: input.expiresAt,
        },
      });
      if (attached.count !== 1) {
        throw new StudentCredentialExecutionInvariantException(
          'artifact_attachment_conflict',
        );
      }
      return file.id;
    });
  }

  async applyCredentialRow(
    input: ApplyStudentCredentialRowInput,
  ): Promise<ApplyStudentCredentialRowResult> {
    for (
      let attempt = 1;
      attempt <= STUDENT_CREDENTIAL_TRANSACTION_MAX_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await this.applyCredentialRowOnce(input);
      } catch (error) {
        if (
          isPrismaErrorCode(error, 'P2034') &&
          attempt < STUDENT_CREDENTIAL_TRANSACTION_MAX_ATTEMPTS
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new Error('student_credential_serialization_retry_exhausted');
  }

  private async applyCredentialRowOnce(
    input: ApplyStudentCredentialRowInput,
  ): Promise<ApplyStudentCredentialRowResult> {
    return this.prisma.$transaction(
      async (tx) => {
        const batch = await tx.studentCredentialBatch.findFirst({
          where: {
            id: input.batchId,
            schoolId: input.schoolId,
            status: StudentCredentialBatchStatus.PROCESSING,
            secretArtifactFileId: input.artifactFileId,
            secretArtifactVersion: input.artifactVersion,
          },
          select: {
            id: true,
            schoolId: true,
            organizationId: true,
            audienceMode: true,
            createdById: true,
            createdBy: { select: { userType: true } },
            secretArtifactExpiresAt: true,
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
          },
        });
        if (!batch) {
          throw new StudentCredentialExecutionInvariantException(
            'row_batch_invalid',
          );
        }
        if (
          batch.secretArtifactExpiresAt === null ||
          batch.secretArtifactExpiresAt.getTime() <= input.generatedAt.getTime()
        ) {
          throw new StudentCredentialSecretArtifactException(
            STUDENT_CREDENTIAL_SECRET_ARTIFACT_EXPIRED_CODE,
          );
        }
        if (!isExecutionTenantEligible(batch)) {
          throw new StudentCredentialExecutionTenantIneligibleException();
        }

        const row = await tx.studentCredentialRow.findFirst({
          where: {
            id: input.rowId,
            batchId: input.batchId,
            schoolId: input.schoolId,
          },
          select: EXECUTION_ROW_SELECT,
        });
        if (!row || row.status !== StudentCredentialRowStatus.PENDING) {
          return { kind: 'not_required' } as const;
        }
        if (
          row.id !== input.artifactEntry.rowId ||
          row.studentId !== input.artifactEntry.studentId ||
          row.userId !== input.artifactEntry.userId ||
          row.credentialVersionBefore === null
        ) {
          throw new StudentCredentialSecretArtifactException(
            STUDENT_CREDENTIAL_SECRET_ARTIFACT_INVALID_CODE,
          );
        }
        const claimed = await tx.studentCredentialRow.updateMany({
          where: {
            id: row.id,
            batchId: batch.id,
            schoolId: batch.schoolId,
            status: StudentCredentialRowStatus.PENDING,
          },
          data: { status: StudentCredentialRowStatus.PROCESSING },
        });
        if (claimed.count !== 1) {
          return { kind: 'not_required' } as const;
        }

        const skipReason = await this.resolveCurrentRowSkipReason(tx, {
          batch,
          row,
        });
        if (skipReason) {
          await this.skipRowInTransaction(tx, {
            batch,
            row,
            reasonCode: skipReason,
            occurredAt: input.generatedAt,
          });
          return { kind: 'skipped', reasonCode: skipReason } as const;
        }

        const updatedUser = await tx.user.updateMany({
          where: {
            id: row.userId,
            userType: UserType.STUDENT,
            status: { in: [UserStatus.ACTIVE, UserStatus.INVITED] },
            deletedAt: null,
            credentialVersion: row.credentialVersionBefore,
            ...(batch.audienceMode ===
            StudentCredentialAudienceMode.MISSING_PASSWORD
              ? { passwordHash: null }
              : {}),
          },
          data: {
            passwordHash: input.passwordHash,
            mustChangePassword: true,
            passwordProvisionedAt: input.generatedAt,
            passwordChangedAt: null,
            credentialVersion: { increment: 1 },
          },
        });
        if (updatedUser.count !== 1) {
          await this.skipRowInTransaction(tx, {
            batch,
            row,
            reasonCode: 'students.credentials.credential_version_changed',
            occurredAt: input.generatedAt,
          });
          return {
            kind: 'skipped',
            reasonCode: 'students.credentials.credential_version_changed',
          } as const;
        }

        const credentialVersionAfter = row.credentialVersionBefore + 1;
        await tx.session.updateMany({
          where: { userId: row.userId, revokedAt: null },
          data: { revokedAt: input.generatedAt },
        });
        const updatedRow = await tx.studentCredentialRow.updateMany({
          where: {
            id: row.id,
            batchId: batch.id,
            schoolId: batch.schoolId,
            status: StudentCredentialRowStatus.PROCESSING,
          },
          data: {
            status: StudentCredentialRowStatus.GENERATED,
            credentialVersionAfter,
            generatedAt: input.generatedAt,
            errorsJson: Prisma.DbNull,
          },
        });
        if (updatedRow.count !== 1) {
          throw new StudentCredentialExecutionInvariantException(
            'row_update_conflict',
          );
        }
        const updatedBatch = await tx.studentCredentialBatch.updateMany({
          where: {
            id: batch.id,
            schoolId: batch.schoolId,
            status: StudentCredentialBatchStatus.PROCESSING,
          },
          data: { generatedRows: { increment: 1 } },
        });
        if (updatedBatch.count !== 1) {
          throw new StudentCredentialExecutionInvariantException(
            'batch_counter_conflict',
          );
        }
        await tx.auditLog.create({
          data: {
            actorId: batch.createdById,
            userType: batch.createdBy.userType,
            organizationId: batch.organizationId,
            schoolId: batch.schoolId,
            module: 'iam',
            action: 'iam.credentials.student_batch.row_generated',
            resourceType: 'student_credential_row',
            resourceId: row.id,
            outcome: AuditOutcome.SUCCESS,
            after: {
              batchId: batch.id,
              rowId: row.id,
              credentialVersionBefore: row.credentialVersionBefore,
              credentialVersionAfter,
            },
          },
        });
        return { kind: 'generated', credentialVersionAfter } as const;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async terminalizeRemainingPendingRows(input: {
    batchId: string;
    schoolId: string;
    reasonCode: string;
    occurredAt: Date;
  }): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.studentCredentialBatch.findFirst({
        where: {
          id: input.batchId,
          schoolId: input.schoolId,
          status: {
            in: [
              StudentCredentialBatchStatus.PENDING,
              StudentCredentialBatchStatus.PROCESSING,
            ],
          },
        },
        select: {
          id: true,
          schoolId: true,
          organizationId: true,
          createdById: true,
          createdBy: { select: { userType: true } },
        },
      });
      if (!batch) return 0;
      const rows = await tx.studentCredentialRow.updateMany({
        where: {
          batchId: batch.id,
          schoolId: batch.schoolId,
          status: StudentCredentialRowStatus.PENDING,
        },
        data: {
          status: StudentCredentialRowStatus.FAILED,
          errorsJson: [{ code: input.reasonCode }] as Prisma.InputJsonValue,
        },
      });
      if (rows.count > 0) {
        await tx.studentCredentialBatch.update({
          where: { id: batch.id },
          data: { failedRows: { increment: rows.count } },
        });
        await tx.auditLog.create({
          data: {
            actorId: batch.createdById,
            userType: batch.createdBy.userType,
            organizationId: batch.organizationId,
            schoolId: batch.schoolId,
            module: 'iam',
            action: 'iam.credentials.student_batch.recovery_terminalize',
            resourceType: 'student_credential_batch',
            resourceId: batch.id,
            outcome: AuditOutcome.SUCCESS,
            after: { reasonCode: input.reasonCode, failedRows: rows.count },
          },
        });
      }
      return rows.count;
    });
  }

  async finalizeBatch(input: {
    batchId: string;
    schoolId: string;
    completedAt: Date;
  }): Promise<StudentCredentialBatchStatus | null> {
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.studentCredentialBatch.findFirst({
        where: {
          id: input.batchId,
          schoolId: input.schoolId,
          status: {
            in: [
              StudentCredentialBatchStatus.PENDING,
              StudentCredentialBatchStatus.PROCESSING,
            ],
          },
        },
        select: {
          id: true,
          schoolId: true,
          organizationId: true,
          totalRows: true,
          createdById: true,
          createdBy: { select: { userType: true } },
        },
      });
      if (!batch) return null;
      const grouped = await tx.studentCredentialRow.groupBy({
        by: ['status'],
        where: { batchId: batch.id, schoolId: batch.schoolId },
        _count: { _all: true },
      });
      const counts = emptyStudentCredentialRowCounts();
      for (const item of grouped) counts[item.status] = item._count._all;
      if (counts.PROCESSING > 0) {
        throw new StudentCredentialExecutionInvariantException(
          'processing_row_persisted',
        );
      }
      if (counts.PENDING > 0) return null;
      const terminalRows = counts.GENERATED + counts.SKIPPED + counts.FAILED;
      if (terminalRows !== batch.totalRows) {
        throw new StudentCredentialExecutionInvariantException(
          'terminal_row_count_mismatch',
        );
      }
      const status =
        counts.GENERATED === batch.totalRows
          ? StudentCredentialBatchStatus.COMPLETED
          : counts.GENERATED > 0
            ? StudentCredentialBatchStatus.PARTIAL_FAILED
            : StudentCredentialBatchStatus.FAILED;
      await tx.studentCredentialBatch.update({
        where: { id: batch.id },
        data: {
          status,
          generatedRows: counts.GENERATED,
          skippedRows: counts.SKIPPED,
          failedRows: counts.FAILED,
          completedAt: input.completedAt,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: batch.createdById,
          userType: batch.createdBy.userType,
          organizationId: batch.organizationId,
          schoolId: batch.schoolId,
          module: 'iam',
          action: 'iam.credentials.student_batch.finalize',
          resourceType: 'student_credential_batch',
          resourceId: batch.id,
          outcome: AuditOutcome.SUCCESS,
          after: {
            status,
            generatedRows: counts.GENERATED,
            skippedRows: counts.SKIPPED,
            failedRows: counts.FAILED,
          },
        },
      });
      return status;
    });
  }

  async listRecoveryCandidates(input: {
    createdBefore: Date;
    limit: number;
    cursor?: { createdAt: Date; id: string };
  }): Promise<StudentCredentialRecoveryCandidate[]> {
    const batches = await this.prisma.studentCredentialBatch.findMany({
      where: {
        status: {
          in: [
            StudentCredentialBatchStatus.PENDING,
            StudentCredentialBatchStatus.PROCESSING,
          ],
        },
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
      select: EXECUTION_BATCH_SELECT,
    });
    if (batches.length === 0) return [];
    const groupedRows = await this.prisma.studentCredentialRow.groupBy({
      by: ['batchId', 'schoolId', 'status'],
      where: { batchId: { in: batches.map((batch) => batch.id) } },
      _count: { _all: true },
    });
    const rowState = new Map<
      string,
      { rowCounts: StudentCredentialRowCounts; rowSchoolMismatch: boolean }
    >(
      batches.map((batch) => [
        batch.id,
        {
          rowCounts: emptyStudentCredentialRowCounts(),
          rowSchoolMismatch: false,
        },
      ]),
    );
    const schools = new Map(batches.map((batch) => [batch.id, batch.schoolId]));
    for (const row of groupedRows) {
      const state = rowState.get(row.batchId);
      if (!state) continue;
      state.rowCounts[row.status] += row._count._all;
      if (schools.get(row.batchId) !== row.schoolId) {
        state.rowSchoolMismatch = true;
      }
    }
    return batches.map((batch) => ({ ...batch, ...rowState.get(batch.id)! }));
  }

  listExpiredSecretArtifactCleanupCandidates(input: {
    expiresAtOrBefore: Date;
    limit: number;
    cursor?: { expiresAt: Date; id: string };
  }): Promise<StudentCredentialSecretArtifactCleanupCandidate[]> {
    return this.prisma.studentCredentialBatch.findMany({
      where: {
        status: {
          in: [
            StudentCredentialBatchStatus.COMPLETED,
            StudentCredentialBatchStatus.PARTIAL_FAILED,
            StudentCredentialBatchStatus.FAILED,
          ],
        },
        secretArtifactFileId: { not: null },
        secretArtifactExpiresAt: { lte: input.expiresAtOrBefore },
        secretArtifactFile: { is: { deletedAt: null } },
        ...(input.cursor
          ? {
              OR: [
                {
                  secretArtifactExpiresAt: { gt: input.cursor.expiresAt },
                },
                {
                  secretArtifactExpiresAt: input.cursor.expiresAt,
                  id: { gt: input.cursor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ secretArtifactExpiresAt: 'asc' }, { id: 'asc' }],
      take: input.limit,
      select: EXECUTION_BATCH_SELECT,
    });
  }

  async commitExpiredSecretArtifactCleanup(input: {
    batchId: string;
    schoolId: string;
    organizationId: string;
    fileId: string;
    artifactVersion: number;
    stagedAt: Date;
    expiresAt: Date;
    cleanedAt: Date;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.studentCredentialBatch.findFirst({
        where: {
          id: input.batchId,
          schoolId: input.schoolId,
          organizationId: input.organizationId,
          status: {
            in: [
              StudentCredentialBatchStatus.COMPLETED,
              StudentCredentialBatchStatus.PARTIAL_FAILED,
              StudentCredentialBatchStatus.FAILED,
            ],
          },
          secretArtifactFileId: input.fileId,
          secretArtifactVersion: input.artifactVersion,
          secretArtifactStagedAt: input.stagedAt,
          secretArtifactExpiresAt: {
            equals: input.expiresAt,
            lte: input.cleanedAt,
          },
        },
        select: { id: true },
      });
      if (!batch) return false;
      const file = await tx.file.updateMany({
        where: {
          id: input.fileId,
          schoolId: input.schoolId,
          organizationId: input.organizationId,
          deletedAt: null,
        },
        data: { deletedAt: input.cleanedAt },
      });
      if (file.count !== 1) return false;
      await tx.auditLog.create({
        data: {
          actorId: null,
          userType: null,
          organizationId: input.organizationId,
          schoolId: input.schoolId,
          module: 'iam',
          action: 'iam.credentials.student_batch.secret_cleanup',
          resourceType: 'student_credential_batch',
          resourceId: input.batchId,
          outcome: AuditOutcome.SUCCESS,
          after: {
            reason: 'expired',
            artifactVersion: input.artifactVersion,
            fileMetadataSoftDeleted: true,
          },
        },
      });
      return true;
    });
  }

  private async resolveCurrentRowSkipReason(
    tx: Prisma.TransactionClient,
    input: {
      batch: {
        schoolId: string;
        organizationId: string;
        audienceMode: StudentCredentialAudienceMode;
      };
      row: StudentCredentialExecutionRow;
    },
  ): Promise<string | null> {
    if (!input.row.userId || input.row.credentialVersionBefore === null) {
      return 'students.credentials.target_ineligible';
    }
    const student = await tx.student.findFirst({
      where: {
        id: input.row.studentId,
        schoolId: input.batch.schoolId,
        organizationId: input.batch.organizationId,
        userId: input.row.userId,
        status: StudentStatus.ACTIVE,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!student) return 'students.credentials.target_ineligible';
    const user = await tx.user.findUnique({
      where: { id: input.row.userId },
      select: {
        id: true,
        userType: true,
        status: true,
        deletedAt: true,
        credentialVersion: true,
        passwordHash: true,
      },
    });
    if (
      !user ||
      user.userType !== UserType.STUDENT ||
      (user.status !== UserStatus.ACTIVE &&
        user.status !== UserStatus.INVITED) ||
      user.deletedAt !== null
    ) {
      return 'students.credentials.target_ineligible';
    }
    if (user.credentialVersion !== input.row.credentialVersionBefore) {
      return 'students.credentials.credential_version_changed';
    }
    if (
      input.batch.audienceMode ===
        StudentCredentialAudienceMode.MISSING_PASSWORD &&
      user.passwordHash !== null
    ) {
      return 'students.credentials.password_already_provisioned';
    }
    const membership = await tx.membership.findFirst({
      where: {
        userId: input.row.userId,
        schoolId: input.batch.schoolId,
        organizationId: input.batch.organizationId,
        userType: UserType.STUDENT,
        status: MembershipStatus.ACTIVE,
        deletedAt: null,
      },
      select: { id: true },
    });
    return membership ? null : 'students.credentials.target_ineligible';
  }

  private async skipRowInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      batch: {
        id: string;
        schoolId: string;
        organizationId: string;
        createdById: string;
        createdBy: { userType: UserType };
      };
      row: StudentCredentialExecutionRow;
      reasonCode: string;
      occurredAt: Date;
    },
  ): Promise<void> {
    const row = await tx.studentCredentialRow.updateMany({
      where: {
        id: input.row.id,
        batchId: input.batch.id,
        schoolId: input.batch.schoolId,
        status: StudentCredentialRowStatus.PROCESSING,
      },
      data: {
        status: StudentCredentialRowStatus.SKIPPED,
        errorsJson: [{ code: input.reasonCode }] as Prisma.InputJsonValue,
      },
    });
    if (row.count !== 1) {
      throw new StudentCredentialExecutionInvariantException(
        'row_skip_conflict',
      );
    }
    await tx.studentCredentialBatch.update({
      where: { id: input.batch.id },
      data: { skippedRows: { increment: 1 } },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.batch.createdById,
        userType: input.batch.createdBy.userType,
        organizationId: input.batch.organizationId,
        schoolId: input.batch.schoolId,
        module: 'iam',
        action: 'iam.credentials.student_batch.row_skipped',
        resourceType: 'student_credential_row',
        resourceId: input.row.id,
        outcome: AuditOutcome.SUCCESS,
        after: { reasonCode: input.reasonCode, occurredAt: input.occurredAt },
      },
    });
  }

  private async resolveAudienceReferences(
    scope: StudentsScope,
    selection: StudentCredentialAudienceSelection,
  ): Promise<Map<string, StudentCredentialAudienceReference>> {
    switch (selection.audienceMode) {
      case StudentCredentialAudienceMode.IMPORT_BATCH:
        return this.resolveImportBatchReferences(scope, selection);
      case StudentCredentialAudienceMode.SELECTED_STUDENTS:
        return new Map(
          selection.studentIds.map((studentId) => [
            studentId,
            { studentId, expectedUserId: null, enrollmentId: null },
          ]),
        );
      case StudentCredentialAudienceMode.MISSING_PASSWORD:
        return new Map();
      default:
        return this.resolveAcademicReferences(scope, selection);
    }
  }

  private async resolveImportBatchReferences(
    scope: StudentsScope,
    selection: StudentCredentialAudienceSelection,
  ): Promise<Map<string, StudentCredentialAudienceReference>> {
    const source =
      await this.scopedPrisma.studentBulkRegistrationBatch.findFirst({
        where: {
          id: selection.sourceRegistrationBatchId!,
          status: {
            in: [
              StudentBulkRegistrationBatchStatus.COMPLETED,
              StudentBulkRegistrationBatchStatus.EXECUTION_PARTIAL_FAILED,
            ],
          },
        },
        select: {
          schoolId: true,
          rows: {
            where: {
              status: StudentBulkRegistrationRowStatus.CREATED,
            },
            orderBy: { rowNumber: 'asc' },
            select: {
              schoolId: true,
              studentId: true,
              userId: true,
              enrollmentId: true,
              enrollment: {
                select: { id: true, schoolId: true, studentId: true },
              },
            },
          },
        },
      });
    if (!source) {
      throw new StudentCredentialAudienceInvalidException(
        'source_registration_batch_invalid',
      );
    }
    const references = new Map<string, StudentCredentialAudienceReference>();
    for (const row of source.rows) {
      if (
        source.schoolId !== scope.schoolId ||
        row.schoolId !== scope.schoolId ||
        !row.studentId ||
        !row.userId ||
        !row.enrollmentId ||
        !row.enrollment ||
        row.enrollment.id !== row.enrollmentId ||
        row.enrollment.schoolId !== scope.schoolId ||
        row.enrollment.studentId !== row.studentId
      ) {
        throw new StudentCredentialAudienceInvalidException(
          'source_registration_batch_provenance_invalid',
        );
      }
      const reference: StudentCredentialAudienceReference = {
        studentId: row.studentId,
        expectedUserId: row.userId,
        enrollmentId: row.enrollmentId,
      };
      const existing = references.get(row.studentId);
      if (
        existing &&
        (existing.expectedUserId !== reference.expectedUserId ||
          existing.enrollmentId !== reference.enrollmentId)
      ) {
        throw new StudentCredentialAudienceInvalidException(
          'source_registration_batch_provenance_invalid',
        );
      }
      references.set(row.studentId, reference);
    }
    return references;
  }

  private async resolveAcademicReferences(
    scope: StudentsScope,
    selection: StudentCredentialAudienceSelection,
  ): Promise<Map<string, StudentCredentialAudienceReference>> {
    await this.assertAcademicSelector(scope, selection);
    const classroomWhere: Prisma.ClassroomWhereInput = { deletedAt: null };
    switch (selection.audienceMode) {
      case StudentCredentialAudienceMode.STAGE:
        classroomWhere.section = {
          deletedAt: null,
          grade: { deletedAt: null, stageId: selection.stageId! },
        };
        break;
      case StudentCredentialAudienceMode.GRADE:
        classroomWhere.section = {
          deletedAt: null,
          gradeId: selection.gradeId!,
        };
        break;
      case StudentCredentialAudienceMode.SECTION:
        classroomWhere.sectionId = selection.sectionId!;
        break;
      case StudentCredentialAudienceMode.CLASSROOM:
        classroomWhere.id = selection.classroomId!;
        break;
      case StudentCredentialAudienceMode.ACADEMIC_YEAR:
        break;
      default:
        throw new StudentCredentialAudienceInvalidException(
          'academic_selector_invalid',
        );
    }
    const enrollments = await this.scopedPrisma.enrollment.findMany({
      where: {
        academicYearId: selection.academicYearId!,
        status: StudentEnrollmentStatus.ACTIVE,
        deletedAt: null,
        classroom: classroomWhere,
      },
      orderBy: [
        { studentId: 'asc' },
        { enrolledAt: 'desc' },
        { createdAt: 'desc' },
        { id: 'asc' },
      ],
      select: { id: true, studentId: true },
    });
    const references = new Map<string, StudentCredentialAudienceReference>();
    for (const enrollment of enrollments) {
      if (!references.has(enrollment.studentId)) {
        references.set(enrollment.studentId, {
          studentId: enrollment.studentId,
          expectedUserId: null,
          enrollmentId: enrollment.id,
        });
      }
    }
    return references;
  }

  private async resolveOptionalCurrentEnrollmentIds(
    studentIds: string[],
  ): Promise<Map<string, string>> {
    if (studentIds.length === 0) return new Map();
    const enrollments = await this.scopedPrisma.enrollment.findMany({
      where: {
        studentId: { in: studentIds },
        status: StudentEnrollmentStatus.ACTIVE,
        deletedAt: null,
        academicYear: {
          is: { isActive: true, deletedAt: null },
        },
      },
      orderBy: [
        { studentId: 'asc' },
        { academicYear: { startDate: 'desc' } },
        { enrolledAt: 'desc' },
        { createdAt: 'desc' },
        { id: 'asc' },
      ],
      select: { id: true, studentId: true },
    });
    const currentEnrollmentIds = new Map<string, string>();
    for (const enrollment of enrollments) {
      if (!currentEnrollmentIds.has(enrollment.studentId)) {
        currentEnrollmentIds.set(enrollment.studentId, enrollment.id);
      }
    }
    return currentEnrollmentIds;
  }

  private async assertAcademicSelector(
    scope: StudentsScope,
    selection: StudentCredentialAudienceSelection,
  ): Promise<void> {
    const academicYear = await this.scopedPrisma.academicYear.findFirst({
      where: { id: selection.academicYearId!, deletedAt: null },
      select: { id: true },
    });
    if (!academicYear) {
      throw new StudentCredentialAudienceInvalidException(
        'academic_year_invalid',
      );
    }
    let selectorFound = true;
    switch (selection.audienceMode) {
      case StudentCredentialAudienceMode.STAGE:
        selectorFound = Boolean(
          await this.scopedPrisma.stage.findFirst({
            where: { id: selection.stageId!, deletedAt: null },
            select: { id: true },
          }),
        );
        break;
      case StudentCredentialAudienceMode.GRADE:
        selectorFound = Boolean(
          await this.scopedPrisma.grade.findFirst({
            where: { id: selection.gradeId!, deletedAt: null },
            select: { id: true },
          }),
        );
        break;
      case StudentCredentialAudienceMode.SECTION:
        selectorFound = Boolean(
          await this.scopedPrisma.section.findFirst({
            where: { id: selection.sectionId!, deletedAt: null },
            select: { id: true },
          }),
        );
        break;
      case StudentCredentialAudienceMode.CLASSROOM:
        selectorFound = Boolean(
          await this.scopedPrisma.classroom.findFirst({
            where: { id: selection.classroomId!, deletedAt: null },
            select: { id: true },
          }),
        );
        break;
      default:
        break;
    }
    if (!selectorFound) {
      throw new StudentCredentialAudienceInvalidException(
        'academic_selector_invalid',
      );
    }
    void scope;
  }
}

export function emptyStudentCredentialRowCounts(): StudentCredentialRowCounts {
  return {
    [StudentCredentialRowStatus.PENDING]: 0,
    [StudentCredentialRowStatus.PROCESSING]: 0,
    [StudentCredentialRowStatus.GENERATED]: 0,
    [StudentCredentialRowStatus.SKIPPED]: 0,
    [StudentCredentialRowStatus.FAILED]: 0,
  };
}

function isExecutionTenantEligible(batch: {
  schoolId: string;
  organizationId: string;
  school: {
    id: string;
    organizationId: string;
    status: SchoolStatus;
    deletedAt: Date | null;
    organization: {
      id: string;
      status: OrganizationStatus;
      deletedAt: Date | null;
    };
  };
}): boolean {
  return (
    batch.school.id === batch.schoolId &&
    batch.school.organizationId === batch.organizationId &&
    batch.school.status === SchoolStatus.ACTIVE &&
    batch.school.deletedAt === null &&
    batch.school.organization.id === batch.organizationId &&
    batch.school.organization.status === OrganizationStatus.ACTIVE &&
    batch.school.organization.deletedAt === null
  );
}

function isPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}
