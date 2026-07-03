import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';
const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';
const DEMO_SCHOOL_SLUG = 'moazez-academy';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(30000);

describe('Students guardians canonical route aliases (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let demoSchoolId: string;
  let demoOrganizationId: string;
  let adminAccessToken: string;
  let viewAccessToken: string;
  let noPermissionAccessToken: string;
  let fixtureGuardianId: string;
  let fixtureStudentId: string;
  let tenantBSchoolId: string;
  let tenantBOrganizationId: string;
  let tenantBGuardianId: string;

  const testSuffix = `guardian-routes-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const cleanupState = {
    roleIds: new Set<string>(),
    userIds: new Set<string>(),
    guardianIds: new Set<string>(),
    studentIds: new Set<string>(),
  };

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const demoSchool = await prisma.school.findFirst({
      where: { slug: DEMO_SCHOOL_SLUG },
      select: { id: true, organizationId: true },
    });

    if (!demoSchool) {
      throw new Error('Demo school not found - run `npm run seed` first.');
    }

    demoSchoolId = demoSchool.id;
    demoOrganizationId = demoSchool.organizationId;

    const permissionRows = await prisma.permission.findMany({
      where: {
        code: {
          in: [
            'students.guardians.view',
            'students.guardians.manage',
            'students.records.view',
          ],
        },
      },
      select: { id: true, code: true },
    });

    const permissionIdsByCode = new Map(
      permissionRows.map((permission) => [permission.code, permission.id]),
    );

    for (const permissionCode of [
      'students.guardians.view',
      'students.guardians.manage',
      'students.records.view',
    ]) {
      if (!permissionIdsByCode.has(permissionCode)) {
        throw new Error(
          `Missing ${permissionCode} permission - run \`npm run seed\` first.`,
        );
      }
    }

    const [viewRole, noPermissionRole] = await Promise.all([
      prisma.role.create({
        data: {
          schoolId: demoSchoolId,
          key: `${testSuffix}-view-role`,
          name: `${testSuffix} View Role`,
          description: 'Guardians route regression view-only role',
          isSystem: false,
        },
        select: { id: true },
      }),
      prisma.role.create({
        data: {
          schoolId: demoSchoolId,
          key: `${testSuffix}-no-permission-role`,
          name: `${testSuffix} No Permission Role`,
          description: 'Guardians route regression no-permission role',
          isSystem: false,
        },
        select: { id: true },
      }),
    ]);
    cleanupState.roleIds.add(viewRole.id);
    cleanupState.roleIds.add(noPermissionRole.id);

    await prisma.rolePermission.createMany({
      data: [
        {
          roleId: viewRole.id,
          permissionId: permissionIdsByCode.get('students.guardians.view')!,
        },
        {
          roleId: viewRole.id,
          permissionId: permissionIdsByCode.get('students.records.view')!,
        },
      ],
      skipDuplicates: true,
    });

    const passwordHash = await argon2.hash(
      'GuardianRoutes123!',
      ARGON2_OPTIONS,
    );

    const [viewUser, noPermissionUser] = await Promise.all([
      prisma.user.create({
        data: {
          email: `${testSuffix}-view@moazez.local`,
          firstName: 'Guardian',
          lastName: 'Viewer',
          userType: UserType.SCHOOL_USER,
          status: UserStatus.ACTIVE,
          passwordHash,
        },
        select: { id: true },
      }),
      prisma.user.create({
        data: {
          email: `${testSuffix}-none@moazez.local`,
          firstName: 'Guardian',
          lastName: 'NoPermission',
          userType: UserType.SCHOOL_USER,
          status: UserStatus.ACTIVE,
          passwordHash,
        },
        select: { id: true },
      }),
    ]);
    cleanupState.userIds.add(viewUser.id);
    cleanupState.userIds.add(noPermissionUser.id);

    await prisma.membership.createMany({
      data: [
        {
          userId: viewUser.id,
          organizationId: demoOrganizationId,
          schoolId: demoSchoolId,
          roleId: viewRole.id,
          userType: UserType.SCHOOL_USER,
          status: MembershipStatus.ACTIVE,
        },
        {
          userId: noPermissionUser.id,
          organizationId: demoOrganizationId,
          schoolId: demoSchoolId,
          roleId: noPermissionRole.id,
          userType: UserType.SCHOOL_USER,
          status: MembershipStatus.ACTIVE,
        },
      ],
    });

    const tenantBOrganization = await prisma.organization.create({
      data: {
        name: `${testSuffix} Tenant B`,
        slug: `${testSuffix}-tenant-b`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    tenantBOrganizationId = tenantBOrganization.id;

    const tenantBSchool = await prisma.school.create({
      data: {
        organizationId: tenantBOrganizationId,
        name: `${testSuffix} Tenant B School`,
        slug: `${testSuffix}-tenant-b-school`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    tenantBSchoolId = tenantBSchool.id;

    const [fixtureStudent, fixtureGuardian, tenantBGuardian] =
      await Promise.all([
        prisma.student.create({
          data: {
            schoolId: demoSchoolId,
            organizationId: demoOrganizationId,
            firstName: 'Route',
            lastName: `Student ${testSuffix}`,
            birthDate: new Date('2014-05-10T00:00:00.000Z'),
            status: StudentStatus.ACTIVE,
          },
          select: { id: true },
        }),
        prisma.guardian.create({
          data: {
            schoolId: demoSchoolId,
            organizationId: demoOrganizationId,
            firstName: 'Fda',
            lastName: `Fixture ${testSuffix}`,
            phone: '+201011990001',
            email: `${testSuffix}-fixture@example.com`,
            relation: 'father',
            isPrimary: true,
          },
          select: { id: true },
        }),
        prisma.guardian.create({
          data: {
            schoolId: tenantBSchoolId,
            organizationId: tenantBOrganizationId,
            firstName: 'Tenant',
            lastName: `Guardian ${testSuffix}`,
            phone: '+201011990002',
            email: `${testSuffix}-tenant-b@example.com`,
            relation: 'mother',
            isPrimary: true,
          },
          select: { id: true },
        }),
      ]);

    fixtureStudentId = fixtureStudent.id;
    fixtureGuardianId = fixtureGuardian.id;
    tenantBGuardianId = tenantBGuardian.id;
    cleanupState.studentIds.add(fixtureStudentId);
    cleanupState.guardianIds.add(fixtureGuardianId);
    cleanupState.guardianIds.add(tenantBGuardianId);

    await prisma.studentGuardian.create({
      data: {
        schoolId: demoSchoolId,
        studentId: fixtureStudentId,
        guardianId: fixtureGuardianId,
        isPrimary: true,
      },
    });

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(GLOBAL_PREFIX.replace(/^\//, ''));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    adminAccessToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    viewAccessToken = await login(
      `${testSuffix}-view@moazez.local`,
      'GuardianRoutes123!',
    );
    noPermissionAccessToken = await login(
      `${testSuffix}-none@moazez.local`,
      'GuardianRoutes123!',
    );
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    if (prisma) {
      const userIds = [...cleanupState.userIds];
      const roleIds = [...cleanupState.roleIds];
      const studentIds = [...cleanupState.studentIds];
      const guardianIds = [...cleanupState.guardianIds];

      await prisma.studentGuardian.deleteMany({
        where: {
          OR: [
            { studentId: { in: studentIds } },
            { guardianId: { in: guardianIds } },
          ],
        },
      });
      await prisma.guardian.deleteMany({
        where: { id: { in: guardianIds } },
      });
      await prisma.student.deleteMany({
        where: { id: { in: studentIds } },
      });
      await prisma.session.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.membership.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: roleIds } },
      });
      await prisma.role.deleteMany({
        where: { id: { in: roleIds } },
      });
      await prisma.school.deleteMany({
        where: { id: tenantBSchoolId },
      });
      await prisma.organization.deleteMany({
        where: { id: tenantBOrganizationId },
      });
      await prisma.$disconnect();
    }
  });

  async function login(email: string, password: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password })
      .expect(200);

    return response.body.accessToken;
  }

  function expectGuardianPublicShape(body: Record<string, unknown>): void {
    expect(body).toEqual(
      expect.objectContaining({
        guardianId: expect.any(String),
        full_name: expect.any(String),
        relation: expect.any(String),
        phone_primary: expect.any(String),
        is_primary: expect.any(Boolean),
      }),
    );
    expectNoInternalLeak(body);
  }

  function expectNoInternalLeak(body: unknown): void {
    const serialized = JSON.stringify(body);

    for (const key of [
      'schoolId',
      'organizationId',
      'membershipId',
      'roleId',
      'deletedAt',
      'passwordHash',
      'userId',
      'applicationId',
      'bucket',
      'objectKey',
      'provider',
      'signedUrl',
      'actorId',
      'auditLog',
    ]) {
      expect(serialized).not.toContain(`"${key}"`);
    }
  }

  function nextPhone(): string {
    return `+2010${Math.floor(10000000 + Math.random() * 89999999)}`;
  }

  it('supports canonical and legacy guardians list/search without hitting student uuid validation', async () => {
    const createResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/guardians`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        full_name: `Fda Canonical ${testSuffix}`,
        relation: 'father',
        phone_primary: nextPhone(),
        email: `${testSuffix}-canonical@example.com`,
      })
      .expect(201);

    cleanupState.guardianIds.add(createResponse.body.guardianId);
    expectGuardianPublicShape(createResponse.body);

    const canonicalListResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/students-guardians/guardians?search=fda`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);

    const legacyListResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/students-guardians/students/guardians?search=fda`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);

    expect(legacyListResponse.body?.error?.code).not.toBe('validation.failed');
    expect(canonicalListResponse.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ guardianId: createResponse.body.guardianId }),
      ]),
    );
    expect(legacyListResponse.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ guardianId: createResponse.body.guardianId }),
      ]),
    );
    expect(Object.keys(legacyListResponse.body[0]).sort()).toEqual(
      Object.keys(canonicalListResponse.body[0]).sort(),
    );
    expectNoInternalLeak(canonicalListResponse.body);
    expectNoInternalLeak(legacyListResponse.body);
  });

  it('supports canonical guardian CRUD-style reads and legacy aliases', async () => {
    const canonicalGetResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/students-guardians/guardians/${fixtureGuardianId}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);

    expectGuardianPublicShape(canonicalGetResponse.body);

    const canonicalPatchResponse = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/students-guardians/guardians/${fixtureGuardianId}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ relation: 'uncle' })
      .expect(200);

    expect(canonicalPatchResponse.body).toEqual(
      expect.objectContaining({
        guardianId: fixtureGuardianId,
        relation: 'uncle',
      }),
    );
    expectGuardianPublicShape(canonicalPatchResponse.body);

    const canonicalStudentsResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/students-guardians/guardians/${fixtureGuardianId}/students`,
      )
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);

    expect(canonicalStudentsResponse.body).toEqual({
      guardian: expect.objectContaining({ guardianId: fixtureGuardianId }),
      students: [
        expect.objectContaining({
          id: fixtureStudentId,
          full_name_en: expect.stringContaining('Route'),
        }),
      ],
    });
    expectNoInternalLeak(canonicalStudentsResponse.body);

    const legacyGetResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/students-guardians/students/guardians/${fixtureGuardianId}`,
      )
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    expectGuardianPublicShape(legacyGetResponse.body);

    const legacyPatchResponse = await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/students-guardians/students/guardians/${fixtureGuardianId}`,
      )
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ workplace: 'Route Regression Office' })
      .expect(200);
    expect(legacyPatchResponse.body).toEqual(
      expect.objectContaining({
        guardianId: fixtureGuardianId,
        workplace: 'Route Regression Office',
      }),
    );
    expectGuardianPublicShape(legacyPatchResponse.body);

    const legacyStudentsResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/students-guardians/students/guardians/${fixtureGuardianId}/students`,
      )
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);

    expect(legacyStudentsResponse.body).toEqual({
      guardian: expect.objectContaining({ guardianId: fixtureGuardianId }),
      students: [
        expect.objectContaining({
          id: fixtureStudentId,
          full_name_en: expect.stringContaining('Route'),
        }),
      ],
    });
    expectNoInternalLeak(legacyStudentsResponse.body);
  });

  it('keeps legacy guardian create route working', async () => {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/students/guardians`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        full_name: `Legacy Create ${testSuffix}`,
        relation: 'mother',
        phone_primary: nextPhone(),
        email: `${testSuffix}-legacy-create@example.com`,
      })
      .expect(201);

    cleanupState.guardianIds.add(response.body.guardianId);
    expectGuardianPublicShape(response.body);
  });

  it('preserves dynamic student id uuid validation', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/students-guardians/students/not-a-uuid`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(400);

    expect(response.body?.error?.code).toBe('validation.failed');
    expect(response.body?.error?.message).toContain('uuid');
  });

  it('preserves guardian route permissions including the canonical account route', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/students-guardians/guardians`)
      .set('Authorization', `Bearer ${noPermissionAccessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/students-guardians/students/guardians`)
      .set('Authorization', `Bearer ${noPermissionAccessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/students-guardians/guardians?search=fda`)
      .set('Authorization', `Bearer ${viewAccessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/students-guardians/students/guardians?search=fda`)
      .set('Authorization', `Bearer ${viewAccessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/guardians`)
      .set('Authorization', `Bearer ${viewAccessToken}`)
      .send({
        full_name: `Forbidden Create ${testSuffix}`,
        relation: 'father',
        phone_primary: nextPhone(),
      })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/students-guardians/guardians/${fixtureGuardianId}`)
      .set('Authorization', `Bearer ${viewAccessToken}`)
      .send({ relation: 'father' })
      .expect(403);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/students-guardians/guardians/${fixtureGuardianId}/account`,
      )
      .set('Authorization', `Bearer ${viewAccessToken}`)
      .send({ mode: 'create', temporaryPasswordMode: 'none' })
      .expect(403);
  });

  it('keeps cross-school guardian access hidden on canonical routes', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/students-guardians/guardians/${tenantBGuardianId}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });
});
