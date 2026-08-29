import { randomUUID } from 'node:crypto';
import {
  FileVisibility,
  MembershipStatus,
  OrganizationStatus,
  SchoolStatus,
  StudentCredentialAudienceMode,
  StudentCredentialBatchStatus,
  StudentCredentialMode,
  StudentCredentialRowStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../src/common/context/request-context';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { StudentCredentialBatchRepository } from '../../src/modules/students/credentials/infrastructure/student-credential-batch.repository';
import { assertDisposablePostgresTarget } from '../helpers/disposable-postgres-target';

jest.setTimeout(60_000);

describe('Student credential batch atomic concurrency', () => {
  let prisma: PrismaService;
  let repository: StudentCredentialBatchRepository;
  const cleanupSchoolIds: string[] = [];

  beforeAll(async () => {
    assertDisposableTestDatabase();
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new StudentCredentialBatchRepository(prisma);
  });

  afterAll(async () => {
    for (const schoolId of cleanupSchoolIds) await cleanupSchool(schoolId);
    if (prisma) await prisma.$disconnect();
  });

  it('allows exactly one concurrent batch to update a frozen credential version', async () => {
    const fixture = await createFixture();

    const outcomes = await Promise.all(
      fixture.rows.map((row, index) =>
        repository.applyCredentialRow({
          batchId: row.batchId,
          schoolId: fixture.schoolId,
          rowId: row.id,
          artifactFileId: row.artifactFileId,
          artifactVersion: 1,
          artifactEntry: {
            rowId: row.id,
            studentId: fixture.studentId,
            userId: fixture.studentUserId,
          },
          passwordHash: `independent-argon-hash-${index}`,
          generatedAt: new Date(),
        }),
      ),
    );

    expect(
      outcomes.filter((outcome) => outcome.kind === 'generated'),
    ).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.kind === 'skipped')).toEqual([
      {
        kind: 'skipped',
        reasonCode: 'students.credentials.credential_version_changed',
      },
    ]);

    const [user, rows, batches, session, generatedAudits] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: fixture.studentUserId } }),
      prisma.studentCredentialRow.findMany({
        where: { batchId: { in: fixture.batchIds } },
      }),
      prisma.studentCredentialBatch.findMany({
        where: { id: { in: fixture.batchIds } },
      }),
      prisma.session.findUniqueOrThrow({ where: { id: fixture.sessionId } }),
      prisma.auditLog.count({
        where: {
          schoolId: fixture.schoolId,
          action: 'iam.credentials.student_batch.row_generated',
        },
      }),
    ]);

    expect(user.credentialVersion).toBe(1);
    expect(user.passwordHash).toMatch(/^independent-argon-hash-[01]$/u);
    expect(user.mustChangePassword).toBe(true);
    expect(user.passwordChangedAt).toBeNull();
    expect(user.passwordProvisionedAt).not.toBeNull();
    expect(session.revokedAt).not.toBeNull();
    expect(
      rows.filter((row) => row.status === StudentCredentialRowStatus.GENERATED),
    ).toHaveLength(1);
    expect(
      rows.filter((row) => row.status === StudentCredentialRowStatus.SKIPPED),
    ).toHaveLength(1);
    expect(rows.map((row) => row.enrollmentId)).toEqual([
      fixture.enrollmentId,
      fixture.enrollmentId,
    ]);
    expect(batches.map((batch) => batch.generatedRows).sort()).toEqual([0, 1]);
    expect(batches.map((batch) => batch.skippedRows).sort()).toEqual([0, 1]);
    expect(generatedAudits).toBe(1);
  });

  it('persists selected-audience current Enrollment provenance through the tenant-scoped repository', async () => {
    const fixture = await createFixture();

    const resolution = await inSchoolScope(fixture, () =>
      repository.resolveAudienceCandidates(
        {
          schoolId: fixture.schoolId,
          organizationId: fixture.organizationId,
          actorId: fixture.actorId,
          userType: UserType.SCHOOL_USER,
          roleId: fixture.roleId,
        },
        {
          audienceMode: StudentCredentialAudienceMode.SELECTED_STUDENTS,
          sourceRegistrationBatchId: null,
          studentIds: [fixture.studentId],
          academicYearId: null,
          stageId: null,
          gradeId: null,
          sectionId: null,
          classroomId: null,
        },
      ),
    );

    expect(resolution.references.get(fixture.studentId)?.enrollmentId).toBe(
      fixture.enrollmentId,
    );

    const batch = await repository.createBatch({
      scope: {
        schoolId: fixture.schoolId,
        organizationId: fixture.organizationId,
        actorId: fixture.actorId,
        userType: UserType.SCHOOL_USER,
        roleId: fixture.roleId,
      },
      selection: {
        audienceMode: StudentCredentialAudienceMode.SELECTED_STUDENTS,
        sourceRegistrationBatchId: null,
        studentIds: [fixture.studentId],
        academicYearId: null,
        stageId: null,
        gradeId: null,
        sectionId: null,
        classroomId: null,
      },
      credentialMode: StudentCredentialMode.UNIQUE_GENERATED,
      targets: [
        {
          studentId: fixture.studentId,
          userId: fixture.studentUserId,
          enrollmentId: fixture.enrollmentId,
          credentialVersion: 0,
        },
      ],
    });
    const row = await prisma.studentCredentialRow.findFirstOrThrow({
      where: { batchId: batch.id },
    });

    expect(row.enrollmentId).toBe(fixture.enrollmentId);
    expect(row.schoolId).toBe(fixture.schoolId);

    const legacyCompatibleBatch = await prisma.studentCredentialBatch.create({
      data: {
        schoolId: fixture.schoolId,
        organizationId: fixture.organizationId,
        audienceMode: StudentCredentialAudienceMode.SELECTED_STUDENTS,
        credentialMode: StudentCredentialMode.UNIQUE_GENERATED,
        status: StudentCredentialBatchStatus.PENDING,
        totalRows: 1,
        createdById: fixture.actorId,
        rows: {
          create: {
            studentId: fixture.studentId,
            userId: fixture.studentUserId,
            status: StudentCredentialRowStatus.PENDING,
            credentialVersionBefore: 0,
          },
        },
      },
      select: { rows: { select: { enrollmentId: true } } },
    });

    expect(legacyCompatibleBatch.rows[0]?.enrollmentId).toBeNull();
  });

  async function createFixture() {
    const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const organization = await prisma.organization.create({
      data: {
        slug: `credential-runtime-org-${suffix}`,
        name: `Credential Runtime ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
    });
    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `credential-runtime-school-${suffix}`,
        name: `Credential Runtime ${suffix}`,
        status: SchoolStatus.ACTIVE,
      },
    });
    cleanupSchoolIds.push(school.id);
    const [actor, studentUser] = await Promise.all([
      prisma.user.create({
        data: {
          email: `credential-actor-${suffix}@example.test`,
          firstName: 'Credential',
          lastName: 'Actor',
          userType: UserType.SCHOOL_USER,
          status: UserStatus.ACTIVE,
        },
      }),
      prisma.user.create({
        data: {
          email: `credential-student-${suffix}@example.test`,
          username: `credential.student.${suffix}`,
          firstName: 'Credential',
          lastName: 'Student',
          userType: UserType.STUDENT,
          status: UserStatus.ACTIVE,
          credentialVersion: 0,
          passwordHash: null,
        },
      }),
    ]);
    const role = await prisma.role.create({
      data: {
        schoolId: school.id,
        key: 'student',
        name: 'Student',
        isSystem: false,
      },
    });
    await prisma.membership.create({
      data: {
        userId: studentUser.id,
        organizationId: organization.id,
        schoolId: school.id,
        roleId: role.id,
        userType: UserType.STUDENT,
        status: MembershipStatus.ACTIVE,
      },
    });
    const student = await prisma.student.create({
      data: {
        schoolId: school.id,
        organizationId: organization.id,
        userId: studentUser.id,
        firstName: 'Credential',
        lastName: 'Student',
      },
    });
    const session = await prisma.session.create({
      data: {
        userId: studentUser.id,
        refreshTokenHash: `credential-session-${suffix}`,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        nameAr: `عام ${suffix}`,
        nameEn: `Year ${suffix}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: true,
      },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId: school.id,
        nameAr: `مرحلة ${suffix}`,
        nameEn: `Stage ${suffix}`,
      },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId: school.id,
        stageId: stage.id,
        nameAr: `صف ${suffix}`,
        nameEn: `Grade ${suffix}`,
      },
    });
    const section = await prisma.section.create({
      data: {
        schoolId: school.id,
        gradeId: grade.id,
        nameAr: `شعبة ${suffix}`,
        nameEn: `Section ${suffix}`,
      },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId: school.id,
        sectionId: section.id,
        nameAr: `فصل ${suffix}`,
        nameEn: `Classroom ${suffix}`,
      },
    });
    const enrollment = await prisma.enrollment.create({
      data: {
        schoolId: school.id,
        studentId: student.id,
        academicYearId: academicYear.id,
        classroomId: classroom.id,
        enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    });

    const rows: Array<{
      id: string;
      batchId: string;
      artifactFileId: string;
    }> = [];
    for (let index = 0; index < 2; index += 1) {
      const file = await prisma.file.create({
        data: {
          organizationId: organization.id,
          schoolId: school.id,
          uploaderId: actor.id,
          bucket: 'credential-runtime-fixtures',
          objectKey: `${suffix}/artifact-${index}.json`,
          originalName: 'student-credential-secret-v1.json',
          mimeType: 'application/vnd.moazez.student-credentials+json',
          sizeBytes: 1,
          checksumSha256: 'a'.repeat(64),
          visibility: FileVisibility.PRIVATE,
        },
      });
      const batch = await prisma.studentCredentialBatch.create({
        data: {
          schoolId: school.id,
          organizationId: organization.id,
          audienceMode: StudentCredentialAudienceMode.SELECTED_STUDENTS,
          credentialMode: StudentCredentialMode.UNIQUE_GENERATED,
          secretArtifactFileId: file.id,
          secretArtifactVersion: 1,
          secretArtifactStagedAt: new Date(),
          secretArtifactExpiresAt: new Date(Date.now() + 60_000),
          status: StudentCredentialBatchStatus.PROCESSING,
          totalRows: 1,
          createdById: actor.id,
          startedAt: new Date(),
          rows: {
            create: {
              studentId: student.id,
              userId: studentUser.id,
              enrollmentId: enrollment.id,
              status: StudentCredentialRowStatus.PENDING,
              credentialVersionBefore: 0,
            },
          },
        },
        select: { id: true, rows: { select: { id: true } } },
      });
      rows.push({
        id: batch.rows[0].id,
        batchId: batch.id,
        artifactFileId: file.id,
      });
    }
    return {
      organizationId: organization.id,
      schoolId: school.id,
      actorId: actor.id,
      roleId: role.id,
      studentId: student.id,
      studentUserId: studentUser.id,
      enrollmentId: enrollment.id,
      sessionId: session.id,
      batchIds: rows.map((row) => row.batchId),
      rows,
    };
  }

  async function cleanupSchool(schoolId: string): Promise<void> {
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { organizationId: true },
    });
    if (!school) return;
    const batches = await prisma.studentCredentialBatch.findMany({
      where: { schoolId },
      select: { createdById: true, secretArtifactFileId: true },
    });
    const memberships = await prisma.membership.findMany({
      where: { schoolId },
      select: { userId: true },
    });
    const userIds = [
      ...new Set([
        ...batches.map((batch) => batch.createdById),
        ...memberships.map((membership) => membership.userId),
      ]),
    ];
    const fileIds = batches.flatMap((batch) =>
      batch.secretArtifactFileId ? [batch.secretArtifactFileId] : [],
    );
    await prisma.studentCredentialBatch.deleteMany({ where: { schoolId } });
    await prisma.auditLog.deleteMany({ where: { schoolId } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.enrollment.deleteMany({ where: { schoolId } });
    await prisma.student.deleteMany({ where: { schoolId } });
    await prisma.classroom.deleteMany({ where: { schoolId } });
    await prisma.section.deleteMany({ where: { schoolId } });
    await prisma.grade.deleteMany({ where: { schoolId } });
    await prisma.stage.deleteMany({ where: { schoolId } });
    await prisma.academicYear.deleteMany({ where: { schoolId } });
    await prisma.membership.deleteMany({ where: { schoolId } });
    await prisma.file.deleteMany({ where: { id: { in: fileIds } } });
    await prisma.role.deleteMany({ where: { schoolId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.school.delete({ where: { id: schoolId } });
    await prisma.organization.delete({ where: { id: school.organizationId } });
  }
});

async function inSchoolScope<T>(
  fixture: {
    actorId: string;
    organizationId: string;
    schoolId: string;
    roleId: string;
  },
  callback: () => Promise<T>,
): Promise<T> {
  const context = createRequestContext('credential-placement-integration');
  context.actor = { id: fixture.actorId, userType: UserType.SCHOOL_USER };
  context.activeMembership = {
    membershipId: 'credential-placement-membership',
    organizationId: fixture.organizationId,
    schoolId: fixture.schoolId,
    roleId: fixture.roleId,
    permissions: [],
  };
  return runWithRequestContext(context, callback);
}

function assertDisposableTestDatabase(): void {
  assertDisposablePostgresTarget({
    databaseUrl: process.env.DATABASE_URL,
    nodeEnv: process.env.NODE_ENV,
    universalRegressionMarker:
      process.env.MOAZEZ_UNIVERSAL_REGRESSION_DISPOSABLE_DB,
    localDatabasePredicate: () => true,
    errorMessage: 'Credential runtime integration requires local PostgreSQL',
  });
}
