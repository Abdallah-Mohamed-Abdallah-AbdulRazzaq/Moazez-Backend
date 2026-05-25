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
const PASSWORD = 'Sprint15B123!';
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
  subjectId: string;
};

type SideEffectCounts = {
  gradeAssessments: number;
  communicationNotifications: number;
  xpLedgerEntries: number;
  rewardRedemptions: number;
  files: number;
  attachments: number;
};

jest.setTimeout(180000);

describe('Sprint 15B Academics Curriculum Foundation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationId = '';
  let schoolId = '';
  let adminUserId = '';
  let adminEmail = '';
  let academic: AcademicBase;
  let adminAuth: AuthTokens;

  let curriculumId = '';
  let unitOneId = '';
  let unitTwoId = '';
  let lessonOneId = '';
  let lessonTwoId = '';

  const suffix = randomUUID().split('-')[0];
  const marker = `s15b-${suffix}`;
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
      firstName: 'Sprint15B',
      lastName: 'Admin',
      userType: UserType.SCHOOL_USER,
      roleId: schoolAdminRole.id,
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
      await cleanupCloseoutData();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('registers backend-native curriculum routes and keeps deferred learning routes absent', () => {
    const routes = listRegisteredRoutes();

    expect(routes).toEqual(
      expect.arrayContaining([
        'GET /api/v1/academics/curriculum',
        'POST /api/v1/academics/curriculum',
        'GET /api/v1/academics/curriculum/:curriculumId',
        'PATCH /api/v1/academics/curriculum/:curriculumId',
        'POST /api/v1/academics/curriculum/:curriculumId/activate',
        'POST /api/v1/academics/curriculum/:curriculumId/archive',
        'DELETE /api/v1/academics/curriculum/:curriculumId',
        'POST /api/v1/academics/curriculum/:curriculumId/units',
        'PATCH /api/v1/academics/curriculum/:curriculumId/units/:unitId',
        'PATCH /api/v1/academics/curriculum/:curriculumId/units/:unitId/reorder',
        'DELETE /api/v1/academics/curriculum/:curriculumId/units/:unitId',
        'POST /api/v1/academics/curriculum/:curriculumId/units/:unitId/lessons',
        'PATCH /api/v1/academics/curriculum/:curriculumId/units/:unitId/lessons/:lessonId',
        'PATCH /api/v1/academics/curriculum/:curriculumId/units/:unitId/lessons/:lessonId/reorder',
        'DELETE /api/v1/academics/curriculum/:curriculumId/units/:unitId/lessons/:lessonId',
      ]),
    );

    for (const absentRoute of [
      'GET /api/v1/teacher/curriculum',
      'GET /api/v1/student/curriculum',
      'GET /api/v1/parent/curriculum',
      'POST /api/v1/academics/lesson-content',
      'POST /api/v1/academics/lesson-plans',
      'POST /api/v1/homework/questions',
      'POST /api/v1/homework/answers',
      'POST /api/v1/homework/attachments',
      'POST /api/v1/homework/submission-attachments',
    ]) {
      expect(routes).not.toContain(absentRoute);
    }
  });

  it('exercises curriculum, units, lessons, activation, archive, and safe payloads', async () => {
    const sideEffectsBefore = await countDeferredSideEffects();

    const curriculumResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/curriculum`)
      .set('Authorization', bearer(adminAuth))
      .send({
        academicYearId: academic.academicYearId,
        termId: academic.termId,
        gradeId: academic.gradeId,
        subjectId: academic.subjectId,
        title: '  Sprint 15B Mathematics Curriculum  ',
        description: '  Curriculum source of truth for Sprint 15B.  ',
      })
      .expect(201);

    curriculumId = curriculumResponse.body.curriculumId;
    expect(curriculumResponse.body).toMatchObject({
      id: curriculumId,
      curriculumId,
      academicYearId: academic.academicYearId,
      termId: academic.termId,
      gradeId: academic.gradeId,
      subjectId: academic.subjectId,
      title: 'Sprint 15B Mathematics Curriculum',
      description: 'Curriculum source of truth for Sprint 15B.',
      status: 'draft',
      unitCount: 0,
      lessonCount: 0,
      academicYear: { id: academic.academicYearId },
      term: { id: academic.termId },
      grade: { id: academic.gradeId },
      subject: { id: academic.subjectId, code: `S15B-${suffix}` },
      units: [],
    });
    expectNoObjectKey(curriculumResponse.body, 'schoolId');
    expectNoObjectKey(curriculumResponse.body, 'organizationId');

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/curriculum`)
      .set('Authorization', bearer(adminAuth))
      .send({
        academicYearId: academic.academicYearId,
        termId: academic.termId,
        gradeId: academic.gradeId,
        subjectId: academic.subjectId,
        title: 'Duplicate Sprint 15B Curriculum',
      })
      .expect(409)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.curriculum.duplicate',
        );
        expectNoObjectKey(response.body, 'schoolId');
        expectNoObjectKey(response.body, 'organizationId');
      });

    const listed = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/curriculum`)
      .query({
        academicYearId: academic.academicYearId,
        termId: academic.termId,
        status: 'DRAFT',
        search: 'mathematics',
      })
      .set('Authorization', bearer(adminAuth))
      .expect(200);

    expect(listed.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ curriculumId, status: 'draft' }),
      ]),
    );
    expectNoObjectKey(listed.body, 'schoolId');
    expectNoObjectKey(listed.body, 'organizationId');

    unitOneId = (
      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/academics/curriculum/${curriculumId}/units`)
        .set('Authorization', bearer(adminAuth))
        .send({
          title: '  Number Sense  ',
          sortOrder: 2,
          estimatedLessons: 3,
        })
        .expect(201)
    ).body.unitId;

    unitTwoId = (
      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/academics/curriculum/${curriculumId}/units`)
        .set('Authorization', bearer(adminAuth))
        .send({
          title: 'Geometry',
          sortOrder: 1,
          estimatedLessons: 2,
        })
        .expect(201)
    ).body.unitId;

    await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/academics/curriculum/${curriculumId}/units/${unitOneId}/reorder`,
      )
      .set('Authorization', bearer(adminAuth))
      .send({ sortOrder: 0 })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          unitId: unitOneId,
          sortOrder: 0,
        });
      });

    await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/academics/curriculum/${curriculumId}/units/${unitTwoId}`,
      )
      .set('Authorization', bearer(adminAuth))
      .send({ title: 'Geometry Foundations', estimatedLessons: null })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          unitId: unitTwoId,
          title: 'Geometry Foundations',
          estimatedLessons: null,
        });
      });

    lessonOneId = (
      await request(app.getHttpServer())
        .post(
          `${GLOBAL_PREFIX}/academics/curriculum/${curriculumId}/units/${unitOneId}/lessons`,
        )
        .set('Authorization', bearer(adminAuth))
        .send({
          title: '  Comparing Fractions  ',
          objectives: ['  Compare unit fractions  ', 'Order fractions'],
          sortOrder: 2,
          estimatedMinutes: 45,
        })
        .expect(201)
    ).body.lessonId;

    lessonTwoId = (
      await request(app.getHttpServer())
        .post(
          `${GLOBAL_PREFIX}/academics/curriculum/${curriculumId}/units/${unitOneId}/lessons`,
        )
        .set('Authorization', bearer(adminAuth))
        .send({
          title: 'Place Value',
          sortOrder: 1,
          estimatedMinutes: 40,
        })
        .expect(201)
    ).body.lessonId;

    await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/academics/curriculum/${curriculumId}/units/${unitOneId}/lessons/${lessonOneId}/reorder`,
      )
      .set('Authorization', bearer(adminAuth))
      .send({ sortOrder: 0 })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          lessonId: lessonOneId,
          sortOrder: 0,
        });
      });

    await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/academics/curriculum/${curriculumId}/units/${unitOneId}/lessons/${lessonTwoId}`,
      )
      .set('Authorization', bearer(adminAuth))
      .send({ title: 'Place Value Review', objectives: null })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          lessonId: lessonTwoId,
          title: 'Place Value Review',
          objectives: [],
        });
      });

    const detail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/curriculum/${curriculumId}`)
      .set('Authorization', bearer(adminAuth))
      .expect(200);

    expect(detail.body.unitCount).toBe(2);
    expect(detail.body.lessonCount).toBe(2);
    expect(
      detail.body.units.map((unit: { unitId: string }) => unit.unitId),
    ).toEqual([unitOneId, unitTwoId]);
    expect(
      detail.body.units[0].lessons.map(
        (lesson: { lessonId: string }) => lesson.lessonId,
      ),
    ).toEqual([lessonOneId, lessonTwoId]);
    expect(detail.body.units[0].lessons[0]).toMatchObject({
      lessonId: lessonOneId,
      title: 'Comparing Fractions',
      objectives: ['Compare unit fractions', 'Order fractions'],
    });
    expectNoObjectKey(detail.body, 'schoolId');
    expectNoObjectKey(detail.body, 'organizationId');

    const activated = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/curriculum/${curriculumId}/activate`)
      .set('Authorization', bearer(adminAuth))
      .send({})
      .expect(200);

    expect(activated.body).toMatchObject({
      curriculumId,
      status: 'active',
      publishedAt: expect.any(String),
    });
    expectNoObjectKey(activated.body, 'schoolId');
    expectNoObjectKey(activated.body, 'organizationId');

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/academics/curriculum/${curriculumId}`)
      .set('Authorization', bearer(adminAuth))
      .send({ description: 'Active metadata remains editable before archive.' })
      .expect(200)
      .expect((response) => {
        expect(response.body.description).toBe(
          'Active metadata remains editable before archive.',
        );
      });

    const archived = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/curriculum/${curriculumId}/archive`)
      .set('Authorization', bearer(adminAuth))
      .send({})
      .expect(200);

    expect(archived.body).toMatchObject({
      curriculumId,
      status: 'archived',
      archivedAt: expect.any(String),
    });
    expectNoObjectKey(archived.body, 'schoolId');
    expectNoObjectKey(archived.body, 'organizationId');

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/academics/curriculum/${curriculumId}`)
      .set('Authorization', bearer(adminAuth))
      .send({ title: 'Archived Should Not Mutate' })
      .expect(409)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.curriculum.read_only',
        );
        expectNoObjectKey(response.body, 'schoolId');
        expectNoObjectKey(response.body, 'organizationId');
      });

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/academics/curriculum/${curriculumId}`)
      .set('Authorization', bearer(adminAuth))
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({ ok: true });
      });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/curriculum/${curriculumId}`)
      .set('Authorization', bearer(adminAuth))
      .expect(404)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.curriculum.not_found',
        );
        expectNoObjectKey(response.body, 'schoolId');
        expectNoObjectKey(response.body, 'organizationId');
      });

    const sideEffectsAfter = await countDeferredSideEffects();
    expect(sideEffectsAfter).toEqual(sideEffectsBefore);
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
        name: `Sprint 15B Org ${suffix}`,
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
        name: `Sprint 15B School ${suffix}`,
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
    const subject = await prisma.subject.create({
      data: {
        schoolId: inputSchoolId,
        nameAr: `${marker}-subject-ar`,
        nameEn: `${marker}-subject`,
        code: `S15B-${suffix}`,
        color: '#336699',
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
      subjectId: subject.id,
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

  async function countDeferredSideEffects(): Promise<SideEffectCounts> {
    const [
      gradeAssessments,
      communicationNotifications,
      xpLedgerEntries,
      rewardRedemptions,
      files,
      attachments,
    ] = await Promise.all([
      prisma.gradeAssessment.count({ where: { schoolId } }),
      prisma.communicationNotification.count({ where: { schoolId } }),
      prisma.xpLedger.count({ where: { schoolId } }),
      prisma.rewardRedemption.count({ where: { schoolId } }),
      prisma.file.count({ where: { schoolId } }),
      prisma.attachment.count({ where: { schoolId } }),
    ]);

    return {
      gradeAssessments,
      communicationNotifications,
      xpLedgerEntries,
      rewardRedemptions,
      files,
      attachments,
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
    await prisma.curriculumLesson.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.curriculumUnit.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.curriculum.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.subject.deleteMany({
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
