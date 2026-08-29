import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  FileVisibility,
  ImportJobStatus,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolStatus,
  UserStatus,
  UserType,
  StudentBulkRegistrationBatchStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { isStudentBulkRegistrationExecutionJobData } from '../../src/modules/files/imports/domain/import-job.types';

const GLOBAL_PREFIX = '/api/v1';
const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';
const TEST_PASSWORD = 'BulkSecurity123!';
const TEST_SUFFIX = `bulk-registration-security-${Date.now()}`;

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(30000);

describe('Student bulk registration tenancy and authorization (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let demoSchoolId: string;
  let demoOrganizationId: string;
  let demoPlacement: PlacementFixture;
  let tenantBPlacement: PlacementFixture;
  let foreignBatchId: string;
  let foreignImportJobId: string;
  let foreignFileId: string;
  const createdUserIds = new Set<string>();
  const createdMembershipIds = new Set<string>();
  const createdRoleIds = new Set<string>();
  const createdOrganizationIds = new Set<string>();
  const createdSchoolIds = new Set<string>();
  const createdAcademicYearIds = new Set<string>();
  const createdTermIds = new Set<string>();
  const createdStageIds = new Set<string>();
  const createdGradeIds = new Set<string>();
  const createdSectionIds = new Set<string>();
  const createdClassroomIds = new Set<string>();

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    const demoSchool = await prisma.school.findFirstOrThrow({
      where: { slug: 'moazez-academy' },
      select: { id: true, organizationId: true },
    });
    demoSchoolId = demoSchool.id;
    demoOrganizationId = demoSchool.organizationId;

    demoPlacement = await createPlacement({
      schoolId: demoSchoolId,
      label: `${TEST_SUFFIX}-demo`,
    });
    const tenantB = await createTenantB();
    tenantBPlacement = await createPlacement({
      schoolId: tenantB.schoolId,
      label: `${TEST_SUFFIX}-tenant-b`,
    });
    const demoActor = await prisma.user.findUniqueOrThrow({
      where: { email: DEMO_ADMIN_EMAIL },
      select: { id: true },
    });
    const foreignFile = await prisma.file.create({
      data: {
        organizationId: tenantB.organizationId,
        schoolId: tenantB.schoolId,
        uploaderId: demoActor.id,
        bucket: 'security-fixture',
        objectKey: `${TEST_SUFFIX}/foreign.csv`,
        originalName: 'foreign.csv',
        mimeType: 'text/csv',
        sizeBytes: 0,
        visibility: FileVisibility.PRIVATE,
      },
      select: { id: true },
    });
    foreignFileId = foreignFile.id;
    const foreignImportJob = await prisma.importJob.create({
      data: {
        schoolId: tenantB.schoolId,
        uploadedFileId: foreignFile.id,
        type: 'students_bulk_registration',
        status: ImportJobStatus.COMPLETED,
        createdById: demoActor.id,
      },
      select: { id: true },
    });
    foreignImportJobId = foreignImportJob.id;
    const foreignBatch = await prisma.studentBulkRegistrationBatch.create({
      data: {
        schoolId: tenantB.schoolId,
        organizationId: tenantB.organizationId,
        sourceImportJobId: foreignImportJob.id,
        academicYearId: tenantBPlacement.academicYearId,
        termId: tenantBPlacement.termId,
        classroomId: tenantBPlacement.classroomId,
        enrollmentDate: new Date('2026-09-01T00:00:00.000Z'),
        createdById: demoActor.id,
        status: StudentBulkRegistrationBatchStatus.READY,
      },
      select: { id: true },
    });
    foreignBatchId = foreignBatch.id;

    await createActor({
      email: `${TEST_SUFFIX}-records-only@moazez.local`,
      permissionCodes: ['students.records.manage'],
    });
    await createActor({
      email: `${TEST_SUFFIX}-enrollments-only@moazez.local`,
      permissionCodes: ['students.enrollments.manage'],
    });
    await createActor({
      email: `${TEST_SUFFIX}-no-scope@moazez.local`,
      permissionCodes: null,
    });

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(GLOBAL_PREFIX.replace(/^\//u, ''));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (prisma) {
      if (foreignBatchId) {
        await prisma.studentBulkRegistrationBatch.deleteMany({
          where: { id: foreignBatchId },
        });
      }
      if (foreignImportJobId) {
        await prisma.importJob.deleteMany({
          where: { id: foreignImportJobId },
        });
      }
      if (foreignFileId) {
        await prisma.file.deleteMany({ where: { id: foreignFileId } });
      }
      if (createdMembershipIds.size > 0) {
        await prisma.membership.deleteMany({
          where: { id: { in: [...createdMembershipIds] } },
        });
      }
      if (createdRoleIds.size > 0) {
        await prisma.rolePermission.deleteMany({
          where: { roleId: { in: [...createdRoleIds] } },
        });
        await prisma.role.deleteMany({
          where: { id: { in: [...createdRoleIds] } },
        });
      }
      if (createdUserIds.size > 0) {
        await prisma.auditLog.deleteMany({
          where: { actorId: { in: [...createdUserIds] } },
        });
        await prisma.session.deleteMany({
          where: { userId: { in: [...createdUserIds] } },
        });
        await prisma.user.deleteMany({
          where: { id: { in: [...createdUserIds] } },
        });
      }
      await deletePlacements();
      await prisma.$disconnect();
    }
    if (app) await app.close();
  });

  it('denies unauthenticated requests', async () => {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/bulk-registrations/preflight`)
      .send(payload(demoPlacement))
      .expect(401);
    expect(errorCode(response.body)).toBe('auth.token.invalid');
    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/students-guardians/bulk-registrations/${foreignBatchId}`,
      )
      .expect(401);
    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/students-guardians/bulk-registrations/${foreignBatchId}/rows`,
      )
      .expect(401);
    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/students-guardians/bulk-registrations/${foreignBatchId}/confirm`,
      )
      .expect(401);
  });

  it('denies an authenticated actor without active school scope', async () => {
    const token = await login(`${TEST_SUFFIX}-no-scope@moazez.local`);
    const response = await preflight(token, payload(demoPlacement)).expect(403);
    expect(errorCode(response.body)).toBe('auth.scope.missing');
  });

  it.each([
    ['students.enrollments.manage', `${TEST_SUFFIX}-records-only@moazez.local`],
    ['students.records.manage', `${TEST_SUFFIX}-enrollments-only@moazez.local`],
  ])('denies an actor missing %s', async (_permission, email) => {
    const token = await login(email);
    const response = await preflight(token, payload(demoPlacement)).expect(403);
    expect(errorCode(response.body)).toBe('auth.scope.missing');
    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/students-guardians/bulk-registrations/${foreignBatchId}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/students-guardians/bulk-registrations/${foreignBatchId}/rows`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/students-guardians/bulk-registrations/${foreignBatchId}/confirm`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('does not disclose a foreign-school batch or its rows', async () => {
    const token = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    for (const suffix of ['', '/rows']) {
      const response = await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/students-guardians/bulk-registrations/${foreignBatchId}${suffix}`,
        )
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
      expect(errorCode(response.body)).toBe('not_found');
    }
    const confirm = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/students-guardians/bulk-registrations/${foreignBatchId}/confirm`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
    expect(errorCode(confirm.body)).toBe('not_found');
  });

  it.each([
    ['academicYearId', () => tenantBPlacement.academicYearId],
    ['termId', () => tenantBPlacement.termId],
    ['classroomId', () => tenantBPlacement.classroomId],
  ] as const)('does not disclose a foreign-school %s', async (field, value) => {
    const token = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const response = await preflight(token, {
      ...payload(demoPlacement),
      [field]: value(),
    }).expect(404);
    expect(errorCode(response.body)).toBe('not_found');
  });

  it.each(['schoolId', 'organizationId'])(
    'rejects attempted %s injection before application execution',
    async (field) => {
      const token = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
      const response = await preflight(token, {
        ...payload(demoPlacement),
        [field]: randomUUID(),
      }).expect(400);
      expect(errorCode(response.body)).toBe('validation.failed');
    },
  );

  it.each(['schoolId', 'organizationId', 'actorId', 'roleId', 'loginDomain'])(
    'rejects attempted execution queue %s injection',
    (field) => {
      expect(
        isStudentBulkRegistrationExecutionJobData({
          batchId: randomUUID(),
          [field]: randomUUID(),
        }),
      ).toBe(false);
    },
  );

  async function login(
    email: string,
    password = TEST_PASSWORD,
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password })
      .expect(200);
    return (response.body as { accessToken: string }).accessToken;
  }

  function preflight(token: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/bulk-registrations/preflight`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  function payload(placement: PlacementFixture): Record<string, unknown> {
    return {
      academicYearId: placement.academicYearId,
      termId: placement.termId,
      classroomId: placement.classroomId,
      enrollmentDate: '2026-09-01',
    };
  }

  async function createTenantB(): Promise<{
    schoolId: string;
    organizationId: string;
  }> {
    const organization = await prisma.organization.create({
      data: {
        slug: `${TEST_SUFFIX}-org-b`,
        name: 'Bulk Registration Security Org B',
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.add(organization.id);
    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `${TEST_SUFFIX}-school-b`,
        name: 'Bulk Registration Security School B',
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.add(school.id);
    return { schoolId: school.id, organizationId: organization.id };
  }

  async function createActor(params: {
    email: string;
    permissionCodes: string[] | null;
  }): Promise<void> {
    const user = await prisma.user.create({
      data: {
        email: params.email,
        firstName: 'Bulk',
        lastName: 'Security',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(TEST_PASSWORD, ARGON2_OPTIONS),
      },
      select: { id: true },
    });
    createdUserIds.add(user.id);
    if (!params.permissionCodes) return;

    const role = await prisma.role.create({
      data: {
        schoolId: demoSchoolId,
        key: `${TEST_SUFFIX}-${params.permissionCodes[0]}`,
        name: 'Bulk Registration Security Role',
        isSystem: false,
      },
      select: { id: true },
    });
    createdRoleIds.add(role.id);
    const permissions = await prisma.permission.findMany({
      where: { code: { in: params.permissionCodes } },
      select: { id: true },
    });
    if (permissions.length !== params.permissionCodes.length) {
      throw new Error('Required Students permissions are missing from seed');
    }
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: role.id,
        permissionId: permission.id,
      })),
    });
    const membership = await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: demoOrganizationId,
        schoolId: demoSchoolId,
        roleId: role.id,
        userType: UserType.SCHOOL_USER,
        status: MembershipStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdMembershipIds.add(membership.id);
  }

  async function createPlacement(params: {
    schoolId: string;
    label: string;
  }): Promise<PlacementFixture> {
    const existingAcademicYear = await prisma.academicYear.findFirst({
      where: { schoolId: params.schoolId, isActive: true, deletedAt: null },
      select: { id: true },
    });
    const academicYear =
      existingAcademicYear ??
      (await prisma.academicYear.create({
        data: {
          schoolId: params.schoolId,
          nameAr: `${params.label}-year-ar`,
          nameEn: `${params.label}-year`,
          startDate: new Date('2026-09-01T00:00:00.000Z'),
          endDate: new Date('2027-06-30T00:00:00.000Z'),
          isActive: true,
        },
        select: { id: true },
      }));
    if (!existingAcademicYear) createdAcademicYearIds.add(academicYear.id);
    const existingTerm = await prisma.term.findFirst({
      where: {
        schoolId: params.schoolId,
        academicYearId: academicYear.id,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    const term =
      existingTerm ??
      (await prisma.term.create({
        data: {
          schoolId: params.schoolId,
          academicYearId: academicYear.id,
          nameAr: `${params.label}-term-ar`,
          nameEn: `${params.label}-term`,
          startDate: new Date('2026-09-01T00:00:00.000Z'),
          endDate: new Date('2026-12-31T00:00:00.000Z'),
          isActive: true,
        },
        select: { id: true },
      }));
    if (!existingTerm) createdTermIds.add(term.id);
    const stage = await prisma.stage.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${params.label}-stage-ar`,
        nameEn: `${params.label}-stage`,
        sortOrder: 100,
      },
      select: { id: true },
    });
    createdStageIds.add(stage.id);
    const grade = await prisma.grade.create({
      data: {
        schoolId: params.schoolId,
        stageId: stage.id,
        nameAr: `${params.label}-grade-ar`,
        nameEn: `${params.label}-grade`,
        sortOrder: 100,
      },
      select: { id: true },
    });
    createdGradeIds.add(grade.id);
    const section = await prisma.section.create({
      data: {
        schoolId: params.schoolId,
        gradeId: grade.id,
        nameAr: `${params.label}-section-ar`,
        nameEn: `${params.label}-section`,
        sortOrder: 100,
      },
      select: { id: true },
    });
    createdSectionIds.add(section.id);
    const classroom = await prisma.classroom.create({
      data: {
        schoolId: params.schoolId,
        sectionId: section.id,
        nameAr: `${params.label}-classroom-ar`,
        nameEn: `${params.label}-classroom`,
        sortOrder: 100,
        capacity: 10,
      },
      select: { id: true },
    });
    createdClassroomIds.add(classroom.id);
    return {
      academicYearId: academicYear.id,
      termId: term.id,
      classroomId: classroom.id,
    };
  }

  async function deletePlacements(): Promise<void> {
    await prisma.classroom.deleteMany({
      where: { id: { in: [...createdClassroomIds] } },
    });
    await prisma.section.deleteMany({
      where: { id: { in: [...createdSectionIds] } },
    });
    await prisma.grade.deleteMany({
      where: { id: { in: [...createdGradeIds] } },
    });
    await prisma.stage.deleteMany({
      where: { id: { in: [...createdStageIds] } },
    });
    await prisma.term.deleteMany({
      where: { id: { in: [...createdTermIds] } },
    });
    await prisma.academicYear.deleteMany({
      where: { id: { in: [...createdAcademicYearIds] } },
    });
    await prisma.school.deleteMany({
      where: { id: { in: [...createdSchoolIds] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [...createdOrganizationIds] } },
    });
  }
});

interface PlacementFixture {
  academicYearId: string;
  termId: string;
  classroomId: string;
}

function errorCode(body: unknown): string | undefined {
  return (body as { error?: { code?: string } }).error?.code;
}
