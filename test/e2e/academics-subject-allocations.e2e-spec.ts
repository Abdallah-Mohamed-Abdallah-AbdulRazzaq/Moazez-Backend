import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'Sprint22BSubjectAlloc123!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

type ExpressLayer = {
  route?: {
    path?: string | string[];
    methods?: Record<string, boolean>;
  };
  handle?: {
    stack?: ExpressLayer[];
  };
};

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

type AcademicBase = {
  academicYearId: string;
  termId: string;
  inactiveTermId: string;
  stageId: string;
  gradeId: string;
  secondGradeId: string;
};

jest.setTimeout(180000);

describe('Academics subject allocations (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationId = '';
  let schoolId = '';
  let adminEmail = '';
  let academic: AcademicBase;
  let subjectId = '';
  let secondSubjectId = '';
  let createdCrudSubjectId = '';
  let adminAuth: AuthTokens;

  const suffix = randomUUID().split('-')[0];
  const marker = `s22b-e2e-${suffix}`;
  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdPermissionIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [viewPermission, managePermission] = await Promise.all([
      findOrCreatePermission({
        code: 'academics.subjects.view',
        resource: 'subjects',
        action: 'view',
        description: 'View academics subjects.',
      }),
      findOrCreatePermission({
        code: 'academics.subjects.manage',
        resource: 'subjects',
        action: 'manage',
        description: 'Manage academics subjects.',
      }),
    ]);

    organizationId = await createOrganization();
    schoolId = await createSchool(organizationId);
    academic = await createAcademicBase(schoolId);
    subjectId = await createSubject('math', 'Mathematics', '#2563eb');
    secondSubjectId = await createSubject('science', 'Science', '#16a34a');

    const allocationAdminRoleId = await createCustomRole({
      key: `${marker}-subject-allocation-admin`,
      name: `Sprint 22B Subject Allocation Admin ${suffix}`,
      permissionIds: [viewPermission.id, managePermission.id],
    });
    adminEmail = `${marker}-admin@example.test`;
    await createUserWithMembership({
      email: adminEmail,
      firstName: 'Sprint22B',
      lastName: 'Admin',
      userType: UserType.SCHOOL_USER,
      roleId: allocationAdminRoleId,
    });

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    await app.init();

    adminAuth = await login(adminEmail);
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
      await cleanupE2eData();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('registers subject allocation routes without removing existing subject CRUD routes', () => {
    const routes = listRegisteredRoutes();

    expect(routes).toEqual(
      expect.arrayContaining([
        'GET /api/v1/academics/subject-allocations',
        'PUT /api/v1/academics/subject-allocations/bulk',
        'GET /api/v1/academics/subjects',
        'POST /api/v1/academics/subjects',
        'PATCH /api/v1/academics/subjects/:id',
        'DELETE /api/v1/academics/subjects/:id',
      ]),
    );
  });

  it('lets a permissioned dashboard actor list an empty matrix', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/subject-allocations`)
      .query({ termId: academic.termId })
      .set('Authorization', bearer(adminAuth))
      .expect(200);

    expect(response.body).toEqual({ items: [] });
  });

  it('bulk saves subject allocations and returns a safe response shape', async () => {
    const response = await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/subject-allocations/bulk`)
      .set('Authorization', bearer(adminAuth))
      .send({
        termId: academic.termId,
        items: [
          {
            gradeId: academic.gradeId,
            subjectId,
            weeklyHours: 5,
          },
          {
            gradeId: academic.secondGradeId,
            subjectId: secondSubjectId,
            weeklyHours: 3,
          },
        ],
      })
      .expect(200);

    expect(response.body.items).toHaveLength(2);
    expect(response.body.items[0]).toMatchObject({
      academicYearId: academic.academicYearId,
      termId: academic.termId,
      gradeId: academic.gradeId,
      subjectId,
      weeklyHours: 5,
      grade: {
        id: academic.gradeId,
      },
      subject: {
        id: subjectId,
        code: `${marker}-MATH`,
        color: '#2563eb',
      },
    });
    expect(typeof response.body.items[0].createdAt).toBe('string');
    expect(typeof response.body.items[0].updatedAt).toBe('string');
    expectSafeAllocationPayload(response.body);
  });

  it('lists saved allocations by term and by grade', async () => {
    const termList = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/subject-allocations`)
      .query({ termId: academic.termId })
      .set('Authorization', bearer(adminAuth))
      .expect(200);

    expect(termList.body.items).toHaveLength(2);
    expect(termList.body.items.map((item: { subjectId: string }) => item.subjectId)).toEqual(
      expect.arrayContaining([subjectId, secondSubjectId]),
    );

    const gradeList = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/subject-allocations`)
      .query({ termId: academic.termId, gradeId: academic.gradeId })
      .set('Authorization', bearer(adminAuth))
      .expect(200);

    expect(gradeList.body.items).toHaveLength(1);
    expect(gradeList.body.items[0].gradeId).toBe(academic.gradeId);
    expect(gradeList.body.items[0].subjectId).toBe(subjectId);
  });

  it('bulk updates existing rows and does not delete omitted rows', async () => {
    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/subject-allocations/bulk`)
      .set('Authorization', bearer(adminAuth))
      .send({
        termId: academic.termId,
        items: [
          {
            gradeId: academic.gradeId,
            subjectId,
            weeklyHours: 8,
          },
        ],
      })
      .expect(200)
      .expect((response) => {
        expect(response.body.items).toHaveLength(1);
        expect(response.body.items[0].weeklyHours).toBe(8);
      });

    const listed = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/subject-allocations`)
      .query({ termId: academic.termId })
      .set('Authorization', bearer(adminAuth))
      .expect(200);

    expect(listed.body.items).toHaveLength(2);
    const updated = listed.body.items.find(
      (item: { gradeId: string; subjectId: string }) =>
        item.gradeId === academic.gradeId && item.subjectId === subjectId,
    );
    const omitted = listed.body.items.find(
      (item: { gradeId: string; subjectId: string }) =>
        item.gradeId === academic.secondGradeId &&
        item.subjectId === secondSubjectId,
    );
    expect(updated).toBeDefined();
    expect(omitted).toBeDefined();
    expect(updated?.weeklyHours).toBe(8);
    expect(omitted?.weeklyHours).toBe(3);
  });

  it('rejects invalid UUIDs, duplicate pairs, invalid hours, and closed term writes', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/subject-allocations`)
      .query({ termId: 'not-a-uuid' })
      .set('Authorization', bearer(adminAuth))
      .expect(400)
      .expect((response) => {
        expect(response.body?.error?.code).toBe('validation.failed');
      });

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/subject-allocations/bulk`)
      .set('Authorization', bearer(adminAuth))
      .send({
        termId: academic.termId,
        items: [
          {
            gradeId: academic.gradeId,
            subjectId,
            weeklyHours: 5,
          },
          {
            gradeId: academic.gradeId,
            subjectId,
            weeklyHours: 6,
          },
        ],
      })
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.subject_allocation.duplicate_pair',
        );
      });

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/subject-allocations/bulk`)
      .set('Authorization', bearer(adminAuth))
      .send({
        termId: academic.termId,
        items: [
          {
            gradeId: academic.gradeId,
            subjectId,
            weeklyHours: -1,
          },
        ],
      })
      .expect(400)
      .expect((response) => {
        expect(response.body?.error?.code).toBe('validation.failed');
      });

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/subject-allocations/bulk`)
      .set('Authorization', bearer(adminAuth))
      .send({
        termId: academic.inactiveTermId,
        items: [
          {
            gradeId: academic.gradeId,
            subjectId,
            weeklyHours: 5,
          },
        ],
      })
      .expect(409)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.subject_allocation.closed_term',
        );
      });
  });

  it('keeps existing subject CRUD routes functional', async () => {
    const created = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/subjects`)
      .set('Authorization', bearer(adminAuth))
      .send({
        nameAr: `${marker}-crud-subject-ar`,
        nameEn: `${marker}-crud-subject`,
        code: `${marker}-CRUD`,
        color: '#9333ea',
      })
      .expect(201);

    createdCrudSubjectId = created.body.id;
    expect(created.body).toMatchObject({
      id: createdCrudSubjectId,
      nameEn: `${marker}-crud-subject`,
      code: `${marker}-CRUD`,
    });

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/academics/subjects/${createdCrudSubjectId}`)
      .set('Authorization', bearer(adminAuth))
      .send({ nameEn: `${marker}-crud-subject-updated` })
      .expect(200)
      .expect((response) => {
        expect(response.body.nameEn).toBe(`${marker}-crud-subject-updated`);
      });

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/academics/subjects/${createdCrudSubjectId}`)
      .set('Authorization', bearer(adminAuth))
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({ ok: true });
      });
  });

  async function findOrCreatePermission(params: {
    code: string;
    resource: string;
    action: string;
    description: string;
  }): Promise<{ id: string }> {
    const permission = await prisma.permission.findUnique({
      where: { code: params.code },
      select: { id: true },
    });
    if (permission) return permission;

    const created = await prisma.permission.create({
      data: {
        code: params.code,
        module: 'academics',
        resource: params.resource,
        action: params.action,
        description: params.description,
      },
      select: { id: true },
    });
    createdPermissionIds.push(created.id);
    return created;
  }

  async function createOrganization(): Promise<string> {
    const organization = await prisma.organization.create({
      data: {
        slug: `${marker}-org`,
        name: `Sprint 22B Subject Allocation Org ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);
    return organization.id;
  }

  async function createSchool(inputOrganizationId: string): Promise<string> {
    const school = await prisma.school.create({
      data: {
        organizationId: inputOrganizationId,
        slug: `${marker}-school`,
        name: `Sprint 22B Subject Allocation School ${suffix}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);
    return school.id;
  }

  async function createCustomRole(params: {
    key: string;
    name: string;
    permissionIds: string[];
  }): Promise<string> {
    const role = await prisma.role.create({
      data: {
        schoolId,
        key: params.key,
        name: params.name,
        description: 'Subject allocation e2e test role',
        isSystem: false,
      },
      select: { id: true },
    });
    createdRoleIds.push(role.id);

    await prisma.rolePermission.createMany({
      data: params.permissionIds.map((permissionId) => ({
        roleId: role.id,
        permissionId,
      })),
    });

    return role.id;
  }

  async function createUserWithMembership(params: {
    email: string;
    firstName: string;
    lastName: string;
    userType: UserType;
    roleId: string;
  }): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: params.email,
        firstName: params.firstName,
        lastName: params.lastName,
        userType: params.userType,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(PASSWORD, ARGON2_OPTIONS),
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId,
        schoolId,
        roleId: params.roleId,
        userType: params.userType,
        status: MembershipStatus.ACTIVE,
      },
    });

    return user.id;
  }

  async function createAcademicBase(
    inputSchoolId: string,
  ): Promise<AcademicBase> {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId: inputSchoolId,
        nameAr: `${marker}-year-ar`,
        nameEn: `${marker}-year`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const term = await prisma.term.create({
      data: {
        schoolId: inputSchoolId,
        academicYearId: academicYear.id,
        nameAr: `${marker}-term-ar`,
        nameEn: `${marker}-term`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const inactiveTerm = await prisma.term.create({
      data: {
        schoolId: inputSchoolId,
        academicYearId: academicYear.id,
        nameAr: `${marker}-closed-term-ar`,
        nameEn: `${marker}-closed-term`,
        startDate: new Date('2027-01-01T00:00:00.000Z'),
        endDate: new Date('2027-03-31T00:00:00.000Z'),
        isActive: false,
      },
      select: { id: true },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId: inputSchoolId,
        nameAr: `${marker}-stage-ar`,
        nameEn: `${marker}-stage`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId: inputSchoolId,
        stageId: stage.id,
        nameAr: `${marker}-grade-ar`,
        nameEn: `${marker}-grade`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const secondGrade = await prisma.grade.create({
      data: {
        schoolId: inputSchoolId,
        stageId: stage.id,
        nameAr: `${marker}-second-grade-ar`,
        nameEn: `${marker}-second-grade`,
        sortOrder: 2,
      },
      select: { id: true },
    });

    return {
      academicYearId: academicYear.id,
      termId: term.id,
      inactiveTermId: inactiveTerm.id,
      stageId: stage.id,
      gradeId: grade.id,
      secondGradeId: secondGrade.id,
    };
  }

  async function createSubject(
    label: string,
    nameEn: string,
    color: string,
  ): Promise<string> {
    const subject = await prisma.subject.create({
      data: {
        schoolId,
        nameAr: `${marker}-${label}-ar`,
        nameEn,
        code: `${marker}-${label.toUpperCase()}`,
        color,
        isActive: true,
      },
      select: { id: true },
    });

    return subject.id;
  }

  async function login(email: string): Promise<AuthTokens> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    return {
      accessToken: response.body.accessToken,
      refreshToken: response.body.refreshToken,
    };
  }

  function listRegisteredRoutes(): string[] {
    const expressApp = app.getHttpAdapter().getInstance() as {
      _router?: { stack?: ExpressLayer[] };
      router?: { stack?: ExpressLayer[] };
    };
    const stack = expressApp._router?.stack ?? expressApp.router?.stack ?? [];
    const routes: string[] = [];

    collectRoutes(stack, routes);

    return routes.sort();
  }

  function collectRoutes(layers: ExpressLayer[], routes: string[]): void {
    for (const layer of layers) {
      if (layer.route?.path && layer.route.methods) {
        const paths = Array.isArray(layer.route.path)
          ? layer.route.path
          : [layer.route.path];
        const methods = Object.entries(layer.route.methods)
          .filter(([, enabled]) => enabled)
          .map(([method]) => method.toUpperCase());

        for (const path of paths) {
          for (const method of methods) {
            routes.push(`${method} ${normalizeRoutePath(path)}`);
          }
        }
      }

      if (layer.handle?.stack) {
        collectRoutes(layer.handle.stack, routes);
      }
    }
  }

  function normalizeRoutePath(path: string): string {
    return `/${path}`.replace(/\/{2,}/g, '/');
  }

  function bearer(tokens: AuthTokens): string {
    return `Bearer ${tokens.accessToken}`;
  }

  function expectSafeAllocationPayload(value: unknown): void {
    for (const forbiddenKey of ['schoolId', 'organizationId', 'deletedAt']) {
      expectNoObjectKey(value, forbiddenKey);
    }
  }

  function expectNoObjectKey(value: unknown, forbiddenKey: string): void {
    if (!value || typeof value !== 'object') return;

    if (Array.isArray(value)) {
      for (const item of value) expectNoObjectKey(item, forbiddenKey);
      return;
    }

    for (const [key, nested] of Object.entries(value)) {
      expect(key).not.toBe(forbiddenKey);
      expectNoObjectKey(nested, forbiddenKey);
    }
  }

  async function cleanupE2eData(): Promise<void> {
    if (!prisma) return;

    await prisma.session.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: { in: createdUserIds } },
          { schoolId: { in: createdSchoolIds } },
          { organizationId: { in: createdOrganizationIds } },
        ],
      },
    });
    await prisma.subjectAllocation.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.subject.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.grade.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.stage.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.term.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.academicYear.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.membership.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds } },
    });
    await prisma.rolePermission.deleteMany({
      where: { roleId: { in: createdRoleIds } },
    });
    await prisma.role.deleteMany({
      where: { id: { in: createdRoleIds } },
    });
    await prisma.permission.deleteMany({
      where: { id: { in: createdPermissionIds } },
    });
    await prisma.school.deleteMany({
      where: { id: { in: createdSchoolIds } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: createdOrganizationIds } },
    });
  }
});
