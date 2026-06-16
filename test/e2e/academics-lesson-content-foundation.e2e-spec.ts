import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  LessonContentItemType,
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
import { StorageService } from '../../src/infrastructure/storage/storage.service';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'Sprint15C123!';
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
  attachments: number;
};

jest.setTimeout(180000);

describe('Sprint 15C Academics Lesson Content Foundation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let storageService: StorageService;

  let organizationId = '';
  let schoolId = '';
  let adminUserId = '';
  let adminEmail = '';
  let academic: AcademicBase;
  let adminAuth: AuthTokens;

  let curriculumId = '';
  let unitId = '';
  let lessonId = '';
  let textContentId = '';
  let fileContentId = '';
  let videoContentId = '';
  let externalContentId = '';
  let uploadedFileId = '';
  let uploadedBucket = '';
  let uploadedObjectKey = '';

  const suffix = randomUUID().split('-')[0];
  const marker = `s15c-${suffix}`;
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
      firstName: 'Sprint15C',
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

    storageService = app.get(StorageService);
    adminAuth = await login(adminEmail);
  });

  afterAll(async () => {
    try {
      if (uploadedBucket && uploadedObjectKey && storageService) {
        await storageService.deleteObject({
          bucket: uploadedBucket,
          objectKey: uploadedObjectKey,
        });
      }
      if (app) await app.close();
      await cleanupCloseoutData();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('registers backend-native lesson content routes and keeps deferred routes absent', () => {
    const routes = listRegisteredRoutes();

    expect(routes).toEqual(
      expect.arrayContaining([
        'GET /api/v1/academics/curriculum/:curriculumId/units/:unitId/lessons/:lessonId/content',
        'POST /api/v1/academics/curriculum/:curriculumId/units/:unitId/lessons/:lessonId/content',
        'GET /api/v1/academics/curriculum/:curriculumId/units/:unitId/lessons/:lessonId/content/:contentItemId',
        'PATCH /api/v1/academics/curriculum/:curriculumId/units/:unitId/lessons/:lessonId/content/:contentItemId',
        'PATCH /api/v1/academics/curriculum/:curriculumId/units/:unitId/lessons/:lessonId/content/:contentItemId/reorder',
        'DELETE /api/v1/academics/curriculum/:curriculumId/units/:unitId/lessons/:lessonId/content/:contentItemId',
      ]),
    );

    for (const absentRoute of [
      'GET /api/v1/student/curriculum/:curriculumId/units/:unitId/lessons/:lessonId/content',
      'GET /api/v1/teacher/curriculum/:curriculumId/units/:unitId/lessons/:lessonId/content',
      'POST /api/v1/homework/questions',
      'POST /api/v1/homework/answers',
    ]) {
      expect(routes).not.toContain(absentRoute);
    }
  });

  it('creates lesson text, file, video, and external resources with ordering and archive lockout', async () => {
    const sideEffectsBefore = await countDeferredSideEffects();

    curriculumId = (
      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/academics/curriculum`)
        .set('Authorization', bearer(adminAuth))
        .send({
          academicYearId: academic.academicYearId,
          termId: academic.termId,
          gradeId: academic.gradeId,
          subjectId: academic.subjectId,
          title: '  Sprint 15C Mathematics Curriculum  ',
          description: '  Curriculum spine for lesson resources.  ',
        })
        .expect(201)
    ).body.curriculumId;

    unitId = (
      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/academics/curriculum/${curriculumId}/units`)
        .set('Authorization', bearer(adminAuth))
        .send({ title: 'Number Sense' })
        .expect(201)
    ).body.unitId;

    lessonId = (
      await request(app.getHttpServer())
        .post(
          `${GLOBAL_PREFIX}/academics/curriculum/${curriculumId}/units/${unitId}/lessons`,
        )
        .set('Authorization', bearer(adminAuth))
        .send({ title: 'Comparing Fractions', estimatedMinutes: 45 })
        .expect(201)
    ).body.lessonId;

    const uploadResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/files`)
      .set('Authorization', bearer(adminAuth))
      .attach('file', Buffer.from('lesson resource body'), {
        filename: `${marker}-resource.txt`,
        contentType: 'text/plain',
      })
      .expect(201);

    uploadedFileId = uploadResponse.body.id;
    const persistedFile = await prisma.file.findUniqueOrThrow({
      where: { id: uploadedFileId },
      select: { bucket: true, objectKey: true },
    });
    uploadedBucket = persistedFile.bucket;
    uploadedObjectKey = persistedFile.objectKey;

    textContentId = (
      await request(app.getHttpServer())
        .post(contentListUrl())
        .set('Authorization', bearer(adminAuth))
        .send({
          type: LessonContentItemType.TEXT,
          title: '  Guided Notes  ',
          bodyText: '  Compare fractions with common denominators.  ',
          sortOrder: 2,
          isRequired: true,
          estimatedMinutes: 10,
          metadata: { display: 'notes' },
        })
        .expect(201)
        .expect((response) => {
          expect(response.body).toMatchObject({
            type: 'text',
            title: 'Guided Notes',
            bodyText: 'Compare fractions with common denominators.',
            url: null,
            file: null,
            sortOrder: 2,
            isRequired: true,
            estimatedMinutes: 10,
          });
          expectNoObjectKey(response.body, 'schoolId');
          expectNoObjectKey(response.body, 'organizationId');
        })
    ).body.contentItemId;

    await request(app.getHttpServer())
      .post(contentListUrl())
      .set('Authorization', bearer(adminAuth))
      .send({
        type: LessonContentItemType.TEXT,
        title: 'Invalid Text',
      })
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.lesson_content.invalid_type_payload',
        );
      });

    fileContentId = (
      await request(app.getHttpServer())
        .post(contentListUrl())
        .set('Authorization', bearer(adminAuth))
        .send({
          type: LessonContentItemType.FILE,
          title: 'Practice Worksheet',
          bodyText: 'Download and solve independently.',
          fileId: uploadedFileId,
          sortOrder: 1,
        })
        .expect(201)
        .expect((response) => {
          expect(response.body).toMatchObject({
            type: 'file',
            title: 'Practice Worksheet',
            file: {
              fileId: uploadedFileId,
              filename: `${marker}-resource.txt`,
              mimeType: 'text/plain',
              sizeBytes: String(Buffer.byteLength('lesson resource body')),
            },
            url: null,
          });
          expectNoObjectKey(response.body, 'schoolId');
          expectNoObjectKey(response.body, 'organizationId');
        })
    ).body.contentItemId;

    videoContentId = (
      await request(app.getHttpServer())
        .post(contentListUrl())
        .set('Authorization', bearer(adminAuth))
        .send({
          type: LessonContentItemType.VIDEO_LINK,
          title: 'Fraction Video',
          url: 'https://videos.example.test/fractions',
        })
        .expect(201)
    ).body.contentItemId;

    externalContentId = (
      await request(app.getHttpServer())
        .post(contentListUrl())
        .set('Authorization', bearer(adminAuth))
        .send({
          type: LessonContentItemType.EXTERNAL_LINK,
          title: 'Interactive Reference',
          url: 'https://resources.example.test/fractions',
          sortOrder: 4,
        })
        .expect(201)
    ).body.contentItemId;

    await request(app.getHttpServer())
      .post(contentListUrl())
      .set('Authorization', bearer(adminAuth))
      .send({
        type: LessonContentItemType.EXTERNAL_LINK,
        title: 'Unsafe Reference',
        url: 'javascript:alert(1)',
      })
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.lesson_content.invalid_url',
        );
      });

    await request(app.getHttpServer())
      .patch(`${contentListUrl()}/${textContentId}`)
      .set('Authorization', bearer(adminAuth))
      .send({
        title: 'Guided Notes Updated',
        bodyText: 'Updated lesson reading.',
        isRequired: false,
      })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          contentItemId: textContentId,
          title: 'Guided Notes Updated',
          bodyText: 'Updated lesson reading.',
          isRequired: false,
        });
        expectNoObjectKey(response.body, 'schoolId');
        expectNoObjectKey(response.body, 'organizationId');
      });

    await request(app.getHttpServer())
      .get(contentListUrl())
      .set('Authorization', bearer(adminAuth))
      .expect(200)
      .expect((response) => {
        expect(
          response.body.items.map(
            (item: { contentItemId: string }) => item.contentItemId,
          ),
        ).toEqual([
          fileContentId,
          textContentId,
          videoContentId,
          externalContentId,
        ]);
        expectNoObjectKey(response.body, 'schoolId');
        expectNoObjectKey(response.body, 'organizationId');
      });

    await request(app.getHttpServer())
      .patch(`${contentListUrl()}/${externalContentId}/reorder`)
      .set('Authorization', bearer(adminAuth))
      .send({ sortOrder: 0 })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          contentItemId: externalContentId,
          sortOrder: 0,
        });
      });

    await request(app.getHttpServer())
      .get(contentListUrl())
      .set('Authorization', bearer(adminAuth))
      .expect(200)
      .expect((response) => {
        expect(
          response.body.items.map(
            (item: { contentItemId: string }) => item.contentItemId,
          ),
        ).toEqual([
          externalContentId,
          fileContentId,
          textContentId,
          videoContentId,
        ]);
      });

    await request(app.getHttpServer())
      .get(`${contentListUrl()}/${externalContentId}`)
      .set('Authorization', bearer(adminAuth))
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          contentItemId: externalContentId,
          type: 'external_link',
          url: 'https://resources.example.test/fractions',
        });
        expectNoObjectKey(response.body, 'schoolId');
        expectNoObjectKey(response.body, 'organizationId');
      });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/curriculum/${curriculumId}/activate`)
      .set('Authorization', bearer(adminAuth))
      .send({})
      .expect(200);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/curriculum/${curriculumId}/archive`)
      .set('Authorization', bearer(adminAuth))
      .send({})
      .expect(200);

    for (const mutation of [
      () =>
        request(app.getHttpServer())
          .post(contentListUrl())
          .set('Authorization', bearer(adminAuth))
          .send({
            type: LessonContentItemType.TEXT,
            title: 'Archived Create',
            bodyText: 'Nope',
          }),
      () =>
        request(app.getHttpServer())
          .patch(`${contentListUrl()}/${textContentId}`)
          .set('Authorization', bearer(adminAuth))
          .send({ title: 'Archived Update' }),
      () =>
        request(app.getHttpServer())
          .patch(`${contentListUrl()}/${fileContentId}/reorder`)
          .set('Authorization', bearer(adminAuth))
          .send({ sortOrder: 9 }),
      () =>
        request(app.getHttpServer())
          .delete(`${contentListUrl()}/${fileContentId}`)
          .set('Authorization', bearer(adminAuth)),
    ]) {
      await mutation()
        .expect(409)
        .expect((response) => {
          expect(response.body?.error?.code).toBe(
            'academics.lesson_content.read_only',
          );
          expectNoObjectKey(response.body, 'schoolId');
          expectNoObjectKey(response.body, 'organizationId');
        });
    }

    const sideEffectsAfter = await countDeferredSideEffects();
    expect(sideEffectsAfter).toEqual(sideEffectsBefore);
  });

  function contentListUrl(): string {
    return `${GLOBAL_PREFIX}/academics/curriculum/${curriculumId}/units/${unitId}/lessons/${lessonId}/content`;
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
        name: `Sprint 15C Org ${suffix}`,
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
        name: `Sprint 15C School ${suffix}`,
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
        code: `S15C-${suffix}`,
        color: '#225577',
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
      attachments,
    ] = await Promise.all([
      prisma.gradeAssessment.count({ where: { schoolId } }),
      prisma.communicationNotification.count({ where: { schoolId } }),
      prisma.xpLedger.count({ where: { schoolId } }),
      prisma.rewardRedemption.count({ where: { schoolId } }),
      prisma.attachment.count({ where: { schoolId } }),
    ]);

    return {
      gradeAssessments,
      communicationNotifications,
      xpLedgerEntries,
      rewardRedemptions,
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
    await prisma.lessonContentItem.deleteMany({
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
    if (uploadedFileId) {
      await prisma.file.deleteMany({ where: { id: uploadedFileId } });
    }
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
