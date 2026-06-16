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
const PASSWORD = 'Sprint22CTeacherAllocation123!';
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
  closedTermId: string;
  stageId: string;
  gradeId: string;
  sectionAId: string;
  sectionBId: string;
  classroomAId: string;
  classroomBId: string;
};

jest.setTimeout(180000);

describe('Academics teacher allocation workflows (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationId = '';
  let schoolId = '';
  let adminEmail = '';
  let teacherUserId = '';
  let academic: AcademicBase;
  let mathSubjectId = '';
  let scienceSubjectId = '';
  let missingMatrixSubjectId = '';
  let closedTermAllocationId = '';
  let adminAuth: AuthTokens;

  const suffix = randomUUID().split('-')[0];
  const marker = `s22c-e2e-${suffix}`;
  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdPermissionIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [teacherRole, viewPermission, managePermission] = await Promise.all([
      findSystemRole('teacher'),
      findOrCreatePermission({
        code: 'academics.structure.view',
        resource: 'structure',
        action: 'view',
        description: 'View academic structure.',
      }),
      findOrCreatePermission({
        code: 'academics.structure.manage',
        resource: 'structure',
        action: 'manage',
        description: 'Manage academic structure.',
      }),
    ]);

    organizationId = await createOrganization();
    schoolId = await createSchool(organizationId);
    academic = await createAcademicBase(schoolId);
    mathSubjectId = await createSubject('math', 'Mathematics', '#2563eb');
    scienceSubjectId = await createSubject('science', 'Science', '#16a34a');
    missingMatrixSubjectId = await createSubject('history', 'History', '#9333ea');
    await createSubjectAllocation({
      termId: academic.termId,
      subjectId: mathSubjectId,
      weeklyHours: 5,
    });
    await createSubjectAllocation({
      termId: academic.termId,
      subjectId: scienceSubjectId,
      weeklyHours: 3,
    });
    await createSubjectAllocation({
      termId: academic.closedTermId,
      subjectId: mathSubjectId,
      weeklyHours: 5,
    });

    const adminRoleId = await createCustomRole({
      key: `${marker}-allocation-admin`,
      name: `Sprint 22C Allocation Admin ${suffix}`,
      permissionIds: [viewPermission.id, managePermission.id],
    });
    adminEmail = `${marker}-admin@example.test`;
    await createUserWithMembership({
      email: adminEmail,
      firstName: 'Sprint22C',
      lastName: 'Admin',
      userType: UserType.SCHOOL_USER,
      roleId: adminRoleId,
    });
    teacherUserId = await createUserWithMembership({
      email: `${marker}-teacher@example.test`,
      firstName: 'Mariam',
      lastName: 'Ali',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
    });
    closedTermAllocationId = await createTeacherAllocationDirect({
      termId: academic.closedTermId,
      subjectId: mathSubjectId,
      classroomId: academic.classroomAId,
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

  it('registers existing and new allocation routes without changing teacher schedule routes', () => {
    const routes = listRegisteredRoutes();

    expect(routes).toEqual(
      expect.arrayContaining([
        'GET /api/v1/academics/allocations',
        'POST /api/v1/academics/allocations',
        'DELETE /api/v1/academics/allocations/:id',
        'PUT /api/v1/academics/allocations/bulk',
        'POST /api/v1/academics/allocations/apply-to-grade',
        'POST /api/v1/academics/allocations/clear-subject',
        'GET /api/v1/academics/allocations/validation',
        'GET /api/v1/academics/allocations/teacher-loads',
        'GET /api/v1/teacher/schedule',
        'GET /api/v1/teacher/schedule/week',
      ]),
    );
  });

  it('preserves existing list, create, and delete allocation routes', async () => {
    const created = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/allocations`)
      .set('Authorization', bearer(adminAuth))
      .send({
        teacherUserId,
        subjectId: mathSubjectId,
        classroomId: academic.classroomAId,
        termId: academic.termId,
      })
      .expect(201);

    expect(created.body).toMatchObject({
      teacher: { id: teacherUserId, fullName: 'Mariam Ali' },
      subject: { id: mathSubjectId, code: `${marker}-MATH` },
      classroom: { id: academic.classroomAId },
      term: { id: academic.termId, status: 'open' },
    });
    expectSafeAllocationPayload(created.body);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/allocations`)
      .query({ termId: academic.termId })
      .set('Authorization', bearer(adminAuth))
      .expect(200)
      .expect((response) => {
        expect(response.body.items.map((item: { id: string }) => item.id)).toContain(
          created.body.id,
        );
      });

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/academics/allocations/${created.body.id}`)
      .set('Authorization', bearer(adminAuth))
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({ ok: true });
      });
  });

  it('bulk saves allocations using the subject allocation matrix', async () => {
    const response = await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/allocations/bulk`)
      .set('Authorization', bearer(adminAuth))
      .send({
        termId: academic.termId,
        items: [
          {
            teacherUserId,
            subjectId: mathSubjectId,
            classroomId: academic.classroomAId,
          },
          {
            teacherUserId,
            subjectId: mathSubjectId,
            classroomId: academic.classroomBId,
          },
        ],
      })
      .expect(200);

    expect(response.body.items).toHaveLength(2);
    expect(response.body.summary).toEqual({
      requestedCount: 2,
      createdCount: 2,
      existingCount: 0,
    });
    expectSafeAllocationPayload(response.body);
  });

  it('rejects duplicate pairs and missing subject allocation matrix rows for writes', async () => {
    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/allocations/bulk`)
      .set('Authorization', bearer(adminAuth))
      .send({
        termId: academic.termId,
        items: [
          {
            teacherUserId,
            subjectId: mathSubjectId,
            classroomId: academic.classroomAId,
          },
          {
            teacherUserId,
            subjectId: mathSubjectId,
            classroomId: academic.classroomAId,
          },
        ],
      })
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.allocation.duplicate_pair',
        );
      });

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/allocations/bulk`)
      .set('Authorization', bearer(adminAuth))
      .send({
        termId: academic.termId,
        items: [
          {
            teacherUserId,
            subjectId: missingMatrixSubjectId,
            classroomId: academic.classroomAId,
          },
        ],
      })
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.allocation.missing_subject_allocation',
        );
      });
  });

  it('applies a teacher and subject to all classrooms in a grade', async () => {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/allocations/apply-to-grade`)
      .set('Authorization', bearer(adminAuth))
      .send({
        termId: academic.termId,
        gradeId: academic.gradeId,
        subjectId: scienceSubjectId,
        teacherUserId,
      })
      .expect(201);

    expect(response.body.items).toHaveLength(2);
    expect(response.body.summary).toEqual({
      requestedClassrooms: 2,
      createdCount: 2,
      existingCount: 0,
    });
    expect(
      response.body.items.map((item: { classroom: { id: string } }) => item.classroom.id),
    ).toEqual(expect.arrayContaining([academic.classroomAId, academic.classroomBId]));
  });

  it('clear-subject removes only intended allocations and validation reports incomplete then complete states', async () => {
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/allocations/clear-subject`)
      .set('Authorization', bearer(adminAuth))
      .send({
        termId: academic.termId,
        gradeId: academic.gradeId,
        subjectId: mathSubjectId,
      })
      .expect(201)
      .expect((response) => {
        expect(response.body).toEqual({ ok: true, deletedCount: 2 });
      });

    const incomplete = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/allocations/validation`)
      .query({
        termId: academic.termId,
        gradeId: academic.gradeId,
        subjectId: mathSubjectId,
      })
      .set('Authorization', bearer(adminAuth))
      .expect(200);
    expect(incomplete.body.items[0]).toMatchObject({
      status: 'incomplete',
      missingClassroomCount: 2,
    });
    expect(incomplete.body.summary.missingTeacherAssignments).toBe(2);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/allocations/apply-to-grade`)
      .set('Authorization', bearer(adminAuth))
      .send({
        termId: academic.termId,
        gradeId: academic.gradeId,
        subjectId: mathSubjectId,
        teacherUserId,
      })
      .expect(201);

    const complete = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/allocations/validation`)
      .query({
        termId: academic.termId,
        gradeId: academic.gradeId,
        subjectId: mathSubjectId,
      })
      .set('Authorization', bearer(adminAuth))
      .expect(200);
    expect(complete.body.items[0]).toMatchObject({
      status: 'complete',
      missingClassroomCount: 0,
    });
    expect(complete.body.summary.missingTeacherAssignments).toBe(0);
    expectSafeAllocationPayload(complete.body);
  });

  it('teacher-loads sums weekly hours from the subject allocation matrix', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/allocations/teacher-loads`)
      .query({ termId: academic.termId, teacherUserId })
      .set('Authorization', bearer(adminAuth))
      .expect(200);

    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({
      teacherUserId,
      allocationCount: 4,
      totalWeeklyHours: 16,
      classroomsCount: 2,
      subjectsCount: 2,
      warnings: [],
    });
    expect(response.body.items[0].teacher).toEqual({
      id: teacherUserId,
      firstName: 'Mariam',
      lastName: 'Ali',
    });
    expectSafeAllocationPayload(response.body);
    expect(JSON.stringify(response.body)).not.toContain(`${marker}-teacher@example.test`);
  });

  it('denies closed-term create, delete, bulk, apply, and clear mutations', async () => {
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/allocations`)
      .set('Authorization', bearer(adminAuth))
      .send({
        teacherUserId,
        subjectId: mathSubjectId,
        classroomId: academic.classroomAId,
        termId: academic.closedTermId,
      })
      .expect(409)
      .expect((response) => {
        expect(response.body?.error?.code).toBe('academics.allocation.closed_term');
      });

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/academics/allocations/${closedTermAllocationId}`)
      .set('Authorization', bearer(adminAuth))
      .expect(409)
      .expect((response) => {
        expect(response.body?.error?.code).toBe('academics.allocation.closed_term');
      });

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/allocations/bulk`)
      .set('Authorization', bearer(adminAuth))
      .send({
        termId: academic.closedTermId,
        items: [
          {
            teacherUserId,
            subjectId: mathSubjectId,
            classroomId: academic.classroomAId,
          },
        ],
      })
      .expect(409);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/allocations/apply-to-grade`)
      .set('Authorization', bearer(adminAuth))
      .send({
        termId: academic.closedTermId,
        gradeId: academic.gradeId,
        subjectId: mathSubjectId,
        teacherUserId,
      })
      .expect(409);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/allocations/clear-subject`)
      .set('Authorization', bearer(adminAuth))
      .send({
        termId: academic.closedTermId,
        gradeId: academic.gradeId,
        subjectId: mathSubjectId,
      })
      .expect(409);
  });

  async function findSystemRole(key: string): Promise<{ id: string }> {
    const role = await prisma.role.findFirst({
      where: { key, schoolId: null, isSystem: true, deletedAt: null },
      select: { id: true },
    });
    if (!role) throw new Error(`Missing system role: ${key}`);
    return role;
  }

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
        name: `Sprint 22C Allocation Org ${suffix}`,
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
        name: `Sprint 22C Allocation School ${suffix}`,
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
        description: 'Teacher allocation workflow e2e test role',
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
    const closedTerm = await prisma.term.create({
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
    const sectionA = await prisma.section.create({
      data: {
        schoolId: inputSchoolId,
        gradeId: grade.id,
        nameAr: `${marker}-section-a-ar`,
        nameEn: `${marker}-section-a`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const sectionB = await prisma.section.create({
      data: {
        schoolId: inputSchoolId,
        gradeId: grade.id,
        nameAr: `${marker}-section-b-ar`,
        nameEn: `${marker}-section-b`,
        sortOrder: 2,
      },
      select: { id: true },
    });
    const classroomA = await prisma.classroom.create({
      data: {
        schoolId: inputSchoolId,
        sectionId: sectionA.id,
        nameAr: `${marker}-classroom-a-ar`,
        nameEn: `${marker}-classroom-a`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const classroomB = await prisma.classroom.create({
      data: {
        schoolId: inputSchoolId,
        sectionId: sectionB.id,
        nameAr: `${marker}-classroom-b-ar`,
        nameEn: `${marker}-classroom-b`,
        sortOrder: 2,
      },
      select: { id: true },
    });

    return {
      academicYearId: academicYear.id,
      termId: term.id,
      closedTermId: closedTerm.id,
      stageId: stage.id,
      gradeId: grade.id,
      sectionAId: sectionA.id,
      sectionBId: sectionB.id,
      classroomAId: classroomA.id,
      classroomBId: classroomB.id,
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

  async function createSubjectAllocation(params: {
    termId: string;
    subjectId: string;
    weeklyHours: number;
  }): Promise<string> {
    const allocation = await prisma.subjectAllocation.create({
      data: {
        schoolId,
        academicYearId: academic.academicYearId,
        termId: params.termId,
        gradeId: academic.gradeId,
        subjectId: params.subjectId,
        weeklyHours: params.weeklyHours,
      },
      select: { id: true },
    });

    return allocation.id;
  }

  async function createTeacherAllocationDirect(params: {
    termId: string;
    subjectId: string;
    classroomId: string;
  }): Promise<string> {
    const allocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId,
        teacherUserId,
        subjectId: params.subjectId,
        classroomId: params.classroomId,
        termId: params.termId,
      },
      select: { id: true },
    });

    return allocation.id;
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
    for (const forbiddenKey of [
      'schoolId',
      'organizationId',
      'membershipId',
      'roleId',
      'passwordHash',
    ]) {
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
    await prisma.teacherSubjectAllocation.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.subjectAllocation.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.subject.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.classroom.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.section.deleteMany({
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
