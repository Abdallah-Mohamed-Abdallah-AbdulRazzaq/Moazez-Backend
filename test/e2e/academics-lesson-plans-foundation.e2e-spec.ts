import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CurriculumStatus,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolStatus,
  TimetableConfigStatus,
  TimetableEntryStatus,
  TimetablePeriodType,
  TimetableScopeType,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'Sprint15D123!';
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
  stageId: string;
  gradeId: string;
  sectionId: string;
  classroomId: string;
  subjectId: string;
};

type LessonPrerequisites = {
  teacherUserId: string;
  allocationId: string;
  curriculumId: string;
  unitOneId: string;
  unitTwoId: string;
  lessonOneId: string;
  lessonTwoId: string;
  timetableConfigId: string;
  periodId: string;
  timetableEntryId: string;
};

jest.setTimeout(180000);

describe('Sprint 15D Academics Lesson Plans Foundation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationId = '';
  let schoolId = '';
  let adminUserId = '';
  let adminEmail = '';
  let academic: AcademicBase;
  let prerequisites: LessonPrerequisites;
  let adminAuth: AuthTokens;
  let lessonPlanId = '';
  let itemOneId = '';
  let itemTwoId = '';
  let itemThreeId = '';

  const suffix = randomUUID().split('-')[0];
  const marker = `s15d-${suffix}`;
  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const schoolAdminRole = await findSystemRole('school_admin');

    organizationId = await createOrganization();
    schoolId = await createSchool(organizationId);
    academic = await createAcademicBase(schoolId);
    adminEmail = `${marker}-admin@example.test`;
    adminUserId = await createUserWithMembership({
      email: adminEmail,
      firstName: 'Sprint15D',
      lastName: 'Admin',
      userType: UserType.SCHOOL_USER,
      roleId: schoolAdminRole.id,
    });
    prerequisites = await createLessonPrerequisites();

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
      await cleanupCloseoutData();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('registers backend-native lesson plan routes and keeps deferred routes absent', () => {
    const routes = listRegisteredRoutes();

    expect(routes).toEqual(
      expect.arrayContaining([
        'GET /api/v1/academics/lesson-plans',
        'POST /api/v1/academics/lesson-plans',
        'GET /api/v1/academics/lesson-plans/:lessonPlanId',
        'PATCH /api/v1/academics/lesson-plans/:lessonPlanId',
        'POST /api/v1/academics/lesson-plans/:lessonPlanId/activate',
        'POST /api/v1/academics/lesson-plans/:lessonPlanId/archive',
        'DELETE /api/v1/academics/lesson-plans/:lessonPlanId',
        'POST /api/v1/academics/lesson-plans/:lessonPlanId/items',
        'PATCH /api/v1/academics/lesson-plans/:lessonPlanId/items/:itemId',
        'PATCH /api/v1/academics/lesson-plans/:lessonPlanId/items/:itemId/reorder',
        'POST /api/v1/academics/lesson-plans/:lessonPlanId/items/:itemId/start',
        'POST /api/v1/academics/lesson-plans/:lessonPlanId/items/:itemId/complete',
        'POST /api/v1/academics/lesson-plans/:lessonPlanId/items/:itemId/skip',
        'POST /api/v1/academics/lesson-plans/:lessonPlanId/items/:itemId/cancel',
        'DELETE /api/v1/academics/lesson-plans/:lessonPlanId/items/:itemId',
      ]),
    );

    for (const absentRoute of [
      'GET /api/v1/student/lesson-plans',
      'GET /api/v1/parent/lesson-plans',
      'POST /api/v1/homework/questions',
    ]) {
      expect(routes).not.toContain(absentRoute);
    }
  });

  it('creates, orders, transitions, activates, archives, and locks lesson plans', async () => {
    lessonPlanId = (
      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/academics/lesson-plans`)
        .set('Authorization', bearer(adminAuth))
        .send({
          academicYearId: academic.academicYearId,
          termId: academic.termId,
          teacherSubjectAllocationId: prerequisites.allocationId,
          curriculumId: prerequisites.curriculumId,
          title: '  Week 2 Fractions Plan  ',
          description: '  Planned classroom teaching flow.  ',
          weekStartDate: '2026-09-07',
          weekEndDate: '2026-09-11',
        })
        .expect(201)
        .expect((response) => {
          expect(response.body).toMatchObject({
            title: 'Week 2 Fractions Plan',
            description: 'Planned classroom teaching flow.',
            status: 'draft',
            academicYearId: academic.academicYearId,
            termId: academic.termId,
            teacherSubjectAllocationId: prerequisites.allocationId,
            teacherUserId: prerequisites.teacherUserId,
            classroomId: academic.classroomId,
            subjectId: academic.subjectId,
            curriculumId: prerequisites.curriculumId,
            weekStartDate: '2026-09-07',
            weekEndDate: '2026-09-11',
            items: [],
          });
          expectNoObjectKey(response.body, 'schoolId');
          expectNoObjectKey(response.body, 'organizationId');
        })
    ).body.lessonPlanId;

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/lesson-plans`)
      .set('Authorization', bearer(adminAuth))
      .send({
        academicYearId: academic.academicYearId,
        termId: academic.termId,
        teacherSubjectAllocationId: prerequisites.allocationId,
        curriculumId: prerequisites.curriculumId,
        title: 'Duplicate Plan',
        weekStartDate: '2026-09-07',
        weekEndDate: '2026-09-11',
      })
      .expect(409)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.lesson_plan.duplicate',
        );
      });

    itemOneId = (
      await request(app.getHttpServer())
        .post(`${planUrl()}/items`)
        .set('Authorization', bearer(adminAuth))
        .send({
          unitId: prerequisites.unitOneId,
          lessonId: prerequisites.lessonOneId,
          timetableEntryId: prerequisites.timetableEntryId,
          plannedDate: '2026-09-08',
          title: 'Fractions mini lesson',
          sortOrder: 5,
        })
        .expect(201)
        .expect((response) => {
          expect(response.body).toMatchObject({
            title: 'Fractions mini lesson',
            status: 'planned',
            timetableEntryId: prerequisites.timetableEntryId,
            periodId: prerequisites.periodId,
            plannedDate: '2026-09-08',
            dayOfWeek: 2,
            sortOrder: 5,
          });
          expectNoObjectKey(response.body, 'schoolId');
          expectNoObjectKey(response.body, 'organizationId');
        })
    ).body.itemId;

    itemTwoId = (
      await request(app.getHttpServer())
        .post(`${planUrl()}/items`)
        .set('Authorization', bearer(adminAuth))
        .send({
          unitId: prerequisites.unitTwoId,
          lessonId: prerequisites.lessonTwoId,
          plannedDate: '2026-09-09',
          sortOrder: 10,
        })
        .expect(201)
    ).body.itemId;

    itemThreeId = (
      await request(app.getHttpServer())
        .post(`${planUrl()}/items`)
        .set('Authorization', bearer(adminAuth))
        .send({
          unitId: prerequisites.unitOneId,
          lessonId: prerequisites.lessonOneId,
          title: 'Backup activity',
          sortOrder: 20,
        })
        .expect(201)
    ).body.itemId;

    await request(app.getHttpServer())
      .patch(`${planUrl()}/items/${itemTwoId}/reorder`)
      .set('Authorization', bearer(adminAuth))
      .send({ sortOrder: 0 })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          itemId: itemTwoId,
          sortOrder: 0,
        });
      });

    await request(app.getHttpServer())
      .post(`${planUrl()}/items/${itemOneId}/start`)
      .set('Authorization', bearer(adminAuth))
      .send({})
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          itemId: itemOneId,
          status: 'in_progress',
          startedAt: expect.any(String),
        });
      });

    await request(app.getHttpServer())
      .post(`${planUrl()}/items/${itemOneId}/complete`)
      .set('Authorization', bearer(adminAuth))
      .send({})
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          itemId: itemOneId,
          status: 'done',
          completedAt: expect.any(String),
        });
      });

    await request(app.getHttpServer())
      .post(`${planUrl()}/items/${itemTwoId}/skip`)
      .set('Authorization', bearer(adminAuth))
      .send({ note: 'Assembly replaced this period.' })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          itemId: itemTwoId,
          status: 'skipped',
          notes: 'Assembly replaced this period.',
          skippedAt: expect.any(String),
        });
      });

    await request(app.getHttpServer())
      .post(`${planUrl()}/items/${itemThreeId}/cancel`)
      .set('Authorization', bearer(adminAuth))
      .send({ note: 'Cancelled by school event.' })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          itemId: itemThreeId,
          status: 'cancelled',
          cancelledAt: expect.any(String),
        });
      });

    await request(app.getHttpServer())
      .get(planUrl())
      .set('Authorization', bearer(adminAuth))
      .expect(200)
      .expect((response) => {
        expect(
          response.body.items.map((item: { itemId: string }) => item.itemId),
        ).toEqual([itemTwoId, itemOneId, itemThreeId]);
        expect(
          response.body.items.map((item: { status: string }) => item.status),
        ).toEqual(['skipped', 'done', 'cancelled']);
        expectNoObjectKey(response.body, 'schoolId');
        expectNoObjectKey(response.body, 'organizationId');
      });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/lesson-plans`)
      .query({
        academicYearId: academic.academicYearId,
        termId: academic.termId,
        teacherSubjectAllocationId: prerequisites.allocationId,
        status: 'DRAFT',
        weekStartDate: '2026-09-07',
        search: 'fractions',
      })
      .set('Authorization', bearer(adminAuth))
      .expect(200)
      .expect((response) => {
        expect(
          response.body.items.map(
            (plan: { lessonPlanId: string }) => plan.lessonPlanId,
          ),
        ).toContain(lessonPlanId);
        expectNoObjectKey(response.body, 'schoolId');
        expectNoObjectKey(response.body, 'organizationId');
      });

    await request(app.getHttpServer())
      .post(`${planUrl()}/activate`)
      .set('Authorization', bearer(adminAuth))
      .send({})
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          lessonPlanId,
          status: 'active',
          activatedAt: expect.any(String),
        });
      });

    await request(app.getHttpServer())
      .post(`${planUrl()}/archive`)
      .set('Authorization', bearer(adminAuth))
      .send({})
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          lessonPlanId,
          status: 'archived',
          archivedAt: expect.any(String),
        });
      });

    for (const mutation of [
      () =>
        request(app.getHttpServer())
          .patch(planUrl())
          .set('Authorization', bearer(adminAuth))
          .send({ title: 'Archived Update' }),
      () =>
        request(app.getHttpServer())
          .post(`${planUrl()}/items`)
          .set('Authorization', bearer(adminAuth))
          .send({
            unitId: prerequisites.unitOneId,
            lessonId: prerequisites.lessonOneId,
          }),
      () =>
        request(app.getHttpServer())
          .post(`${planUrl()}/items/${itemThreeId}/start`)
          .set('Authorization', bearer(adminAuth))
          .send({}),
    ]) {
      await mutation()
        .expect(409)
        .expect((response) => {
          expect(response.body?.error?.code).toBe(
            'academics.lesson_plan.read_only',
          );
          expectNoObjectKey(response.body, 'schoolId');
          expectNoObjectKey(response.body, 'organizationId');
        });
    }
  });

  function planUrl(): string {
    return `${GLOBAL_PREFIX}/academics/lesson-plans/${lessonPlanId}`;
  }

  async function findSystemRole(key: string): Promise<{ id: string }> {
    const role = await prisma.role.findFirst({
      where: { key, schoolId: null, isSystem: true, deletedAt: null },
      select: { id: true },
    });
    if (!role) throw new Error(`Missing system role: ${key}`);
    return role;
  }

  async function createOrganization(): Promise<string> {
    const organization = await prisma.organization.create({
      data: {
        slug: `${marker}-org`,
        name: `Sprint 15D Org ${suffix}`,
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
        name: `Sprint 15D School ${suffix}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);
    return school.id;
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
    const section = await prisma.section.create({
      data: {
        schoolId: inputSchoolId,
        gradeId: grade.id,
        nameAr: `${marker}-section-ar`,
        nameEn: `${marker}-section`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId: inputSchoolId,
        sectionId: section.id,
        nameAr: `${marker}-class-ar`,
        nameEn: `${marker}-class`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const subject = await prisma.subject.create({
      data: {
        schoolId: inputSchoolId,
        nameAr: `${marker}-subject-ar`,
        nameEn: `${marker}-subject`,
        code: `S15D-${suffix}`,
        isActive: true,
      },
      select: { id: true },
    });

    return {
      academicYearId: academicYear.id,
      termId: term.id,
      stageId: stage.id,
      gradeId: grade.id,
      sectionId: section.id,
      classroomId: classroom.id,
      subjectId: subject.id,
    };
  }

  async function createLessonPrerequisites(): Promise<LessonPrerequisites> {
    const teacherRole = await findSystemRole('teacher');
    const teacherUserId = await createUserWithMembership({
      email: `${marker}-teacher@example.test`,
      firstName: 'Sprint15D',
      lastName: 'Teacher',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
    });
    const allocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId,
        teacherUserId,
        subjectId: academic.subjectId,
        classroomId: academic.classroomId,
        termId: academic.termId,
      },
      select: { id: true },
    });
    const curriculum = await prisma.curriculum.create({
      data: {
        schoolId,
        academicYearId: academic.academicYearId,
        termId: academic.termId,
        gradeId: academic.gradeId,
        subjectId: academic.subjectId,
        title: `${marker}-curriculum`,
        status: CurriculumStatus.DRAFT,
        createdByUserId: adminUserId,
        updatedByUserId: adminUserId,
      },
      select: { id: true },
    });
    const unitOne = await prisma.curriculumUnit.create({
      data: {
        schoolId,
        curriculumId: curriculum.id,
        title: `${marker}-unit-one`,
        sortOrder: 0,
      },
      select: { id: true },
    });
    const unitTwo = await prisma.curriculumUnit.create({
      data: {
        schoolId,
        curriculumId: curriculum.id,
        title: `${marker}-unit-two`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const lessonOne = await prisma.curriculumLesson.create({
      data: {
        schoolId,
        curriculumId: curriculum.id,
        unitId: unitOne.id,
        title: `${marker}-lesson-one`,
        sortOrder: 0,
      },
      select: { id: true },
    });
    const lessonTwo = await prisma.curriculumLesson.create({
      data: {
        schoolId,
        curriculumId: curriculum.id,
        unitId: unitTwo.id,
        title: `${marker}-lesson-two`,
        sortOrder: 0,
      },
      select: { id: true },
    });
    const timetableConfig = await prisma.timetableConfig.create({
      data: {
        schoolId,
        academicYearId: academic.academicYearId,
        termId: academic.termId,
        name: `${marker}-config`,
        weekStartDay: 0,
        activeDays: [0, 1, 2, 3, 4],
        scopeType: TimetableScopeType.CLASSROOM,
        scopeKey: academic.classroomId,
        classroomId: academic.classroomId,
        status: TimetableConfigStatus.ACTIVE,
      },
      select: { id: true },
    });
    const period = await prisma.timetablePeriod.create({
      data: {
        schoolId,
        timetableConfigId: timetableConfig.id,
        periodIndex: 1,
        label: `${marker}-period-one`,
        startTime: '08:00',
        endTime: '08:45',
        type: TimetablePeriodType.CLASS,
        isInstructional: true,
      },
      select: { id: true },
    });
    const timetableEntry = await prisma.timetableEntry.create({
      data: {
        schoolId,
        academicYearId: academic.academicYearId,
        termId: academic.termId,
        timetableConfigId: timetableConfig.id,
        periodId: period.id,
        dayOfWeek: 1,
        gradeId: academic.gradeId,
        sectionId: academic.sectionId,
        classroomId: academic.classroomId,
        subjectId: academic.subjectId,
        teacherUserId,
        teacherSubjectAllocationId: allocation.id,
        status: TimetableEntryStatus.ACTIVE,
      },
      select: { id: true },
    });

    return {
      teacherUserId,
      allocationId: allocation.id,
      curriculumId: curriculum.id,
      unitOneId: unitOne.id,
      unitTwoId: unitTwo.id,
      lessonOneId: lessonOne.id,
      lessonTwoId: lessonTwo.id,
      timetableConfigId: timetableConfig.id,
      periodId: period.id,
      timetableEntryId: timetableEntry.id,
    };
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

  async function cleanupCloseoutData(): Promise<void> {
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
    await prisma.lessonPlanItem.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.lessonPlan.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.timetableEntry.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.timetablePeriod.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.timetableConfig.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.curriculumLesson.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.curriculumUnit.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.curriculum.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.teacherSubjectAllocation.deleteMany({
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
    await prisma.school.deleteMany({
      where: { id: { in: createdSchoolIds } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: createdOrganizationIds } },
    });
  }
});
