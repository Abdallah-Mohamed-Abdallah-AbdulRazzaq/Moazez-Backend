import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AcademicCalendarEventScopeType,
  AcademicCalendarEventType,
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
const PASSWORD = 'Sprint22ELessonPlan123!';
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
  sectionId: string;
  classroomId: string;
  subjectId: string;
};

type LessonPrerequisites = {
  teacherUserId: string;
  allocationId: string;
  closedAllocationId: string;
  curriculumId: string;
  closedCurriculumId: string;
  unitId: string;
  lessonOneId: string;
  lessonTwoId: string;
  lessonThreeId: string;
  closedUnitId: string;
  closedLessonId: string;
  periodTuesdayId: string;
  periodWednesdayId: string;
  timetableTuesdayId: string;
  timetableWednesdayId: string;
  closedTimetableEntryId: string;
};

jest.setTimeout(180000);

describe('Academics lesson plan workflows (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationId = '';
  let schoolId = '';
  let adminUserId = '';
  let adminEmail = '';
  let academic: AcademicBase;
  let prerequisites: LessonPrerequisites;
  let adminAuth: AuthTokens;
  let autoPlannedItemId = '';

  const suffix = randomUUID().split('-')[0];
  const marker = `s22e-e2e-${suffix}`;
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
      firstName: 'Sprint22E',
      lastName: 'Admin',
      userType: UserType.SCHOOL_USER,
      roleId: schoolAdminRole.id,
    });
    prerequisites = await createLessonPrerequisites();
    await createHoliday();

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
      await cleanupData();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('registers existing and new lesson-plan dashboard routes only', () => {
    const routes = listRegisteredRoutes();

    expect(routes).toEqual(
      expect.arrayContaining([
        'GET /api/v1/academics/lesson-plans',
        'POST /api/v1/academics/lesson-plans',
        'GET /api/v1/academics/lesson-plans/weeks',
        'GET /api/v1/academics/lesson-plans/summary',
        'POST /api/v1/academics/lesson-plans/auto-plan',
        'PATCH /api/v1/academics/lesson-plans/items/:itemId/move',
        'GET /api/v1/academics/lesson-plans/validation',
        'GET /api/v1/academics/lesson-plans/:lessonPlanId',
        'POST /api/v1/academics/lesson-plans/:lessonPlanId/items',
      ]),
    );

    expect(routes).not.toContain('GET /api/v1/student/lesson-plans');
    expect(routes).not.toContain('GET /api/v1/parent/lesson-plans');
  });

  it('returns holiday-aware week buckets', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/lesson-plans/weeks`)
      .query({
        termId: academic.termId,
        teacherSubjectAllocationId: prerequisites.allocationId,
        from: '2026-09-01',
        to: '2026-09-07',
      })
      .set('Authorization', bearer(adminAuth))
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          termId: academic.termId,
          academicYearId: academic.academicYearId,
          weeks: [
            {
              weekIndex: 1,
              startsAt: '2026-09-01',
              endsAt: '2026-09-07',
              holidayDays: [
                {
                  date: '2026-09-03',
                  title: `${marker}-holiday`,
                },
              ],
            },
          ],
        });
        expectNoObjectKey(response.body, 'schoolId');
        expectNoObjectKey(response.body, 'organizationId');
        expectNoObjectKey(response.body, 'deletedAt');
      });
  });

  it('dry-runs auto-plan without persistence', async () => {
    const beforeCount = await prisma.lessonPlanItem.count({
      where: { schoolId },
    });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/lesson-plans/auto-plan`)
      .set('Authorization', bearer(adminAuth))
      .send({
        termId: academic.termId,
        teacherSubjectAllocationId: prerequisites.allocationId,
        from: '2026-09-01',
        to: '2026-09-02',
        dryRun: true,
      })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          termId: academic.termId,
          teacherSubjectAllocationId: prerequisites.allocationId,
          dryRun: true,
          summary: {
            candidateLessons: 3,
            proposedItems: 2,
            createdItems: 0,
          },
        });
        expect(response.body.items).toHaveLength(2);
        expectNoObjectKey(response.body, 'schoolId');
        expectNoObjectKey(response.body, 'organizationId');
      });

    await expect(
      prisma.lessonPlanItem.count({ where: { schoolId } }),
    ).resolves.toBe(beforeCount);
  });

  it('persists auto-plan items and repeated runs do not duplicate existing lessons', async () => {
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/lesson-plans/auto-plan`)
      .set('Authorization', bearer(adminAuth))
      .send({
        termId: academic.termId,
        teacherSubjectAllocationId: prerequisites.allocationId,
        from: '2026-09-01',
        to: '2026-09-02',
      })
      .expect(200)
      .expect((response) => {
        expect(response.body.summary).toMatchObject({
          candidateLessons: 3,
          proposedItems: 2,
          createdItems: 2,
        });
      });

    const items = await prisma.lessonPlanItem.findMany({
      where: { schoolId, lessonId: { in: [prerequisites.lessonOneId, prerequisites.lessonTwoId] } },
      select: { id: true, lessonId: true, plannedDate: true },
      orderBy: [{ plannedDate: 'asc' }, { id: 'asc' }],
    });
    expect(items).toHaveLength(2);
    autoPlannedItemId = items[0].id;

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/lesson-plans/auto-plan`)
      .set('Authorization', bearer(adminAuth))
      .send({
        termId: academic.termId,
        teacherSubjectAllocationId: prerequisites.allocationId,
        from: '2026-09-01',
        to: '2026-09-02',
        dryRun: true,
      })
      .expect(200)
      .expect((response) => {
        expect(response.body.summary).toMatchObject({
          proposedItems: 1,
          createdItems: 0,
          skippedExistingItems: 2,
        });
      });

    await expect(
      prisma.lessonPlanItem.count({
        where: {
          schoolId,
          lessonId: { in: [prerequisites.lessonOneId, prerequisites.lessonTwoId] },
        },
      }),
    ).resolves.toBe(2);
  });

  it('summarizes and validates lesson-plan readiness', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/lesson-plans/summary`)
      .query({ termId: academic.termId, teacherSubjectAllocationId: prerequisites.allocationId })
      .set('Authorization', bearer(adminAuth))
      .expect(200)
      .expect((response) => {
        expect(response.body.summary).toMatchObject({
          lessonPlansCount: expect.any(Number),
          itemsCount: 2,
          unplannedLessonsCount: 1,
        });
        expect(response.body.byTeacherAllocation[0]).toMatchObject({
          teacherSubjectAllocationId: prerequisites.allocationId,
          teacher: {
            id: prerequisites.teacherUserId,
            firstName: 'Sprint22E',
          },
        });
        expectNoObjectKey(response.body, 'email');
        expectNoObjectKey(response.body, 'schoolId');
      });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/lesson-plans/validation`)
      .query({ termId: academic.termId, teacherSubjectAllocationId: prerequisites.allocationId })
      .set('Authorization', bearer(adminAuth))
      .expect(200)
      .expect((response) => {
        expect(response.body.summary).toMatchObject({
          lessonPlansChecked: expect.any(Number),
          itemsChecked: 2,
          missingPlannedLessons: 1,
        });
        expect(response.body.issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code: 'missing_planned_lesson',
              lessonId: prerequisites.lessonThreeId,
            }),
          ]),
        );
      });
  });

  it('moves a planned item and rejects holiday/closed-term writes', async () => {
    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/academics/lesson-plans/items/${autoPlannedItemId}/move`)
      .set('Authorization', bearer(adminAuth))
      .send({
        plannedDate: '2026-09-08',
        sortOrder: 7,
      })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          itemId: autoPlannedItemId,
          plannedDate: '2026-09-08',
          sortOrder: 7,
        });
      });

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/academics/lesson-plans/items/${autoPlannedItemId}/move`)
      .set('Authorization', bearer(adminAuth))
      .send({ plannedDate: '2026-09-03' })
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.lesson_plan.holiday_date',
        );
      });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/lesson-plans/auto-plan`)
      .set('Authorization', bearer(adminAuth))
      .send({
        termId: academic.closedTermId,
        teacherSubjectAllocationId: prerequisites.closedAllocationId,
      })
      .expect(409)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.lesson_plan.closed_term',
        );
      });
  });

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
        name: `Sprint 22E Org ${suffix}`,
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
        name: `Sprint 22E School ${suffix}`,
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
        code: `S22E-${suffix}`,
        isActive: true,
      },
      select: { id: true },
    });

    return {
      academicYearId: academicYear.id,
      termId: term.id,
      closedTermId: closedTerm.id,
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
      firstName: 'Sprint22E',
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
    const closedAllocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId,
        teacherUserId,
        subjectId: academic.subjectId,
        classroomId: academic.classroomId,
        termId: academic.closedTermId,
      },
      select: { id: true },
    });
    const curriculum = await createCurriculum(academic.termId);
    const closedCurriculum = await createCurriculum(academic.closedTermId);
    const unit = await createUnit(curriculum.id, 'unit');
    const closedUnit = await createUnit(closedCurriculum.id, 'closed-unit');
    const lessonOne = await createLesson(curriculum.id, unit.id, 'one', 0);
    const lessonTwo = await createLesson(curriculum.id, unit.id, 'two', 1);
    const lessonThree = await createLesson(curriculum.id, unit.id, 'three', 2);
    const closedLesson = await createLesson(
      closedCurriculum.id,
      closedUnit.id,
      'closed',
      0,
    );
    const config = await createTimetableConfig(academic.termId, 'open');
    const closedConfig = await createTimetableConfig(
      academic.closedTermId,
      'closed',
    );
    const periodTuesday = await createPeriod(config.id, 'Tuesday', 1);
    const periodWednesday = await createPeriod(config.id, 'Wednesday', 2);
    const closedPeriod = await createPeriod(closedConfig.id, 'Closed', 1);
    const timetableTuesday = await createTimetableEntry({
      termId: academic.termId,
      configId: config.id,
      periodId: periodTuesday.id,
      allocationId: allocation.id,
      teacherUserId,
      dayOfWeek: 2,
    });
    const timetableWednesday = await createTimetableEntry({
      termId: academic.termId,
      configId: config.id,
      periodId: periodWednesday.id,
      allocationId: allocation.id,
      teacherUserId,
      dayOfWeek: 3,
    });
    const closedTimetableEntry = await createTimetableEntry({
      termId: academic.closedTermId,
      configId: closedConfig.id,
      periodId: closedPeriod.id,
      allocationId: closedAllocation.id,
      teacherUserId,
      dayOfWeek: 2,
    });

    return {
      teacherUserId,
      allocationId: allocation.id,
      closedAllocationId: closedAllocation.id,
      curriculumId: curriculum.id,
      closedCurriculumId: closedCurriculum.id,
      unitId: unit.id,
      lessonOneId: lessonOne.id,
      lessonTwoId: lessonTwo.id,
      lessonThreeId: lessonThree.id,
      closedUnitId: closedUnit.id,
      closedLessonId: closedLesson.id,
      periodTuesdayId: periodTuesday.id,
      periodWednesdayId: periodWednesday.id,
      timetableTuesdayId: timetableTuesday.id,
      timetableWednesdayId: timetableWednesday.id,
      closedTimetableEntryId: closedTimetableEntry.id,
    };
  }

  async function createCurriculum(termId: string): Promise<{ id: string }> {
    return prisma.curriculum.create({
      data: {
        schoolId,
        academicYearId: academic.academicYearId,
        termId,
        gradeId: academic.gradeId,
        subjectId: academic.subjectId,
        title: `${marker}-curriculum-${termId}`,
        status: CurriculumStatus.ACTIVE,
        createdByUserId: adminUserId,
        updatedByUserId: adminUserId,
      },
      select: { id: true },
    });
  }

  async function createUnit(
    curriculumId: string,
    label: string,
  ): Promise<{ id: string }> {
    return prisma.curriculumUnit.create({
      data: {
        schoolId,
        curriculumId,
        title: `${marker}-${label}`,
        sortOrder: 0,
      },
      select: { id: true },
    });
  }

  async function createLesson(
    curriculumId: string,
    unitId: string,
    label: string,
    sortOrder: number,
  ): Promise<{ id: string }> {
    return prisma.curriculumLesson.create({
      data: {
        schoolId,
        curriculumId,
        unitId,
        title: `${marker}-lesson-${label}`,
        sortOrder,
      },
      select: { id: true },
    });
  }

  async function createTimetableConfig(
    termId: string,
    label: string,
  ): Promise<{ id: string }> {
    return prisma.timetableConfig.create({
      data: {
        schoolId,
        academicYearId: academic.academicYearId,
        termId,
        name: `${marker}-config-${label}`,
        weekStartDay: 0,
        activeDays: [0, 1, 2, 3, 4],
        scopeType: TimetableScopeType.CLASSROOM,
        scopeKey: academic.classroomId,
        classroomId: academic.classroomId,
        status: TimetableConfigStatus.ACTIVE,
      },
      select: { id: true },
    });
  }

  async function createPeriod(
    configId: string,
    label: string,
    index: number,
  ): Promise<{ id: string }> {
    return prisma.timetablePeriod.create({
      data: {
        schoolId,
        timetableConfigId: configId,
        periodIndex: index,
        label: `${marker}-${label}`,
        startTime: index === 1 ? '08:00' : '09:00',
        endTime: index === 1 ? '08:45' : '09:45',
        type: TimetablePeriodType.CLASS,
        isInstructional: true,
      },
      select: { id: true },
    });
  }

  async function createTimetableEntry(input: {
    termId: string;
    configId: string;
    periodId: string;
    allocationId: string;
    teacherUserId: string;
    dayOfWeek: number;
  }): Promise<{ id: string }> {
    return prisma.timetableEntry.create({
      data: {
        schoolId,
        academicYearId: academic.academicYearId,
        termId: input.termId,
        timetableConfigId: input.configId,
        periodId: input.periodId,
        dayOfWeek: input.dayOfWeek,
        gradeId: academic.gradeId,
        sectionId: academic.sectionId,
        classroomId: academic.classroomId,
        subjectId: academic.subjectId,
        teacherUserId: input.teacherUserId,
        teacherSubjectAllocationId: input.allocationId,
        status: TimetableEntryStatus.ACTIVE,
      },
      select: { id: true },
    });
  }

  async function createHoliday(): Promise<void> {
    await prisma.academicCalendarEvent.create({
      data: {
        schoolId,
        academicYearId: academic.academicYearId,
        termId: academic.termId,
        title: `${marker}-holiday`,
        type: AcademicCalendarEventType.HOLIDAY,
        scopeType: AcademicCalendarEventScopeType.SCHOOL,
        allDay: true,
        startDate: new Date('2026-09-03T00:00:00.000Z'),
        endDate: new Date('2026-09-03T23:59:59.000Z'),
        createdByUserId: adminUserId,
        updatedByUserId: adminUserId,
      },
    });
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

  async function cleanupData(): Promise<void> {
    if (!prisma) return;

    await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: { in: createdUserIds } },
          { schoolId: { in: createdSchoolIds } },
          { organizationId: { in: createdOrganizationIds } },
        ],
      },
    });
    await prisma.lessonPlanItem.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.lessonPlan.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.timetableEntry.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.timetablePeriod.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.timetableConfig.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.academicCalendarEvent.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.curriculumLesson.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.curriculumUnit.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.curriculum.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.teacherSubjectAllocation.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.subject.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.classroom.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.section.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.grade.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.stage.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.term.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.academicYear.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.membership.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
  }
});
