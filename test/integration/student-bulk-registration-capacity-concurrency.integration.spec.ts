import { randomUUID } from 'node:crypto';
import {
  FileVisibility,
  ImportJobStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolEntitlementStatus,
  SchoolStatus,
  StudentBulkRegistrationBatchStatus,
  StudentBulkRegistrationRowStatus,
  StudentEnrollmentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { DomainException } from '../../src/common/exceptions/domain-exception';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { StudentBulkRegistrationExecutionRepository } from '../../src/modules/students/registration/infrastructure/student-bulk-registration-execution.repository';
import { StudentBulkRegistrationExecutionReconciliationService } from '../../src/modules/students/registration/application/student-bulk-registration-execution-reconciliation.service';
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';
import { STUDENT_BULK_REGISTRATION_EXECUTION_RECOVERY_WINDOW_MS } from '../../src/modules/students/registration/domain/student-bulk-registration.constants';

jest.setTimeout(60000);

describe('Student bulk registration Serializable capacity enforcement', () => {
  let prisma: PrismaClient;
  let repository: StudentBulkRegistrationExecutionRepository;
  const cleanupSchoolIds: string[] = [];

  beforeAll(async () => {
    assertDisposableTestDatabase();
    prisma = new PrismaClient();
    await prisma.$connect();
    repository = new StudentBulkRegistrationExecutionRepository(
      prisma as unknown as PrismaService,
    );
  });

  afterAll(async () => {
    for (const schoolId of cleanupSchoolIds) await cleanupSchool(schoolId);
    if (prisma) await prisma.$disconnect();
  });

  it('prevents two concurrent rows from oversubscribing classroom capacity 1', async () => {
    const fixture = await createExecutionFixture({
      classroomCapacity: 1,
      studentSeatLimit: null,
      label: 'classroom',
    });

    const outcomes = await provisionConcurrently(fixture);

    expect(
      outcomes.filter((outcome) => outcome.kind === 'created'),
    ).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.kind === 'failed')).toEqual([
      {
        kind: 'failed',
        code: 'students.enrollment.placement_conflict',
      },
    ]);
    await expect(
      prisma.enrollment.count({
        where: {
          schoolId: fixture.schoolId,
          academicYearId: fixture.academicYearId,
          classroomId: fixture.classroomId,
          status: StudentEnrollmentStatus.ACTIVE,
          deletedAt: null,
        },
      }),
    ).resolves.toBe(1);
    await expect(readRowOutcomeCounts(fixture.batchId)).resolves.toEqual({
      created: 1,
      failed: 1,
    });
  });

  it('prevents two concurrent rows from oversubscribing school seat limit 1', async () => {
    const fixture = await createExecutionFixture({
      classroomCapacity: 10,
      studentSeatLimit: 1,
      label: 'seat',
    });

    const outcomes = await provisionConcurrently(fixture);

    expect(
      outcomes.filter((outcome) => outcome.kind === 'created'),
    ).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.kind === 'failed')).toEqual([
      {
        kind: 'failed',
        code: 'platform.entitlement.student_seat_limit_exceeded',
      },
    ]);
    const activeSeats = await prisma.enrollment.findMany({
      where: {
        schoolId: fixture.schoolId,
        status: StudentEnrollmentStatus.ACTIVE,
        deletedAt: null,
        student: { status: 'ACTIVE', deletedAt: null },
      },
      distinct: ['studentId'],
      select: { studentId: true },
    });
    expect(activeSeats).toHaveLength(1);
    await expect(readRowOutcomeCounts(fixture.batchId)).resolves.toEqual({
      created: 1,
      failed: 1,
    });
  });

  it('serializes provisioning against recovery terminalization without double counters or partial entities', async () => {
    const fixture = await createExecutionFixture({
      classroomCapacity: 10,
      studentSeatLimit: null,
      label: 'recovery-race',
      rowCount: 1,
    });

    const [provisioned, terminalizedRows] = await Promise.all([
      repository.provisionRow({
        batchId: fixture.batchId,
        schoolId: fixture.schoolId,
        rowId: fixture.rowIds[0],
      }),
      repository.terminalizeRemainingValidRows({
        batchId: fixture.batchId,
        schoolId: fixture.schoolId,
        reasonCode:
          'students.bulk_registration.execution_recovery_window_expired',
      }),
    ]);
    await repository.finalizeExecution({
      batchId: fixture.batchId,
      schoolId: fixture.schoolId,
    });

    const [batch, rows] = await Promise.all([
      prisma.studentBulkRegistrationBatch.findUniqueOrThrow({
        where: { id: fixture.batchId },
      }),
      prisma.studentBulkRegistrationRow.findMany({
        where: { batchId: fixture.batchId },
      }),
    ]);
    const createdRows = rows.filter(
      (row) => row.status === StudentBulkRegistrationRowStatus.CREATED,
    );
    const failedRows = rows.filter(
      (row) => row.status === StudentBulkRegistrationRowStatus.FAILED,
    );
    expect(createdRows).toHaveLength(provisioned.kind === 'created' ? 1 : 0);
    expect(terminalizedRows).toBe(failedRows.length);
    expect(createdRows.length + failedRows.length).toBe(1);
    expect(batch.createdRows).toBe(createdRows.length);
    expect(batch.failedRows).toBe(failedRows.length);
    expect(
      rows.some((row) =>
        [
          StudentBulkRegistrationRowStatus.VALID,
          StudentBulkRegistrationRowStatus.PROCESSING,
        ].includes(row.status),
      ),
    ).toBe(false);
    for (const row of failedRows) {
      expect(row.studentId).toBeNull();
      expect(row.userId).toBeNull();
      expect(row.enrollmentId).toBeNull();
    }
  });

  it.each([
    ['expired recovery window', 'expired'],
    ['inactive tenant', 'tenant'],
  ] as const)(
    'terminalizes durable VALID rows for %s without queue or business creation',
    async (_label, reason) => {
      const fixture = await createExecutionFixture({
        classroomCapacity: 10,
        studentSeatLimit: null,
        label: `terminal-${reason}`,
      });
      const reconciliationNow = new Date(Date.now() + 1_000);
      if (reason === 'expired') {
        await prisma.studentBulkRegistrationBatch.update({
          where: { id: fixture.batchId },
          data: {
            startedAt: new Date(
              reconciliationNow.getTime() -
                STUDENT_BULK_REGISTRATION_EXECUTION_RECOVERY_WINDOW_MS -
                1,
            ),
          },
        });
      } else {
        await prisma.school.update({
          where: { id: fixture.schoolId },
          data: { status: SchoolStatus.SUSPENDED },
        });
      }
      const queue = {
        ensureJobFromPersistedTruth: jest.fn(() => {
          throw new Error('queue_must_not_be_called');
        }),
      };
      const reconciliation =
        new StudentBulkRegistrationExecutionReconciliationService(
          repository,
          queue as unknown as BullmqService,
        );

      await reconciliation.reconcile(reconciliationNow);

      const [batch, rows, entityCount] = await Promise.all([
        prisma.studentBulkRegistrationBatch.findUniqueOrThrow({
          where: { id: fixture.batchId },
        }),
        prisma.studentBulkRegistrationRow.findMany({
          where: { batchId: fixture.batchId },
        }),
        prisma.student.count({ where: { schoolId: fixture.schoolId } }),
      ]);
      expect(batch).toMatchObject({
        status: StudentBulkRegistrationBatchStatus.FAILED,
        createdRows: 0,
        failedRows: 2,
      });
      expect(
        rows.every(
          (row) =>
            row.status === StudentBulkRegistrationRowStatus.FAILED &&
            row.studentId === null &&
            row.userId === null &&
            row.enrollmentId === null,
        ),
      ).toBe(true);
      expect(JSON.stringify(rows[0].errorsJson)).toContain(
        reason === 'expired'
          ? 'students.bulk_registration.execution_recovery_window_expired'
          : 'students.bulk_registration.execution_tenant_ineligible',
      );
      expect(entityCount).toBe(0);
      expect(queue.ensureJobFromPersistedTruth).not.toHaveBeenCalled();
    },
  );

  async function provisionConcurrently(fixture: ExecutionFixture) {
    return Promise.all(
      fixture.rowIds.map(async (rowId) => {
        try {
          await repository.provisionRow({
            batchId: fixture.batchId,
            schoolId: fixture.schoolId,
            rowId,
          });
          return { kind: 'created' as const };
        } catch (error) {
          if (!(error instanceof DomainException)) throw error;
          await repository.markRowFailed({
            batchId: fixture.batchId,
            schoolId: fixture.schoolId,
            rowId,
            error: { code: error.code, field: null },
          });
          return { kind: 'failed' as const, code: error.code };
        }
      }),
    );
  }

  async function createExecutionFixture(input: {
    classroomCapacity: number | null;
    studentSeatLimit: number | null;
    label: string;
    rowCount?: number;
  }): Promise<ExecutionFixture> {
    const suffix = `${input.label}-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const organization = await prisma.organization.create({
      data: {
        slug: `bulk-concurrency-org-${suffix}`,
        name: `Bulk Concurrency ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `bulk-concurrency-school-${suffix}`,
        name: `Bulk Concurrency ${suffix}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    cleanupSchoolIds.push(school.id);
    const actor = await prisma.user.create({
      data: {
        email: `bulk-actor-${suffix}@example.test`,
        firstName: 'Bulk',
        lastName: 'Actor',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: null,
      },
      select: { id: true },
    });
    const role = await prisma.role.create({
      data: {
        schoolId: school.id,
        key: 'student',
        name: 'Student',
        isSystem: false,
      },
      select: { id: true },
    });
    await prisma.schoolEntitlement.create({
      data: {
        schoolId: school.id,
        organizationId: organization.id,
        status: SchoolEntitlementStatus.ACTIVE,
        studentSeatLimit: input.studentSeatLimit,
      },
    });
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        nameAr: `year-ar-${suffix}`,
        nameEn: `year-${suffix}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId: school.id,
        nameAr: `stage-ar-${suffix}`,
        nameEn: `stage-${suffix}`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId: school.id,
        stageId: stage.id,
        nameAr: `grade-ar-${suffix}`,
        nameEn: `grade-${suffix}`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId: school.id,
        gradeId: grade.id,
        nameAr: `section-ar-${suffix}`,
        nameEn: `section-${suffix}`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId: school.id,
        sectionId: section.id,
        nameAr: `classroom-ar-${suffix}`,
        nameEn: `classroom-${suffix}`,
        sortOrder: 1,
        capacity: input.classroomCapacity,
      },
      select: { id: true },
    });
    const file = await prisma.file.create({
      data: {
        organizationId: organization.id,
        schoolId: school.id,
        uploaderId: actor.id,
        bucket: 'bulk-concurrency-fixtures',
        objectKey: `${suffix}/students.csv`,
        originalName: 'students.csv',
        mimeType: 'text/csv',
        sizeBytes: 0,
        visibility: FileVisibility.PRIVATE,
      },
      select: { id: true },
    });
    const importJob = await prisma.importJob.create({
      data: {
        schoolId: school.id,
        uploadedFileId: file.id,
        type: 'students_bulk_registration',
        status: ImportJobStatus.COMPLETED,
        createdById: actor.id,
        reportJson: {
          status: ImportJobStatus.COMPLETED,
          errors: [],
          bulkRegistrationExecution: {
            requestedById: actor.id,
            requestedByUserType: UserType.SCHOOL_USER,
            requestedAt: new Date().toISOString(),
            loginDomain: `students-${suffix}.example.test`,
            studentRoleId: role.id,
          },
        },
      },
      select: { id: true },
    });
    const batch = await prisma.studentBulkRegistrationBatch.create({
      data: {
        schoolId: school.id,
        organizationId: organization.id,
        sourceImportJobId: importJob.id,
        academicYearId: academicYear.id,
        termId: null,
        classroomId: classroom.id,
        enrollmentDate: new Date('2026-09-01T00:00:00.000Z'),
        status: StudentBulkRegistrationBatchStatus.EXECUTING,
        totalRows: input.rowCount ?? 2,
        validRows: input.rowCount ?? 2,
        invalidRows: 0,
        createdRows: 0,
        failedRows: 0,
        createdById: actor.id,
        validatedAt: new Date(),
        startedAt: new Date(),
      },
      select: { id: true },
    });
    const rows = await Promise.all(
      Array.from(
        { length: input.rowCount ?? 2 },
        (_, offset) => offset + 1,
      ).map((index) =>
        prisma.studentBulkRegistrationRow.create({
          data: {
            schoolId: school.id,
            batchId: batch.id,
            rowNumber: index + 1,
            normalizedDataJson: normalizedData(`${suffix}-${index}`),
            rowHash: `${index}`.repeat(64),
            status: StudentBulkRegistrationRowStatus.VALID,
          },
          select: { id: true },
        }),
      ),
    );
    return {
      schoolId: school.id,
      academicYearId: academicYear.id,
      classroomId: classroom.id,
      batchId: batch.id,
      rowIds: rows.map((row) => row.id),
    };
  }

  async function readRowOutcomeCounts(batchId: string) {
    const [created, failed] = await Promise.all([
      prisma.studentBulkRegistrationRow.count({
        where: { batchId, status: StudentBulkRegistrationRowStatus.CREATED },
      }),
      prisma.studentBulkRegistrationRow.count({
        where: { batchId, status: StudentBulkRegistrationRowStatus.FAILED },
      }),
    ]);
    return { created, failed };
  }

  async function cleanupSchool(schoolId: string): Promise<void> {
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { organizationId: true },
    });
    if (!school) return;
    const batches = await prisma.studentBulkRegistrationBatch.findMany({
      where: { schoolId },
      select: { id: true, sourceImportJobId: true, createdById: true },
    });
    const importJobIds = batches.map((batch) => batch.sourceImportJobId);
    const createdByIds = batches.map((batch) => batch.createdById);
    const files = await prisma.importJob.findMany({
      where: { id: { in: importJobIds } },
      select: { uploadedFileId: true },
    });
    await prisma.studentBulkRegistrationBatch.deleteMany({
      where: { schoolId },
    });
    await prisma.auditLog.deleteMany({ where: { schoolId } });
    await prisma.enrollment.deleteMany({ where: { schoolId } });
    await prisma.student.deleteMany({ where: { schoolId } });
    const memberships = await prisma.membership.findMany({
      where: { schoolId },
      select: { userId: true },
    });
    await prisma.membership.deleteMany({ where: { schoolId } });
    await prisma.importJob.deleteMany({ where: { id: { in: importJobIds } } });
    await prisma.file.deleteMany({
      where: { id: { in: files.map((file) => file.uploadedFileId) } },
    });
    await prisma.schoolEntitlement.deleteMany({ where: { schoolId } });
    await prisma.classroom.deleteMany({ where: { schoolId } });
    await prisma.section.deleteMany({ where: { schoolId } });
    await prisma.grade.deleteMany({ where: { schoolId } });
    await prisma.stage.deleteMany({ where: { schoolId } });
    await prisma.term.deleteMany({ where: { schoolId } });
    await prisma.academicYear.deleteMany({ where: { schoolId } });
    await prisma.role.deleteMany({ where: { schoolId } });
    await prisma.user.deleteMany({
      where: { id: { in: memberships.map((membership) => membership.userId) } },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdByIds } } });
    await prisma.school.delete({ where: { id: schoolId } });
    await prisma.organization.delete({ where: { id: school.organizationId } });
  }
});

interface ExecutionFixture {
  schoolId: string;
  academicYearId: string;
  classroomId: string;
  batchId: string;
  rowIds: string[];
}

function normalizedData(suffix: string) {
  return {
    firstNameEn: 'Concurrent',
    fatherNameEn: null,
    grandfatherNameEn: null,
    familyNameEn: 'Student',
    firstNameAr: null,
    fatherNameAr: null,
    grandfatherNameAr: null,
    familyNameAr: null,
    dateOfBirth: '2012-05-20',
    gender: 'female',
    nationality: 'Egyptian',
    username: `concurrent.${suffix}`.toLowerCase(),
    contactEmail: null,
    studentPhone: null,
  };
}

function assertDisposableTestDatabase(): void {
  if (process.env.NODE_ENV !== 'test' || !process.env.DATABASE_URL) {
    throw new Error('Disposable test DATABASE_URL is required');
  }
  const database = new URL(process.env.DATABASE_URL);
  if (!['127.0.0.1', 'localhost', '::1'].includes(database.hostname)) {
    throw new Error('Capacity concurrency tests require local PostgreSQL');
  }
}
