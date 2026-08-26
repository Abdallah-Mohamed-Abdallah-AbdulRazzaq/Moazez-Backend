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
        totalRows: 2,
        validRows: 2,
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
      [1, 2].map((index) =>
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
