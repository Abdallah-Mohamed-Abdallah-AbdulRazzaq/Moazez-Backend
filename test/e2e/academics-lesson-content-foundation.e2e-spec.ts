import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  FileUploadPurpose,
  FileUploadSessionStatus,
  LessonContentItemType,
  LessonContentPublicationStatus,
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
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';

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
    })
      .overrideProvider(BullmqService)
      .useValue({
        createWorker: jest.fn().mockReturnValue({ on: jest.fn() }),
        addJob: jest.fn().mockResolvedValue(undefined),
        getQueue: jest.fn(),
        getQueueReadiness: jest.fn().mockResolvedValue({
          name: 'test',
          status: 'ok',
          counts: { waiting: 0, active: 0, delayed: 0, failed: 0 },
        }),
        ping: jest.fn().mockResolvedValue(undefined),
      })
      .compile();

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
        'POST /api/v1/academics/curriculum/:curriculumId/units/:unitId/lessons/:lessonId/content/:contentItemId/publish',
        'POST /api/v1/academics/curriculum/:curriculumId/units/:unitId/lessons/:lessonId/content/:contentItemId/unpublish',
        'POST /api/v1/academics/curriculum/:curriculumId/units/:unitId/lessons/:lessonId/content/:contentItemId/archive',
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

    const uploadedFile = await prisma.file.create({
      data: {
        organizationId,
        schoolId,
        uploaderId: adminUserId,
        bucket: `${marker}-metadata-only-bucket`,
        objectKey: `${marker}-metadata-only-object`,
        originalName: `${marker}-resource.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: BigInt(Buffer.byteLength('lesson resource body')),
        checksumSha256: 'a'.repeat(64),
      },
      select: { id: true },
    });
    uploadedFileId = uploadedFile.id;
    const completedAt = new Date();
    await prisma.fileUploadSession.create({
      data: {
        organizationId,
        schoolId,
        createdByUserId: adminUserId,
        clientRequestId: randomUUID(),
        purpose: FileUploadPurpose.LESSON_CONTENT,
        originalName: `${marker}-resource.pdf`,
        expectedMimeType: 'application/pdf',
        expectedSizeBytes: BigInt(Buffer.byteLength('lesson resource body')),
        stagingBucket: `${marker}-metadata-only-bucket`,
        stagingObjectKey: `${marker}-metadata-only-staging`,
        finalBucket: `${marker}-metadata-only-bucket`,
        finalObjectKey: `${marker}-metadata-only-object`,
        status: FileUploadSessionStatus.READY,
        expiresAt: new Date(completedAt.getTime() + 7_200_000),
        latestUploadUrlExpiresAt: new Date(completedAt.getTime() + 3_600_000),
        completedAt,
        stagingCleanupEligibleAt: new Date(completedAt.getTime() + 3_600_000),
        finalCleanupEligibleAt: new Date(
          completedAt.getTime() + 7 * 24 * 60 * 60 * 1000,
        ),
        verifiedMimeType: 'application/pdf',
        actualSizeBytes: BigInt(Buffer.byteLength('lesson resource body')),
        checksumSha256: 'a'.repeat(64),
        durationSeconds: null,
        width: null,
        height: null,
        verifiedAt: completedAt,
        verificationVersion: 'ffprobe-5.1.9-debian12-learning-media-v1',
        createdAt: completedAt,
        fileId: uploadedFile.id,
      },
    });

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
            publicationStatus: 'draft',
            publishedAt: null,
            publishedByUserId: null,
            archivedAt: null,
            archivedByUserId: null,
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
              filename: `${marker}-resource.pdf`,
              mimeType: 'application/pdf',
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

    const missingContentItemId = randomUUID();
    await request(app.getHttpServer())
      .get(`${contentListUrl()}/${missingContentItemId}`)
      .set('Authorization', bearer(adminAuth))
      .expect(404)
      .expect((response) => {
        expectSafeLessonContentError(
          response,
          'academics.lesson_content.not_found',
          [
            curriculumId,
            unitId,
            lessonId,
            missingContentItemId,
            schoolId,
            organizationId,
            adminUserId,
          ],
        );
      });

    const missingFileId = randomUUID();
    await request(app.getHttpServer())
      .post(contentListUrl())
      .set('Authorization', bearer(adminAuth))
      .send({
        type: LessonContentItemType.FILE,
        title: 'Missing File',
        fileId: missingFileId,
      })
      .expect(404)
      .expect((response) => {
        expectSafeLessonContentError(
          response,
          'academics.lesson_content.file_not_found',
          [
            curriculumId,
            unitId,
            lessonId,
            missingFileId,
            schoolId,
            organizationId,
            adminUserId,
          ],
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

    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- Supertest exposes lifecycle response bodies as any in these focused HTTP assertions. */
    const textUrl = `${contentListUrl()}/${textContentId}`;
    const published = await request(app.getHttpServer())
      .post(`${textUrl}/publish`)
      .set('Authorization', bearer(adminAuth))
      .expect(200);

    expect(published.body).toMatchObject({
      contentItemId: textContentId,
      publicationStatus: 'published',
      publishedByUserId: adminUserId,
      archivedAt: null,
      archivedByUserId: null,
    });
    expect(new Date(published.body.publishedAt).toISOString()).toBe(
      published.body.publishedAt,
    );

    const assertPublicationConflictUnchanged = async (
      mutation: () => request.Test,
      contentItemId: string,
      expectedDetails: {
        from: LessonContentPublicationStatus;
        to: LessonContentPublicationStatus;
      },
    ) => {
      const before = await prisma.lessonContentItem.findUniqueOrThrow({
        where: { id: contentItemId },
      });
      const successAuditsBefore = await countTransitionAudits(contentItemId);

      await mutation()
        .expect(409)
        .expect((response) => {
          expectPublicationConflictResponse(response, expectedDetails);
        });

      const after = await prisma.lessonContentItem.findUniqueOrThrow({
        where: { id: contentItemId },
      });
      expect(after).toEqual(before);
      expect(await countTransitionAudits(contentItemId)).toBe(
        successAuditsBefore,
      );
    };

    await assertPublicationConflictUnchanged(
      () =>
        request(app.getHttpServer())
          .patch(textUrl)
          .set('Authorization', bearer(adminAuth))
          .send({ title: 'Rejected Published Edit' }),
      textContentId,
      {
        from: LessonContentPublicationStatus.PUBLISHED,
        to: LessonContentPublicationStatus.DRAFT,
      },
    );
    await assertPublicationConflictUnchanged(
      () =>
        request(app.getHttpServer())
          .patch(`${textUrl}/reorder`)
          .set('Authorization', bearer(adminAuth))
          .send({ sortOrder: 20 }),
      textContentId,
      {
        from: LessonContentPublicationStatus.PUBLISHED,
        to: LessonContentPublicationStatus.DRAFT,
      },
    );
    await assertPublicationConflictUnchanged(
      () =>
        request(app.getHttpServer())
          .delete(textUrl)
          .set('Authorization', bearer(adminAuth)),
      textContentId,
      {
        from: LessonContentPublicationStatus.PUBLISHED,
        to: LessonContentPublicationStatus.DRAFT,
      },
    );
    await assertPublicationConflictUnchanged(
      () =>
        request(app.getHttpServer())
          .post(`${textUrl}/publish`)
          .set('Authorization', bearer(adminAuth)),
      textContentId,
      {
        from: LessonContentPublicationStatus.PUBLISHED,
        to: LessonContentPublicationStatus.PUBLISHED,
      },
    );

    const unpublished = await request(app.getHttpServer())
      .post(`${textUrl}/unpublish`)
      .set('Authorization', bearer(adminAuth))
      .expect(200);
    expect(unpublished.body).toMatchObject({
      publicationStatus: 'draft',
      publishedAt: null,
      publishedByUserId: null,
      archivedAt: null,
      archivedByUserId: null,
    });

    await request(app.getHttpServer())
      .patch(textUrl)
      .set('Authorization', bearer(adminAuth))
      .send({ bodyText: 'Reviewed after unpublish' })
      .expect(200);

    const republished = await request(app.getHttpServer())
      .post(`${textUrl}/publish`)
      .set('Authorization', bearer(adminAuth))
      .expect(200);
    expect(republished.body.publicationStatus).toBe('published');
    expect(republished.body.publishedAt).not.toBe(published.body.publishedAt);

    const archived = await request(app.getHttpServer())
      .post(`${textUrl}/archive`)
      .set('Authorization', bearer(adminAuth))
      .expect(200);
    expect(archived.body).toMatchObject({
      publicationStatus: 'archived',
      publishedAt: republished.body.publishedAt,
      publishedByUserId: adminUserId,
      archivedByUserId: adminUserId,
    });
    expect(archived.body.archivedAt).not.toBeNull();

    await request(app.getHttpServer())
      .get(textUrl)
      .set('Authorization', bearer(adminAuth))
      .expect(200)
      .expect((response) => {
        expect(response.body.publicationStatus).toBe('archived');
      });
    await request(app.getHttpServer())
      .get(contentListUrl())
      .set('Authorization', bearer(adminAuth))
      .expect(200)
      .expect((response) => {
        expect(
          response.body.items.find(
            (item: { contentItemId: string }) =>
              item.contentItemId === textContentId,
          )?.publicationStatus,
        ).toBe('archived');
      });

    for (const { mutation, expectedDetails } of [
      {
        mutation: () =>
          request(app.getHttpServer())
            .patch(textUrl)
            .set('Authorization', bearer(adminAuth))
            .send({ title: 'Terminal Edit' }),
        expectedDetails: {
          from: LessonContentPublicationStatus.ARCHIVED,
          to: LessonContentPublicationStatus.DRAFT,
        },
      },
      {
        mutation: () =>
          request(app.getHttpServer())
            .patch(`${textUrl}/reorder`)
            .set('Authorization', bearer(adminAuth))
            .send({ sortOrder: 21 }),
        expectedDetails: {
          from: LessonContentPublicationStatus.ARCHIVED,
          to: LessonContentPublicationStatus.DRAFT,
        },
      },
      {
        mutation: () =>
          request(app.getHttpServer())
            .delete(textUrl)
            .set('Authorization', bearer(adminAuth)),
        expectedDetails: {
          from: LessonContentPublicationStatus.ARCHIVED,
          to: LessonContentPublicationStatus.DRAFT,
        },
      },
      {
        mutation: () =>
          request(app.getHttpServer())
            .post(`${textUrl}/publish`)
            .set('Authorization', bearer(adminAuth)),
        expectedDetails: {
          from: LessonContentPublicationStatus.ARCHIVED,
          to: LessonContentPublicationStatus.PUBLISHED,
        },
      },
      {
        mutation: () =>
          request(app.getHttpServer())
            .post(`${textUrl}/unpublish`)
            .set('Authorization', bearer(adminAuth)),
        expectedDetails: {
          from: LessonContentPublicationStatus.ARCHIVED,
          to: LessonContentPublicationStatus.DRAFT,
        },
      },
      {
        mutation: () =>
          request(app.getHttpServer())
            .post(`${textUrl}/archive`)
            .set('Authorization', bearer(adminAuth)),
        expectedDetails: {
          from: LessonContentPublicationStatus.ARCHIVED,
          to: LessonContentPublicationStatus.ARCHIVED,
        },
      },
    ]) {
      await assertPublicationConflictUnchanged(
        mutation,
        textContentId,
        expectedDetails,
      );
    }

    await assertPublicationConflictUnchanged(
      () =>
        request(app.getHttpServer())
          .post(`${contentListUrl()}/${videoContentId}/archive`)
          .set('Authorization', bearer(adminAuth)),
      videoContentId,
      {
        from: LessonContentPublicationStatus.DRAFT,
        to: LessonContentPublicationStatus.ARCHIVED,
      },
    );

    const transitionAudits = await prisma.auditLog.findMany({
      where: {
        resourceType: 'lesson_content_item',
        resourceId: textContentId,
        action: {
          in: [
            'academics.lesson_content.publish',
            'academics.lesson_content.unpublish',
            'academics.lesson_content.archive',
          ],
        },
      },
      select: { action: true, before: true, after: true },
    });
    expect(transitionAudits).toHaveLength(4);
    expect(
      transitionAudits.filter(
        (audit) => audit.action === 'academics.lesson_content.publish',
      ),
    ).toHaveLength(2);
    for (const audit of transitionAudits) {
      expect(Object.keys((audit.before ?? {}) as object).sort()).toEqual(
        ['archivedAt', 'publicationStatus', 'publishedAt'].sort(),
      );
      expect(Object.keys((audit.after ?? {}) as object).sort()).toEqual(
        ['archivedAt', 'publicationStatus', 'publishedAt'].sort(),
      );
      expect(JSON.stringify(audit)).not.toMatch(
        /title|bodyText|url|fileId|metadata|filename|schoolId|actorId/,
      );
    }

    await provePublicationConcurrency();
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */

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

  /* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- Supertest exposes focused concurrency response bodies as any. */
  async function countTransitionAudits(contentItemId: string): Promise<number> {
    return prisma.auditLog.count({
      where: {
        resourceType: 'lesson_content_item',
        resourceId: contentItemId,
        action: {
          in: [
            'academics.lesson_content.publish',
            'academics.lesson_content.unpublish',
            'academics.lesson_content.archive',
          ],
        },
      },
    });
  }

  async function createConcurrencyDraft(label: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(contentListUrl())
      .set('Authorization', bearer(adminAuth))
      .send({
        type: LessonContentItemType.TEXT,
        title: `Concurrency ${label}`,
        bodyText: `Initial ${label}`,
      })
      .expect(201);

    expect(response.body.publicationStatus).toBe('draft');
    return response.body.contentItemId;
  }

  function expectPublicationConflictResponse(
    response: request.Response,
    expectedDetails: {
      from: LessonContentPublicationStatus;
      to: LessonContentPublicationStatus;
    },
  ): void {
    const body = response.body as {
      error: {
        code: string;
        details: Record<string, unknown>;
      };
    };

    expect(body.error.code).toBe('learning.content.publication_conflict');
    expect(body.error.details).toEqual(expectedDetails);
    expect(Object.keys(body.error.details).sort()).toEqual(['from', 'to']);
    expect(JSON.stringify(body.error.details)).not.toMatch(
      /contentItemId|curriculumId|unitId|lessonId|schoolId|actorId|title|bodyText|url|fileId|timestamp|updatedAt/iu,
    );
  }

  function expectSafeLessonContentError(
    response: request.Response,
    expectedCode:
      | 'academics.lesson_content.not_found'
      | 'academics.lesson_content.file_not_found',
    forbiddenValues: string[],
  ): void {
    const body = response.body as {
      error: { code: string; details?: Record<string, unknown> };
    };

    expect(body.error.code).toBe(expectedCode);
    expect(body.error.details).toBeUndefined();
    const serializedError = JSON.stringify(body.error);
    for (const forbiddenKey of [
      'curriculumId',
      'unitId',
      'lessonId',
      'contentItemId',
      'fileId',
      'schoolId',
      'organizationId',
      'actorId',
    ]) {
      expect(serializedError).not.toContain(`"${forbiddenKey}"`);
    }
    for (const forbiddenValue of forbiddenValues) {
      expect(serializedError).not.toContain(forbiddenValue);
    }
  }

  function expectOneSuccessOneConflict(
    responses: request.Response[],
    expectedDetails: {
      from: LessonContentPublicationStatus;
      to: LessonContentPublicationStatus;
    },
  ): void {
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const conflict = responses.find((response) => response.status === 409);
    expect(conflict).toBeDefined();
    expectPublicationConflictResponse(
      conflict as request.Response,
      expectedDetails,
    );
  }

  async function countOperationAudits(
    contentItemId: string,
    actions: string[],
  ): Promise<number> {
    return prisma.auditLog.count({
      where: {
        resourceType: 'lesson_content_item',
        resourceId: contentItemId,
        action: { in: actions },
      },
    });
  }

  async function provePublicationConcurrency(): Promise<void> {
    const publishId = await createConcurrencyDraft('publish-race');
    const publishUrl = `${contentListUrl()}/${publishId}/publish`;
    const publishResponses = await Promise.all([
      request(app.getHttpServer())
        .post(publishUrl)
        .set('Authorization', bearer(adminAuth)),
      request(app.getHttpServer())
        .post(publishUrl)
        .set('Authorization', bearer(adminAuth)),
    ]);
    expectOneSuccessOneConflict(publishResponses, {
      from: LessonContentPublicationStatus.DRAFT,
      to: LessonContentPublicationStatus.PUBLISHED,
    });
    await expect(
      prisma.lessonContentItem.findUniqueOrThrow({
        where: { id: publishId },
        select: { publicationStatus: true },
      }),
    ).resolves.toEqual({
      publicationStatus: LessonContentPublicationStatus.PUBLISHED,
    });
    expect(
      await countOperationAudits(publishId, [
        'academics.lesson_content.publish',
      ]),
    ).toBe(1);

    const archiveId = await createConcurrencyDraft('archive-race');
    const archiveBaseUrl = `${contentListUrl()}/${archiveId}`;
    await request(app.getHttpServer())
      .post(`${archiveBaseUrl}/publish`)
      .set('Authorization', bearer(adminAuth))
      .expect(200);
    const archiveResponses = await Promise.all([
      request(app.getHttpServer())
        .post(`${archiveBaseUrl}/archive`)
        .set('Authorization', bearer(adminAuth)),
      request(app.getHttpServer())
        .post(`${archiveBaseUrl}/archive`)
        .set('Authorization', bearer(adminAuth)),
    ]);
    expectOneSuccessOneConflict(archiveResponses, {
      from: LessonContentPublicationStatus.PUBLISHED,
      to: LessonContentPublicationStatus.ARCHIVED,
    });
    await expect(
      prisma.lessonContentItem.findUniqueOrThrow({
        where: { id: archiveId },
        select: { publicationStatus: true },
      }),
    ).resolves.toEqual({
      publicationStatus: LessonContentPublicationStatus.ARCHIVED,
    });
    expect(
      await countOperationAudits(archiveId, [
        'academics.lesson_content.archive',
      ]),
    ).toBe(1);

    const publishArchiveId = await createConcurrencyDraft('publish-archive');
    const publishArchiveUrl = `${contentListUrl()}/${publishArchiveId}`;
    await request(app.getHttpServer())
      .post(`${publishArchiveUrl}/publish`)
      .set('Authorization', bearer(adminAuth))
      .expect(200);
    const publishArchiveAuditsBefore =
      await countTransitionAudits(publishArchiveId);
    const [publishResponse, archiveResponse] = await Promise.all([
      request(app.getHttpServer())
        .post(`${publishArchiveUrl}/publish`)
        .set('Authorization', bearer(adminAuth)),
      request(app.getHttpServer())
        .post(`${publishArchiveUrl}/archive`)
        .set('Authorization', bearer(adminAuth)),
    ]);
    expect(publishResponse.status).toBe(409);
    expectPublicationConflictResponse(publishResponse, {
      from: LessonContentPublicationStatus.PUBLISHED,
      to: LessonContentPublicationStatus.PUBLISHED,
    });
    expect(archiveResponse.status).toBe(200);
    expect(
      await prisma.lessonContentItem.findUniqueOrThrow({
        where: { id: publishArchiveId },
        select: { publicationStatus: true },
      }),
    ).toEqual({
      publicationStatus: LessonContentPublicationStatus.ARCHIVED,
    });
    expect(
      (await countTransitionAudits(publishArchiveId)) -
        publishArchiveAuditsBefore,
    ).toBe(1);
  }
  /* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */

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
      await prisma.fileUploadSession.deleteMany({
        where: { fileId: uploadedFileId },
      });
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
