import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CurriculumStatus,
  FileUploadPurpose,
  FileUploadSessionStatus,
  FileVisibility,
  LessonContentItemType,
  LessonContentPublicationStatus,
  LessonPlanItemStatus,
  LessonPlanStatus,
  MembershipStatus,
  OrganizationStatus,
  type Prisma,
  PrismaClient,
  SchoolStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  TimetableConfigStatus,
  TimetableEntryStatus,
  TimetablePeriodType,
  TimetablePublicationStatus,
  TimetableScopeType,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';
import { MinioAdapter } from '../../src/infrastructure/storage/minio.adapter';
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'StudentLessons123!';
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
};

type AcademicContext = {
  academicYearId: string;
  termId: string;
};

type LessonFixture = {
  allocationId: string;
  classroomId: string;
  subjectId: string;
  curriculumId: string;
  unitId: string;
  lessonId: string;
  lessonPlanId: string;
  lessonPlanItemId: string;
  timetableEntryId: string;
  fileContentItemId: string;
};

jest.setTimeout(120000);

describe('Student App lesson content workflows (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationId = '';
  let crossOrganizationId = '';
  let schoolId = '';
  let crossSchoolId = '';
  let teacherUserId = '';
  let studentUserId = '';
  let studentEmail = '';
  let academic: AcademicContext;
  let fixture: LessonFixture;
  let otherClassroomFixture: LessonFixture;
  let crossSchoolFixture: LessonFixture;
  let archivedPlanItemId = '';
  let archivedCurriculumItemId = '';
  let playbackContentItemId = '';
  let playbackSessionId = '';
  let studentAuth: AuthTokens;

  const suffix = randomUUID().split('-')[0];
  const marker = `s22h-e2e-${suffix}`;
  const cleanup = createCleanupState();

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    await ensurePlaybackBucket();

    const [teacherRole, studentRole] = await Promise.all([
      findSystemRole('teacher'),
      findSystemRole('student'),
    ]);

    organizationId = await createOrganization('main');
    crossOrganizationId = await createOrganization('cross');
    schoolId = await createSchool(organizationId, 'main');
    crossSchoolId = await createSchool(crossOrganizationId, 'cross');
    academic = await createAcademicContext(schoolId);

    teacherUserId = await createUserWithMembership({
      email: `${marker}-teacher@example.test`,
      firstName: 'Teacher',
      lastName: 'User',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId,
      schoolId,
    });
    studentEmail = `${marker}-student@example.test`;
    studentUserId = await createUserWithMembership({
      email: studentEmail,
      firstName: 'Student',
      lastName: 'User',
      userType: UserType.STUDENT,
      roleId: studentRole.id,
      organizationId,
      schoolId,
    });

    fixture = await createLessonFixture({
      organizationId,
      schoolId,
      academicYearId: academic.academicYearId,
      termId: academic.termId,
      teacherUserId,
      marker: 'own',
      plannedDate: '2026-09-14',
      deletedContent: true,
      itemNotes: 'teacher-only note',
    });
    const playback = await createPlaybackMedia(fixture);
    playbackContentItemId = playback.contentItemId;
    playbackSessionId = playback.uploadSessionId;
    await prisma.lessonContentItem.createMany({
      data: [
        {
          schoolId,
          curriculumId: fixture.curriculumId,
          unitId: fixture.unitId,
          lessonId: fixture.lessonId,
          type: LessonContentItemType.TEXT,
          title: `${marker}-own-draft`,
          bodyText: 'Student-hidden draft',
          sortOrder: 3,
          createdByUserId: teacherUserId,
        },
        {
          schoolId,
          curriculumId: fixture.curriculumId,
          unitId: fixture.unitId,
          lessonId: fixture.lessonId,
          type: LessonContentItemType.TEXT,
          title: `${marker}-own-archived`,
          bodyText: 'Student-hidden archived',
          sortOrder: 4,
          createdByUserId: teacherUserId,
          publicationStatus: LessonContentPublicationStatus.ARCHIVED,
          publishedAt: new Date(),
          publishedByUserId: teacherUserId,
          archivedAt: new Date(),
          archivedByUserId: teacherUserId,
        },
      ],
    });
    await createStudentEnrollment({
      organizationId,
      schoolId,
      userId: studentUserId,
      academicYearId: academic.academicYearId,
      termId: academic.termId,
      classroomId: fixture.classroomId,
      marker: 'own',
    });

    otherClassroomFixture = await createLessonFixture({
      organizationId,
      schoolId,
      academicYearId: academic.academicYearId,
      termId: academic.termId,
      teacherUserId,
      marker: 'other-class',
      plannedDate: '2026-09-14',
    });

    archivedPlanItemId = await createExistingScopeLessonPlanItem({
      source: fixture,
      schoolId,
      academicYearId: academic.academicYearId,
      termId: academic.termId,
      teacherUserId,
      marker: 'archived-plan',
      planStatus: LessonPlanStatus.ARCHIVED,
    });
    archivedCurriculumItemId = await createExistingScopeLessonPlanItem({
      source: fixture,
      schoolId,
      academicYearId: academic.academicYearId,
      termId: academic.termId,
      teacherUserId,
      marker: 'archived-curriculum',
      curriculumStatus: CurriculumStatus.ARCHIVED,
    });

    const crossAcademic = await createAcademicContext(crossSchoolId);
    const crossTeacherId = await createUserWithMembership({
      email: `${marker}-cross-teacher@example.test`,
      firstName: 'Cross',
      lastName: 'Teacher',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId: crossOrganizationId,
      schoolId: crossSchoolId,
    });
    crossSchoolFixture = await createLessonFixture({
      organizationId: crossOrganizationId,
      schoolId: crossSchoolId,
      academicYearId: crossAcademic.academicYearId,
      termId: crossAcademic.termId,
      teacherUserId: crossTeacherId,
      marker: 'cross',
      plannedDate: '2026-09-14',
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
      }),
    );
    await app.init();

    studentAuth = await login(studentEmail);
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
      await cleanupData();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('registers Student App lesson routes and preserves Parent lesson routes', () => {
    const routes = listRegisteredRoutes();

    expect(routes).toEqual(
      expect.arrayContaining([
        'GET /api/v1/student/lessons/today',
        'GET /api/v1/student/lessons/week',
        'GET /api/v1/student/lessons/:lessonPlanItemId',
        'GET /api/v1/student/lessons/:lessonPlanItemId/content/:contentItemId/playback',
        'GET /api/v1/student/schedule',
        'GET /api/v1/student/subjects',
        'GET /api/v1/student/subjects/:subjectId/lessons',
        'GET /api/v1/parent/children/:studentId/lessons/today',
        'GET /api/v1/parent/children/:studentId/lessons/week',
        'GET /api/v1/parent/children/:studentId/lessons/:lessonPlanItemId',
        'GET /api/v1/teacher/lesson-preparation/today',
        'GET /api/v1/academics/lesson-plans',
      ]),
    );
  });

  /* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access -- Supertest response bodies are untyped at the HTTP boundary. */
  it('returns the exact renewable 300-second inline video playback capability', async () => {
    await prisma.lessonContentItem.update({
      where: { id: playbackContentItemId },
      data: {
        publicationStatus: LessonContentPublicationStatus.PUBLISHED,
        publishedAt: new Date(),
        publishedByUserId: teacherUserId,
      },
    });
    const auditBefore = await prisma.auditLog.count({ where: { schoolId } });
    const sessionBefore = await prisma.fileUploadSession.findUniqueOrThrow({
      where: { id: playbackSessionId },
      select: { updatedAt: true },
    });
    try {
      const response = await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/student/lessons/${fixture.lessonPlanItemId}/content/${playbackContentItemId}/playback`,
        )
        .set('Authorization', bearer(studentAuth))
        .expect(200);

      expect(Object.keys(response.body).sort()).toEqual([
        'disposition',
        'expiresAt',
        'mimeType',
        'renewable',
        'sizeBytes',
        'url',
      ]);
      expect(response.body).toMatchObject({
        mimeType: 'video/mp4',
        sizeBytes: '4096',
        disposition: 'inline',
        renewable: true,
      });
      const signedUrl = new URL(response.body.url as string);
      expect(signedUrl.searchParams.get('X-Amz-Expires')).toBe('300');
      expect(signedUrl.searchParams.get('response-content-disposition')).toBe(
        'inline',
      );
      expect(signedUrl.searchParams.get('response-content-type')).toBe(
        'video/mp4',
      );
      expect(response.body.expiresAt).toBe(
        signedExpiry(signedUrl).toISOString(),
      );

      const renewed = await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/student/lessons/${fixture.lessonPlanItemId}/content/${playbackContentItemId}/playback`,
        )
        .set('Authorization', bearer(studentAuth))
        .expect(200);
      expect(
        new URL(renewed.body.url as string).searchParams.get('X-Amz-Expires'),
      ).toBe('300');
      expect(await prisma.auditLog.count({ where: { schoolId } })).toBe(
        auditBefore,
      );
      await expect(
        prisma.fileUploadSession.findUniqueOrThrow({
          where: { id: playbackSessionId },
          select: { updatedAt: true },
        }),
      ).resolves.toEqual(sessionBefore);
    } finally {
      await prisma.lessonContentItem.update({
        where: { id: playbackContentItemId },
        data: {
          publicationStatus: LessonContentPublicationStatus.DRAFT,
          publishedAt: null,
          publishedByUserId: null,
        },
      });
    }
  });

  it('collapses hidden playback resources to one safe 404 without attempted IDs', async () => {
    const cases = [
      {
        itemId: fixture.lessonPlanItemId,
        contentId: playbackContentItemId,
      },
      {
        itemId: fixture.lessonPlanItemId,
        contentId: fixture.fileContentItemId,
      },
      {
        itemId: otherClassroomFixture.lessonPlanItemId,
        contentId: playbackContentItemId,
      },
      {
        itemId: crossSchoolFixture.lessonPlanItemId,
        contentId: playbackContentItemId,
      },
      {
        itemId: randomUUID(),
        contentId: randomUUID(),
      },
    ];

    for (const hidden of cases) {
      const response = await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/student/lessons/${hidden.itemId}/content/${hidden.contentId}/playback`,
        )
        .set('Authorization', bearer(studentAuth))
        .expect(404);
      expect(response.body?.error).toMatchObject({
        code: 'learning.content.playback_not_found',
        message: 'Lesson content playback was not found',
      });
      expect(response.body?.error?.details).toBeUndefined();
      const json = JSON.stringify(response.body);
      expect(json).not.toContain(hidden.itemId);
      expect(json).not.toContain(hidden.contentId);
    }
  });

  it('uses the established validation 400 for malformed playback UUIDs', async () => {
    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/student/lessons/not-a-uuid/content/${playbackContentItemId}/playback`,
      )
      .set('Authorization', bearer(studentAuth))
      .expect(400);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/student/lessons/${fixture.lessonPlanItemId}/content/not-a-uuid/playback`,
      )
      .set('Authorization', bearer(studentAuth))
      .expect(400);
  });
  /* eslint-enable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */

  it('lists today and week visible lessons for the current student classroom', async () => {
    const today = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/lessons/today`)
      .query({ date: '2026-09-14' })
      .set('Authorization', bearer(studentAuth))
      .expect(200);

    expect(today.body).toMatchObject({
      date: '2026-09-14',
      dayOfWeek: 1,
      items: [
        expect.objectContaining({
          lessonPlanItemId: fixture.lessonPlanItemId,
          lessonPlanId: fixture.lessonPlanId,
          timetableEntryId: fixture.timetableEntryId,
          plannedDate: '2026-09-14',
          status: 'planned',
        }),
      ],
    });
    expect(JSON.stringify(today.body)).not.toContain(
      otherClassroomFixture.lessonPlanItemId,
    );

    const week = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/lessons/week`)
      .query({ date: '2026-09-16' })
      .set('Authorization', bearer(studentAuth))
      .expect(200);

    expect(week.body.weekStartDate).toBe('2026-09-14');
    expect(week.body.days).toHaveLength(7);
    expect(
      week.body.days.find((day: { date: string }) => day.date === '2026-09-14')
        ?.items,
    ).toEqual([
      expect.objectContaining({
        lessonPlanItemId: fixture.lessonPlanItemId,
      }),
    ]);
  });

  it('returns safe lesson detail with curriculum content and no teacher-only fields', async () => {
    const detail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/lessons/${fixture.lessonPlanItemId}`)
      .set('Authorization', bearer(studentAuth))
      .expect(200);

    expect(detail.body).toMatchObject({
      lessonPlanItemId: fixture.lessonPlanItemId,
      subject: expect.objectContaining({ id: fixture.subjectId }),
      classroom: expect.objectContaining({ id: fixture.classroomId }),
      period: expect.objectContaining({
        label: 'Period 1',
        periodIndex: 1,
      }),
      curriculum: expect.objectContaining({ id: fixture.curriculumId }),
      unit: expect.objectContaining({ id: fixture.unitId }),
      lesson: expect.objectContaining({ id: fixture.lessonId }),
    });
    expect(detail.body.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'text',
          bodyText: 'Student-visible content',
          file: null,
          isRequired: true,
          estimatedMinutes: 10,
        }),
        expect.objectContaining({
          type: 'file',
          file: expect.objectContaining({
            filename: expect.stringContaining('.pdf'),
            mimeType: 'application/pdf',
            sizeBytes: '2048',
          }),
        }),
      ]),
    );
    const json = JSON.stringify(detail.body);
    expect(json).not.toContain('teacher-only note');
    expect(json).not.toContain('Should stay hidden');
    expect(json).not.toContain(`${marker}-own-draft`);
    expect(json).not.toContain(`${marker}-own-archived`);
    expectNoObjectKey(detail.body, 'schoolId');
    expectNoObjectKey(detail.body, 'organizationId');
    expectNoObjectKey(detail.body, 'deletedAt');
    expectNoObjectKey(detail.body, 'objectKey');
    expectNoObjectKey(detail.body, 'bucket');
    expectNoObjectKey(detail.body, 'uploaderId');
    expectNoObjectKey(detail.body, 'notes');
  });

  it('requires republishing an edited ACTIVE-curriculum draft before Student visibility', async () => {
    const controlled = await prisma.lessonContentItem.create({
      data: {
        schoolId,
        curriculumId: fixture.curriculumId,
        unitId: fixture.unitId,
        lessonId: fixture.lessonId,
        type: LessonContentItemType.TEXT,
        title: `${marker}-controlled-draft`,
        bodyText: 'Initial controlled body',
        sortOrder: 5,
        createdByUserId: teacherUserId,
      },
      select: { id: true },
    });

    const readContent = async (): Promise<string> => {
      const response = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/student/lessons/${fixture.lessonPlanItemId}`)
        .set('Authorization', bearer(studentAuth))
        .expect(200);
      const body = response.body as { content: unknown };
      return JSON.stringify(body.content);
    };

    expect(await readContent()).not.toContain('Initial controlled body');

    await prisma.lessonContentItem.update({
      where: { id: controlled.id },
      data: {
        publicationStatus: LessonContentPublicationStatus.PUBLISHED,
        publishedAt: new Date(),
        publishedByUserId: teacherUserId,
      },
    });
    expect(await readContent()).toContain('Initial controlled body');

    await prisma.lessonContentItem.update({
      where: { id: controlled.id },
      data: {
        publicationStatus: LessonContentPublicationStatus.DRAFT,
        publishedAt: null,
        publishedByUserId: null,
      },
    });
    expect(await readContent()).not.toContain('Initial controlled body');

    await prisma.lessonContentItem.update({
      where: { id: controlled.id },
      data: { bodyText: 'Reviewed controlled body' },
    });
    expect(await readContent()).not.toContain('Reviewed controlled body');

    await prisma.lessonContentItem.update({
      where: { id: controlled.id },
      data: {
        publicationStatus: LessonContentPublicationStatus.PUBLISHED,
        publishedAt: new Date(),
        publishedByUserId: teacherUserId,
      },
    });
    expect(await readContent()).toContain('Reviewed controlled body');

    await prisma.lessonContentItem.update({
      where: { id: controlled.id },
      data: {
        publicationStatus: LessonContentPublicationStatus.DRAFT,
        publishedAt: null,
        publishedByUserId: null,
      },
    });
  });

  it('does not expose another classroom, archived plan, or archived curriculum lessons', async () => {
    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/student/lessons/${otherClassroomFixture.lessonPlanItemId}`,
      )
      .set('Authorization', bearer(studentAuth))
      .expect(404);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/lessons/${archivedPlanItemId}`)
      .set('Authorization', bearer(studentAuth))
      .expect(404);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/lessons/${archivedCurriculumItemId}`)
      .set('Authorization', bearer(studentAuth))
      .expect(404);
  });

  it('keeps existing Student schedule and subject routes working', async () => {
    const schedule = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/schedule`)
      .query({ date: '2026-09-14' })
      .set('Authorization', bearer(studentAuth))
      .expect(200);
    expect(schedule.body.items).toEqual([
      expect.objectContaining({
        timetableEntryId: fixture.timetableEntryId,
      }),
    ]);

    const subjects = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/subjects`)
      .set('Authorization', bearer(studentAuth))
      .expect(200);
    expect(JSON.stringify(subjects.body)).toContain(fixture.subjectId);
  });

  /* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- Supertest exposes response bodies as any in these phase-1A HTTP contract assertions. */
  it('discovers Subject lessons with the exact safe phase-1A response', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/subjects/${fixture.subjectId}/lessons`)
      .set('Authorization', bearer(studentAuth))
      .expect(200);

    expect(response.body).toEqual({
      items: [
        {
          lessonPlanItemId: fixture.lessonPlanItemId,
          plannedDate: '2026-09-14',
          status: 'planned',
          title: expect.any(String),
          unit: {
            id: fixture.unitId,
            title: expect.any(String),
            sortOrder: 1,
          },
          lesson: {
            id: fixture.lessonId,
            title: expect.any(String),
            sortOrder: 1,
          },
          period: {
            id: expect.any(String),
            label: 'Period 1',
          },
          contentSummary: {
            totalCount: 2,
            requiredCount: 1,
            videoCount: 0,
            fileCount: 1,
            hasPlayableVideo: false,
          },
        },
      ],
      pageInfo: {
        nextCursor: null,
        hasNextPage: false,
      },
    });

    for (const forbidden of [
      'schoolId',
      'organizationId',
      'studentId',
      'enrollmentId',
      'academicYearId',
      'termId',
      'classroomId',
      'lessonPlanId',
      'curriculumId',
      'teacherUserId',
      'teacherSubjectAllocationId',
      'bodyText',
      'url',
      'fileId',
      'filename',
      'mimeType',
      'sizeBytes',
      'bucket',
      'objectKey',
      'checksum',
      'metadata',
      'notes',
      'createdBy',
      'updatedBy',
    ]) {
      expectNoObjectKey(response.body, forbidden);
    }
  });

  it('supports allocation-only eligibility and hides a Subject with neither branch', async () => {
    const allocationOnlySubject = await prisma.subject.create({
      data: {
        schoolId,
        nameAr: `${marker}-allocation-only-ar`,
        nameEn: `${marker}-allocation-only`,
        code: `${suffix}-AO`.toUpperCase(),
        isActive: true,
      },
      select: { id: true },
    });
    cleanup.subjectIds.add(allocationOnlySubject.id);
    const allocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId,
        teacherUserId,
        subjectId: allocationOnlySubject.id,
        classroomId: fixture.classroomId,
        termId: academic.termId,
      },
      select: { id: true },
    });
    cleanup.allocationIds.add(allocation.id);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/student/subjects/${allocationOnlySubject.id}/lessons`,
      )
      .set('Authorization', bearer(studentAuth))
      .expect(200)
      .expect({
        items: [],
        pageInfo: { nextCursor: null, hasNextPage: false },
      });

    const ineligibleSubject = await prisma.subject.create({
      data: {
        schoolId,
        nameAr: `${marker}-ineligible-ar`,
        nameEn: `${marker}-ineligible`,
        code: `${suffix}-NO`.toUpperCase(),
        isActive: true,
      },
      select: { id: true },
    });
    cleanup.subjectIds.add(ineligibleSubject.id);

    const hidden = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/subjects/${ineligibleSubject.id}/lessons`)
      .set('Authorization', bearer(studentAuth))
      .expect(404);
    expect(hidden.body?.error).toMatchObject({
      code: 'learning.subject_lessons.not_found',
      message: 'Subject lessons not found or not accessible',
    });
    expect(hidden.body?.error?.details).toBeUndefined();
    expect(JSON.stringify(hidden.body)).not.toContain(ineligibleSubject.id);
  });

  it('preserves visible-plan eligibility after its originating allocation is transferred', async () => {
    const transferSubject = await prisma.subject.create({
      data: {
        schoolId,
        nameAr: `${marker}-transferred-ar`,
        nameEn: `${marker}-transferred`,
        code: `${suffix}-TR`.toUpperCase(),
        isActive: true,
      },
      select: { id: true },
    });
    cleanup.subjectIds.add(transferSubject.id);
    try {
      await prisma.teacherSubjectAllocation.update({
        where: { id: fixture.allocationId },
        data: { subjectId: transferSubject.id },
      });

      const response = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/student/subjects/${fixture.subjectId}/lessons`)
        .set('Authorization', bearer(studentAuth))
        .expect(200);

      expect(response.body.items).toEqual([
        expect.objectContaining({ lessonPlanItemId: fixture.lessonPlanItemId }),
      ]);
    } finally {
      await prisma.teacherSubjectAllocation.update({
        where: { id: fixture.allocationId },
        data: { subjectId: fixture.subjectId },
      });
    }
  });

  it('lists plans from co-teachers without selecting one allocation or plan', async () => {
    const teacherRole = await findSystemRole('teacher');
    const secondTeacherId = await createUserWithMembership({
      email: `${marker}-second-teacher@example.test`,
      firstName: 'Second',
      lastName: 'Teacher',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId,
      schoolId,
    });
    const secondAllocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId,
        teacherUserId: secondTeacherId,
        subjectId: fixture.subjectId,
        classroomId: fixture.classroomId,
        termId: academic.termId,
      },
      select: { id: true },
    });
    cleanup.allocationIds.add(secondAllocation.id);
    const secondPlan = await prisma.lessonPlan.create({
      data: {
        schoolId,
        academicYearId: academic.academicYearId,
        termId: academic.termId,
        teacherSubjectAllocationId: secondAllocation.id,
        teacherUserId: secondTeacherId,
        classroomId: fixture.classroomId,
        subjectId: fixture.subjectId,
        curriculumId: fixture.curriculumId,
        title: `${marker}-co-teacher-plan`,
        status: LessonPlanStatus.ACTIVE,
        weekStartDate: new Date('2026-09-14T00:00:00.000Z'),
        weekEndDate: new Date('2026-09-20T00:00:00.000Z'),
        createdByUserId: secondTeacherId,
      },
      select: { id: true },
    });
    cleanup.lessonPlanIds.add(secondPlan.id);
    const secondItem = await prisma.lessonPlanItem.create({
      data: {
        schoolId,
        lessonPlanId: secondPlan.id,
        curriculumId: fixture.curriculumId,
        unitId: fixture.unitId,
        lessonId: fixture.lessonId,
        plannedDate: new Date('2026-09-15T00:00:00.000Z'),
        title: `${marker}-co-teacher-item`,
        status: LessonPlanItemStatus.IN_PROGRESS,
        sortOrder: 2,
        createdByUserId: secondTeacherId,
      },
      select: { id: true },
    });
    cleanup.lessonPlanItemIds.add(secondItem.id);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/subjects/${fixture.subjectId}/lessons`)
      .set('Authorization', bearer(studentAuth))
      .expect(200);
    expect(response.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lessonPlanItemId: fixture.lessonPlanItemId,
        }),
        expect.objectContaining({ lessonPlanItemId: secondItem.id }),
      ]),
    );
  });

  it('enforces Term ranges and every status filter', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/subjects/${fixture.subjectId}/lessons`)
      .query({ from: '2026-09-14', to: '2026-09-14' })
      .set('Authorization', bearer(studentAuth))
      .expect(200)
      .expect((response) => {
        expect(response.body.items).toEqual([
          expect.objectContaining({
            lessonPlanItemId: fixture.lessonPlanItemId,
          }),
        ]);
      });

    for (const query of [
      { from: '2026-08-31' },
      { to: '2027-01-01' },
      { from: '2026-09-15', to: '2026-09-14' },
      { from: '2026-02-31' },
    ]) {
      const response = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/student/subjects/${fixture.subjectId}/lessons`)
        .query(query)
        .set('Authorization', bearer(studentAuth))
        .expect(400);
      expect(response.body?.error?.code).toBe('validation.failed');
    }

    const statusCases = [
      ['planned', LessonPlanItemStatus.PLANNED],
      ['in_progress', LessonPlanItemStatus.IN_PROGRESS],
      ['done', LessonPlanItemStatus.DONE],
      ['skipped', LessonPlanItemStatus.SKIPPED],
      ['rescheduled', LessonPlanItemStatus.RESCHEDULED],
      ['cancelled', LessonPlanItemStatus.CANCELLED],
    ] as const;
    const additionalStatuses = await Promise.all(
      statusCases.slice(2).map(async ([status, prismaStatus], index) => {
        const item = await prisma.lessonPlanItem.create({
          data: {
            schoolId,
            lessonPlanId: fixture.lessonPlanId,
            curriculumId: fixture.curriculumId,
            unitId: fixture.unitId,
            lessonId: fixture.lessonId,
            plannedDate: new Date('2026-09-20T00:00:00.000Z'),
            title: `${marker}-status-${status}`,
            status: prismaStatus,
            sortOrder: 20 + index,
            createdByUserId: teacherUserId,
          },
          select: { id: true },
        });
        cleanup.lessonPlanItemIds.add(item.id);
        return item;
      }),
    );
    expect(additionalStatuses).toHaveLength(4);

    for (const [status] of statusCases) {
      const response = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/student/subjects/${fixture.subjectId}/lessons`)
        .query({ status })
        .set('Authorization', bearer(studentAuth))
        .expect(200);
      expect(response.body.items.length).toBeGreaterThan(0);
      expect(
        response.body.items.every(
          (item: { status: string }) => item.status === status,
        ),
      ).toBe(true);
    }

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/subjects/${fixture.subjectId}/lessons`)
      .query({ status: 'unknown' })
      .set('Authorization', bearer(studentAuth))
      .expect(400);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/subjects/${fixture.subjectId}/lessons`)
      .query({ limit: 51 })
      .set('Authorization', bearer(studentAuth))
      .expect(400);
  });

  it('orders the complete PostgreSQL tuple and crosses numeric periods into null periods', async () => {
    const periodTwoEntryId = await createAdditionalTimetableEntry({
      sourceEntryId: fixture.timetableEntryId,
      periodIndex: 2,
      label: 'Period 2',
    });
    const ids = {
      periodOne: '11000000-0000-4000-8000-000000000001',
      periodTwo: '11000000-0000-4000-8000-000000000002',
      periodTwoTieLow: '11000000-0000-4000-8000-000000000003',
      periodTwoTieHigh: '11000000-0000-4000-8000-000000000004',
      nullPeriod: '11000000-0000-4000-8000-000000000005',
      laterDate: '11000000-0000-4000-8000-000000000006',
    } as const;
    const orderedIds = [
      ids.periodOne,
      ids.periodTwo,
      ids.periodTwoTieLow,
      ids.periodTwoTieHigh,
      ids.nullPeriod,
      ids.laterDate,
    ];
    await prisma.lessonPlanItem.createMany({
      data: [
        tupleItemData({
          id: ids.periodOne,
          title: `${marker}-tuple-period-1`,
          plannedDate: '2026-10-05',
          timetableEntryId: fixture.timetableEntryId,
          sortOrder: 1,
        }),
        tupleItemData({
          id: ids.periodTwo,
          title: `${marker}-tuple-period-2`,
          plannedDate: '2026-10-05',
          timetableEntryId: periodTwoEntryId,
          sortOrder: 1,
        }),
        tupleItemData({
          id: ids.periodTwoTieLow,
          title: `${marker}-tuple-period-2-tie-low`,
          plannedDate: '2026-10-05',
          timetableEntryId: periodTwoEntryId,
          sortOrder: 2,
        }),
        tupleItemData({
          id: ids.periodTwoTieHigh,
          title: `${marker}-tuple-period-2-tie-high`,
          plannedDate: '2026-10-05',
          timetableEntryId: periodTwoEntryId,
          sortOrder: 2,
        }),
        tupleItemData({
          id: ids.nullPeriod,
          title: `${marker}-tuple-null-period`,
          plannedDate: '2026-10-05',
          timetableEntryId: null,
          sortOrder: 1,
        }),
        tupleItemData({
          id: ids.laterDate,
          title: `${marker}-tuple-later-date`,
          plannedDate: '2026-10-06',
          timetableEntryId: fixture.timetableEntryId,
          sortOrder: 1,
        }),
      ],
    });
    for (const id of orderedIds) cleanup.lessonPlanItemIds.add(id);

    const numericBoundaryPage = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/subjects/${fixture.subjectId}/lessons`)
      .query({ from: '2026-10-05', to: '2026-10-06', limit: 4 })
      .set('Authorization', bearer(studentAuth))
      .expect(200);
    expect(
      numericBoundaryPage.body.items.map(
        (item: { lessonPlanItemId: string }) => item.lessonPlanItemId,
      ),
    ).toEqual(orderedIds.slice(0, 4));
    expect(numericBoundaryPage.body.items.at(-1)).toMatchObject({
      lessonPlanItemId: ids.periodTwoTieHigh,
      period: { id: expect.any(String), label: 'Period 2' },
    });
    const boundaryCursor = decodeOpaqueCursor(
      numericBoundaryPage.body.pageInfo.nextCursor,
    );
    expect(boundaryCursor).toMatchObject({
      plannedDate: '2026-10-05',
      periodIndex: 2,
      sortOrder: 2,
      itemId: ids.periodTwoTieHigh,
    });

    const afterNumericBoundary = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/subjects/${fixture.subjectId}/lessons`)
      .query({
        from: '2026-10-05',
        to: '2026-10-06',
        limit: 4,
        cursor: numericBoundaryPage.body.pageInfo.nextCursor,
      })
      .set('Authorization', bearer(studentAuth))
      .expect(200);
    expect(afterNumericBoundary.body.items[0]).toMatchObject({
      lessonPlanItemId: ids.nullPeriod,
      period: { id: null, label: null },
    });
    const boundaryIds = [
      ...numericBoundaryPage.body.items,
      ...afterNumericBoundary.body.items,
    ].map((item: { lessonPlanItemId: string }) => item.lessonPlanItemId);
    expect(boundaryIds).toEqual(orderedIds);
    expect(new Set(boundaryIds).size).toBe(boundaryIds.length);

    const pages: Array<{
      body: {
        items: Array<{ lessonPlanItemId: string }>;
        pageInfo: { nextCursor: string | null; hasNextPage: boolean };
      };
    }> = [];
    let cursor: string | undefined;
    do {
      const page = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/student/subjects/${fixture.subjectId}/lessons`)
        .query({
          from: '2026-10-05',
          to: '2026-10-06',
          limit: 2,
          ...(cursor ? { cursor } : {}),
        })
        .set('Authorization', bearer(studentAuth))
        .expect(200);
      pages.push(page);
      cursor = page.body.pageInfo.nextCursor ?? undefined;
    } while (cursor);

    expect(pages).toHaveLength(3);
    const pagedIds = pages.flatMap((page) =>
      page.body.items.map(
        (item: { lessonPlanItemId: string }) => item.lessonPlanItemId,
      ),
    );
    expect(pagedIds).toEqual(orderedIds);
    expect(new Set(pagedIds).size).toBe(pagedIds.length);
    const replay = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/subjects/${fixture.subjectId}/lessons`)
      .query({
        from: '2026-10-05',
        to: '2026-10-06',
        limit: 2,
        cursor: pages[0].body.pageInfo.nextCursor,
      })
      .set('Authorization', bearer(studentAuth))
      .expect(200);
    expect(replay.body).toEqual(pages[1].body);
  });

  it('uses a mismatched timetable ordering period while keeping the response period context-safe', async () => {
    const mismatchedId = '12000000-0000-4000-8000-000000000001';
    const nullPeriodId = '12000000-0000-4000-8000-000000000002';
    await prisma.lessonPlanItem.createMany({
      data: [
        tupleItemData({
          id: mismatchedId,
          title: `${marker}-mismatched-timetable`,
          plannedDate: '2026-10-07',
          timetableEntryId: otherClassroomFixture.timetableEntryId,
          sortOrder: 1,
        }),
        tupleItemData({
          id: nullPeriodId,
          title: `${marker}-mismatched-following-null`,
          plannedDate: '2026-10-07',
          timetableEntryId: null,
          sortOrder: 1,
        }),
      ],
    });
    cleanup.lessonPlanItemIds.add(mismatchedId);
    cleanup.lessonPlanItemIds.add(nullPeriodId);

    const first = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/subjects/${fixture.subjectId}/lessons`)
      .query({ from: '2026-10-07', to: '2026-10-07', limit: 1 })
      .set('Authorization', bearer(studentAuth))
      .expect(200);
    expect(first.body.items).toEqual([
      expect.objectContaining({
        lessonPlanItemId: mismatchedId,
        period: { id: null, label: null },
      }),
    ]);
    expect(decodeOpaqueCursor(first.body.pageInfo.nextCursor)).toMatchObject({
      periodIndex: 1,
      itemId: mismatchedId,
    });

    const second = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/subjects/${fixture.subjectId}/lessons`)
      .query({
        from: '2026-10-07',
        to: '2026-10-07',
        limit: 1,
        cursor: first.body.pageInfo.nextCursor,
      })
      .set('Authorization', bearer(studentAuth))
      .expect(200);
    expect(second.body.items).toEqual([
      expect.objectContaining({
        lessonPlanItemId: nullPeriodId,
        period: { id: null, label: null },
      }),
    ]);
    const ids = [...first.body.items, ...second.body.items].map(
      (item: { lessonPlanItemId: string }) => item.lessonPlanItemId,
    );
    expect(ids).toEqual([mismatchedId, nullPeriodId]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('rejects every hidden Subject, plan, and Curriculum eligibility state through PostgreSQL', async () => {
    const otherAcademic = await createAcademicContext(schoolId, 'matrix');
    const cases = [
      {
        label: 'foreign School Subject',
        subjectId: crossSchoolFixture.subjectId,
      },
      {
        label: 'inactive Subject',
        subjectId: await createEligibilityMatrixSubject({
          label: 'inactive-subject',
          subjectIsActive: false,
          matchingAllocation: true,
        }),
      },
      {
        label: 'deleted Subject',
        subjectId: await createEligibilityMatrixSubject({
          label: 'deleted-subject',
          subjectDeletedAt: new Date(),
          matchingAllocation: true,
        }),
      },
      {
        label: 'plan for another classroom',
        subjectId: await createEligibilityMatrixSubject({
          label: 'other-classroom-plan',
          planClassroomId: otherClassroomFixture.classroomId,
        }),
      },
      {
        label: 'plan for another Term',
        subjectId: await createEligibilityMatrixSubject({
          label: 'other-term-plan',
          planTermId: otherAcademic.termId,
        }),
      },
      {
        label: 'plan for another academic year',
        subjectId: await createEligibilityMatrixSubject({
          label: 'other-year-plan',
          planAcademicYearId: otherAcademic.academicYearId,
        }),
      },
      {
        label: 'DRAFT plan',
        subjectId: await createEligibilityMatrixSubject({
          label: 'draft-plan',
          planStatus: LessonPlanStatus.DRAFT,
        }),
      },
      {
        label: 'ARCHIVED plan',
        subjectId: await createEligibilityMatrixSubject({
          label: 'archived-plan-matrix',
          planStatus: LessonPlanStatus.ARCHIVED,
        }),
      },
      {
        label: 'deleted plan',
        subjectId: await createEligibilityMatrixSubject({
          label: 'deleted-plan',
          planDeletedAt: new Date(),
        }),
      },
      {
        label: 'DRAFT Curriculum',
        subjectId: await createEligibilityMatrixSubject({
          label: 'draft-curriculum',
          curriculumStatus: CurriculumStatus.DRAFT,
        }),
      },
      {
        label: 'ARCHIVED Curriculum',
        subjectId: await createEligibilityMatrixSubject({
          label: 'archived-curriculum-matrix',
          curriculumStatus: CurriculumStatus.ARCHIVED,
        }),
      },
      {
        label: 'deleted Curriculum',
        subjectId: await createEligibilityMatrixSubject({
          label: 'deleted-curriculum',
          curriculumDeletedAt: new Date(),
        }),
      },
    ];

    for (const matrixCase of cases) {
      const response = await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/student/subjects/${matrixCase.subjectId}/lessons`,
        )
        .set('Authorization', bearer(studentAuth))
        .expect(404);
      expect(response.body?.error?.code).toBe(
        'learning.subject_lessons.not_found',
      );
      expect(response.body?.error?.details).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toContain(matrixCase.subjectId);
    }
    expect(cases.map((matrixCase) => matrixCase.label)).toHaveLength(12);
  });

  it('omits deleted unit, lesson, item, and null-date rows from an otherwise eligible Subject', async () => {
    const omission = await createInvalidItemOmissionFixture();

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/subjects/${omission.subjectId}/lessons`)
      .query({ from: '2026-11-10', to: '2026-11-10' })
      .set('Authorization', bearer(studentAuth))
      .expect(200);

    expect(response.body).toEqual({
      items: [],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
    for (const itemId of omission.itemIds) {
      expect(JSON.stringify(response.body)).not.toContain(itemId);
    }
    expect(omission.itemIds).toHaveLength(4);
  });

  it('orders and cursor-paginates more than 50 rows with no duplicate, skip, or null date', async () => {
    const statuses = Object.values(LessonPlanItemStatus);
    await prisma.lessonPlanItem.createMany({
      data: Array.from({ length: 55 }, (_, index) => ({
        schoolId,
        lessonPlanId: fixture.lessonPlanId,
        curriculumId: fixture.curriculumId,
        unitId: fixture.unitId,
        lessonId: fixture.lessonId,
        plannedDate: new Date(
          index < 30 ? '2026-09-14T00:00:00.000Z' : '2026-09-16T00:00:00.000Z',
        ),
        title: `${marker}-pagination-${index}`,
        status: statuses[index % statuses.length],
        sortOrder: 10,
        createdByUserId: teacherUserId,
      })),
    });
    const created = await prisma.lessonPlanItem.findMany({
      where: {
        lessonPlanId: fixture.lessonPlanId,
        title: { startsWith: `${marker}-pagination-` },
      },
      select: { id: true, title: true, plannedDate: true },
    });
    for (const item of created) cleanup.lessonPlanItemIds.add(item.id);

    const nullDate = await prisma.lessonPlanItem.create({
      data: {
        schoolId,
        lessonPlanId: fixture.lessonPlanId,
        curriculumId: fixture.curriculumId,
        unitId: fixture.unitId,
        lessonId: fixture.lessonId,
        plannedDate: null,
        title: `${marker}-null-date`,
        status: LessonPlanItemStatus.PLANNED,
        sortOrder: 0,
        createdByUserId: teacherUserId,
      },
      select: { id: true },
    });
    cleanup.lessonPlanItemIds.add(nullDate.id);

    const first = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/subjects/${fixture.subjectId}/lessons`)
      .query({ limit: 50 })
      .set('Authorization', bearer(studentAuth))
      .expect(200);
    expect(first.body.items).toHaveLength(50);
    expect(first.body.items[0].lessonPlanItemId).toBe(fixture.lessonPlanItemId);
    expect(first.body.pageInfo).toEqual({
      nextCursor: expect.any(String),
      hasNextPage: true,
    });
    const cursorPayload = JSON.parse(
      Buffer.from(first.body.pageInfo.nextCursor, 'base64url').toString('utf8'),
    ) as {
      plannedDate: string;
      periodIndex: number | null;
      sortOrder: number;
      itemId: string;
    };
    expect(cursorPayload.periodIndex).toBeNull();
    const directContinuation = await prisma.lessonPlanItem.findMany({
      where: {
        lessonPlanId: fixture.lessonPlanId,
        plannedDate: new Date(`${cursorPayload.plannedDate}T00:00:00.000Z`),
        timetableEntryId: null,
        sortOrder: cursorPayload.sortOrder,
        id: { gt: cursorPayload.itemId },
      },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    expect(directContinuation.length).toBeGreaterThan(0);

    const second = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/subjects/${fixture.subjectId}/lessons`)
      .query({ limit: 50, cursor: first.body.pageInfo.nextCursor })
      .set('Authorization', bearer(studentAuth))
      .expect(200);
    const replay = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/subjects/${fixture.subjectId}/lessons`)
      .query({ limit: 50, cursor: first.body.pageInfo.nextCursor })
      .set('Authorization', bearer(studentAuth))
      .expect(200);
    expect(replay.body).toEqual(second.body);
    expect(second.body.pageInfo).toEqual({
      nextCursor: null,
      hasNextPage: false,
    });

    const ids = [...first.body.items, ...second.body.items].map(
      (item: { lessonPlanItemId: string }) => item.lessonPlanItemId,
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      created
        .filter((item) => !ids.includes(item.id))
        .map((item) => ({ title: item.title, plannedDate: item.plannedDate })),
    ).toEqual([]);
    expect(ids).not.toContain(nullDate.id);

    const mismatchedCursor = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/subjects/${fixture.subjectId}/lessons`)
      .query({
        from: '2026-09-14',
        cursor: first.body.pageInfo.nextCursor,
      })
      .set('Authorization', bearer(studentAuth))
      .expect(400);
    expect(mismatchedCursor.body?.error?.code).toBe('validation.failed');
    expect(mismatchedCursor.body?.error?.details).toEqual({ field: 'cursor' });
  });
  /* eslint-enable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

  async function findSystemRole(key: string) {
    const role = await prisma.role.findFirst({
      where: { key, schoolId: null, isSystem: true },
      select: { id: true },
    });
    if (!role) throw new Error(`${key} system role not found - run seed.`);
    return role;
  }

  async function createOrganization(label: string): Promise<string> {
    const organization = await prisma.organization.create({
      data: {
        slug: `${marker}-${label}-org`,
        name: `${marker} ${label} Org`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    cleanup.organizationIds.add(organization.id);
    return organization.id;
  }

  async function createSchool(
    organizationIdForSchool: string,
    label: string,
  ): Promise<string> {
    const school = await prisma.school.create({
      data: {
        organizationId: organizationIdForSchool,
        slug: `${marker}-${label}-school`,
        name: `${marker} ${label} School`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    cleanup.schoolIds.add(school.id);
    return school.id;
  }

  async function createUserWithMembership(params: {
    email: string;
    firstName: string;
    lastName: string;
    userType: UserType;
    roleId: string;
    organizationId: string;
    schoolId: string;
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
    cleanup.userIds.add(user.id);

    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: params.organizationId,
        schoolId: params.schoolId,
        roleId: params.roleId,
        userType: params.userType,
        status: MembershipStatus.ACTIVE,
      },
    });

    return user.id;
  }

  async function createAcademicContext(
    schoolIdForContext: string,
    contextLabel = 'primary',
  ): Promise<AcademicContext> {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId: schoolIdForContext,
        nameAr: `${marker}-${schoolIdForContext}-${contextLabel}-year-ar`,
        nameEn: `${marker}-${schoolIdForContext}-${contextLabel}-year`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: contextLabel === 'primary',
      },
      select: { id: true },
    });
    cleanup.academicYearIds.add(academicYear.id);

    const term = await prisma.term.create({
      data: {
        schoolId: schoolIdForContext,
        academicYearId: academicYear.id,
        nameAr: `${marker}-${schoolIdForContext}-${contextLabel}-term-ar`,
        nameEn: `${marker}-${schoolIdForContext}-${contextLabel}-term`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: contextLabel === 'primary',
      },
      select: { id: true },
    });
    cleanup.termIds.add(term.id);

    return {
      academicYearId: academicYear.id,
      termId: term.id,
    };
  }

  async function createStudentEnrollment(params: {
    organizationId: string;
    schoolId: string;
    userId: string;
    academicYearId: string;
    termId: string;
    classroomId: string;
    marker: string;
  }): Promise<void> {
    const student = await prisma.student.create({
      data: {
        organizationId: params.organizationId,
        schoolId: params.schoolId,
        userId: params.userId,
        firstName: `${marker}-${params.marker}-student`,
        lastName: 'Learner',
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    cleanup.studentIds.add(student.id);

    const enrollment = await prisma.enrollment.create({
      data: {
        schoolId: params.schoolId,
        studentId: student.id,
        academicYearId: params.academicYearId,
        termId: params.termId,
        classroomId: params.classroomId,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      select: { id: true },
    });
    cleanup.enrollmentIds.add(enrollment.id);
  }

  async function createLessonFixture(params: {
    organizationId: string;
    schoolId: string;
    academicYearId: string;
    termId: string;
    teacherUserId: string;
    marker: string;
    plannedDate: string;
    deletedContent?: boolean;
    itemNotes?: string;
  }): Promise<LessonFixture> {
    const stage = await prisma.stage.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${marker}-${params.marker}-stage-ar`,
        nameEn: `${marker}-${params.marker}-stage`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    cleanup.stageIds.add(stage.id);

    const grade = await prisma.grade.create({
      data: {
        schoolId: params.schoolId,
        stageId: stage.id,
        nameAr: `${marker}-${params.marker}-grade-ar`,
        nameEn: `${marker}-${params.marker}-grade`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    cleanup.gradeIds.add(grade.id);

    const section = await prisma.section.create({
      data: {
        schoolId: params.schoolId,
        gradeId: grade.id,
        nameAr: `${marker}-${params.marker}-section-ar`,
        nameEn: `${marker}-${params.marker}-section`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    cleanup.sectionIds.add(section.id);

    const room = await prisma.room.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${marker}-${params.marker}-room-ar`,
        nameEn: `${marker}-${params.marker}-room`,
        isActive: true,
      },
      select: { id: true },
    });
    cleanup.roomIds.add(room.id);

    const classroom = await prisma.classroom.create({
      data: {
        schoolId: params.schoolId,
        sectionId: section.id,
        roomId: room.id,
        nameAr: `${marker}-${params.marker}-classroom-ar`,
        nameEn: `${marker}-${params.marker}-classroom`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    cleanup.classroomIds.add(classroom.id);

    const subject = await prisma.subject.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${marker}-${params.marker}-subject-ar`,
        nameEn: `${marker}-${params.marker}-subject`,
        code: `${suffix}-${params.marker}`.slice(0, 30).toUpperCase(),
        color: '#3366ff',
        isActive: true,
      },
      select: { id: true },
    });
    cleanup.subjectIds.add(subject.id);

    const allocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId: params.schoolId,
        teacherUserId: params.teacherUserId,
        subjectId: subject.id,
        classroomId: classroom.id,
        termId: params.termId,
      },
      select: { id: true },
    });
    cleanup.allocationIds.add(allocation.id);

    const config = await prisma.timetableConfig.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        termId: params.termId,
        name: `${marker}-${params.marker}-config`,
        weekStartDay: 1,
        activeDays: [1, 2, 3, 4, 5],
        scopeType: TimetableScopeType.CLASSROOM,
        scopeKey: classroom.id,
        gradeId: grade.id,
        sectionId: section.id,
        classroomId: classroom.id,
        status: TimetableConfigStatus.ACTIVE,
      },
      select: { id: true },
    });
    cleanup.timetableConfigIds.add(config.id);

    const period = await prisma.timetablePeriod.create({
      data: {
        schoolId: params.schoolId,
        timetableConfigId: config.id,
        periodIndex: 1,
        label: 'Period 1',
        startTime: '08:00',
        endTime: '08:45',
        type: TimetablePeriodType.CLASS,
        isInstructional: true,
      },
      select: { id: true },
    });
    cleanup.timetablePeriodIds.add(period.id);

    const entry = await prisma.timetableEntry.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        termId: params.termId,
        timetableConfigId: config.id,
        periodId: period.id,
        dayOfWeek: 1,
        gradeId: grade.id,
        sectionId: section.id,
        classroomId: classroom.id,
        subjectId: subject.id,
        teacherUserId: params.teacherUserId,
        teacherSubjectAllocationId: allocation.id,
        roomId: room.id,
        status: TimetableEntryStatus.ACTIVE,
      },
      select: { id: true },
    });
    cleanup.timetableEntryIds.add(entry.id);

    const publication = await prisma.timetablePublication.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        termId: params.termId,
        timetableConfigId: config.id,
        status: TimetablePublicationStatus.PUBLISHED,
        publishedAt: new Date('2026-09-01T00:00:00.000Z'),
        publishedByUserId: params.teacherUserId,
      },
      select: { id: true },
    });
    cleanup.timetablePublicationIds.add(publication.id);

    const curriculum = await prisma.curriculum.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        termId: params.termId,
        gradeId: grade.id,
        subjectId: subject.id,
        title: `${marker}-${params.marker}-curriculum`,
        status: CurriculumStatus.ACTIVE,
        createdByUserId: params.teacherUserId,
      },
      select: { id: true },
    });
    cleanup.curriculumIds.add(curriculum.id);

    const unit = await prisma.curriculumUnit.create({
      data: {
        schoolId: params.schoolId,
        curriculumId: curriculum.id,
        title: `${marker}-${params.marker}-unit`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    cleanup.curriculumUnitIds.add(unit.id);

    const lesson = await prisma.curriculumLesson.create({
      data: {
        schoolId: params.schoolId,
        curriculumId: curriculum.id,
        unitId: unit.id,
        title: `${marker}-${params.marker}-lesson`,
        objectives: ['objective'],
        sortOrder: 1,
      },
      select: { id: true },
    });
    cleanup.curriculumLessonIds.add(lesson.id);

    const fileContent = await prisma.lessonContentItem.create({
      data: {
        schoolId: params.schoolId,
        curriculumId: curriculum.id,
        unitId: unit.id,
        lessonId: lesson.id,
        type: LessonContentItemType.TEXT,
        title: `${marker}-${params.marker}-text`,
        bodyText: 'Student-visible content',
        sortOrder: 1,
        isRequired: true,
        estimatedMinutes: 10,
        createdByUserId: params.teacherUserId,
        publicationStatus: LessonContentPublicationStatus.PUBLISHED,
        publishedAt: new Date(),
        publishedByUserId: params.teacherUserId,
      },
      select: { id: true },
    });

    const file = await prisma.file.create({
      data: {
        organizationId: params.organizationId,
        schoolId: params.schoolId,
        uploaderId: params.teacherUserId,
        bucket: `${marker}-${params.marker}-bucket`,
        objectKey: `${marker}-${params.marker}-object-key`,
        originalName: `${marker}-${params.marker}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: BigInt(2048),
      },
      select: { id: true },
    });
    cleanup.fileIds.add(file.id);

    await prisma.lessonContentItem.create({
      data: {
        schoolId: params.schoolId,
        curriculumId: curriculum.id,
        unitId: unit.id,
        lessonId: lesson.id,
        type: LessonContentItemType.FILE,
        title: `${marker}-${params.marker}-file`,
        fileId: file.id,
        sortOrder: 2,
        createdByUserId: params.teacherUserId,
        publicationStatus: LessonContentPublicationStatus.PUBLISHED,
        publishedAt: new Date(),
        publishedByUserId: params.teacherUserId,
      },
    });

    if (params.deletedContent) {
      const deletedAt = new Date();
      await prisma.lessonContentItem.create({
        data: {
          schoolId: params.schoolId,
          curriculumId: curriculum.id,
          unitId: unit.id,
          lessonId: lesson.id,
          type: LessonContentItemType.TEXT,
          title: `${marker}-${params.marker}-deleted`,
          bodyText: 'Should stay hidden',
          sortOrder: 3,
          createdByUserId: params.teacherUserId,
          publicationStatus: LessonContentPublicationStatus.DRAFT,
          publishedAt: null,
          publishedByUserId: null,
          archivedAt: null,
          archivedByUserId: null,
          deletedAt,
        },
      });
    }

    const lessonPlan = await prisma.lessonPlan.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        termId: params.termId,
        teacherSubjectAllocationId: allocation.id,
        teacherUserId: params.teacherUserId,
        classroomId: classroom.id,
        subjectId: subject.id,
        curriculumId: curriculum.id,
        title: `${marker}-${params.marker}-plan`,
        status: LessonPlanStatus.ACTIVE,
        weekStartDate: new Date('2026-09-14T00:00:00.000Z'),
        weekEndDate: new Date('2026-09-20T00:00:00.000Z'),
        createdByUserId: params.teacherUserId,
      },
      select: { id: true },
    });
    cleanup.lessonPlanIds.add(lessonPlan.id);

    const item = await prisma.lessonPlanItem.create({
      data: {
        schoolId: params.schoolId,
        lessonPlanId: lessonPlan.id,
        curriculumId: curriculum.id,
        unitId: unit.id,
        lessonId: lesson.id,
        timetableEntryId: entry.id,
        plannedDate: new Date(`${params.plannedDate}T00:00:00.000Z`),
        dayOfWeek: 1,
        periodId: period.id,
        periodLabel: 'Period 1',
        title: `${marker}-${params.marker}-item`,
        notes: params.itemNotes ?? null,
        status: LessonPlanItemStatus.PLANNED,
        sortOrder: 1,
        createdByUserId: params.teacherUserId,
      },
      select: { id: true },
    });
    cleanup.lessonPlanItemIds.add(item.id);

    return {
      allocationId: allocation.id,
      classroomId: classroom.id,
      subjectId: subject.id,
      curriculumId: curriculum.id,
      unitId: unit.id,
      lessonId: lesson.id,
      lessonPlanId: lessonPlan.id,
      lessonPlanItemId: item.id,
      timetableEntryId: entry.id,
      fileContentItemId: fileContent.id,
    };
  }

  async function createPlaybackMedia(source: LessonFixture): Promise<{
    contentItemId: string;
    fileId: string;
    uploadSessionId: string;
  }> {
    const finalBucket = process.env.STORAGE_BUCKET;
    if (!finalBucket) {
      throw new Error('STORAGE_BUCKET is required for playback E2E tests');
    }
    const file = await prisma.file.create({
      data: {
        organizationId,
        schoolId,
        uploaderId: teacherUserId,
        bucket: finalBucket,
        objectKey: `${marker}/playback/final.mp4`,
        originalName: 'student-playback.mp4',
        mimeType: 'video/mp4',
        sizeBytes: BigInt(4096),
        checksumSha256: 'a'.repeat(64),
        visibility: FileVisibility.PRIVATE,
      },
      select: { id: true, bucket: true, objectKey: true },
    });
    cleanup.fileIds.add(file.id);
    const createdAt = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000);
    const latestUploadUrlExpiresAt = new Date(
      createdAt.getTime() + 60 * 60 * 1000,
    );
    const completedAt = new Date(createdAt.getTime() + 5 * 60 * 1000);
    const session = await prisma.fileUploadSession.create({
      data: {
        organizationId,
        schoolId,
        createdByUserId: teacherUserId,
        clientRequestId: randomUUID(),
        purpose: FileUploadPurpose.LESSON_CONTENT,
        originalName: 'student-playback.mp4',
        expectedMimeType: 'video/mp4',
        expectedSizeBytes: BigInt(4096),
        stagingBucket: `${marker}-playback-staging`,
        stagingObjectKey: `${marker}/playback/staging.mp4`,
        finalBucket: file.bucket,
        finalObjectKey: file.objectKey,
        status: FileUploadSessionStatus.READY,
        createdAt,
        expiresAt: new Date(createdAt.getTime() + 2 * 60 * 60 * 1000),
        latestUploadUrlExpiresAt,
        completedAt,
        stagingCleanupEligibleAt: latestUploadUrlExpiresAt,
        finalCleanupEligibleAt: new Date(
          completedAt.getTime() + 7 * 24 * 60 * 60 * 1000,
        ),
        verifiedMimeType: 'video/mp4',
        actualSizeBytes: BigInt(4096),
        checksumSha256: 'a'.repeat(64),
        durationSeconds: 10,
        width: 640,
        height: 360,
        verifiedAt: completedAt,
        verificationVersion: 'ffprobe-5.1.9-debian12-learning-media-v1',
        fileId: file.id,
      },
      select: { id: true },
    });
    cleanup.fileUploadSessionIds.add(session.id);
    const content = await prisma.lessonContentItem.create({
      data: {
        schoolId,
        curriculumId: source.curriculumId,
        unitId: source.unitId,
        lessonId: source.lessonId,
        type: LessonContentItemType.FILE,
        title: `${marker}-playback-video`,
        fileId: file.id,
        sortOrder: 99,
        createdByUserId: teacherUserId,
      },
      select: { id: true },
    });
    return {
      contentItemId: content.id,
      fileId: file.id,
      uploadSessionId: session.id,
    };
  }

  function signedExpiry(url: URL): Date {
    const signedAt = url.searchParams.get('X-Amz-Date');
    const expires = Number(url.searchParams.get('X-Amz-Expires'));
    if (!signedAt || !Number.isSafeInteger(expires)) {
      throw new Error('Expected signed playback expiry fields');
    }
    const signedAtMs = Date.UTC(
      Number(signedAt.slice(0, 4)),
      Number(signedAt.slice(4, 6)) - 1,
      Number(signedAt.slice(6, 8)),
      Number(signedAt.slice(9, 11)),
      Number(signedAt.slice(11, 13)),
      Number(signedAt.slice(13, 15)),
    );
    return new Date(signedAtMs + expires * 1000);
  }

  async function createExistingScopeLessonPlanItem(params: {
    source: LessonFixture;
    schoolId: string;
    academicYearId: string;
    termId: string;
    teacherUserId: string;
    marker: string;
    planStatus?: LessonPlanStatus;
    curriculumStatus?: CurriculumStatus;
  }): Promise<string> {
    const classroom = await prisma.classroom.findUniqueOrThrow({
      where: {
        id_schoolId: {
          id: params.source.classroomId,
          schoolId: params.schoolId,
        },
      },
      select: { section: { select: { gradeId: true } } },
    });
    const classroomGradeId = classroom.section.gradeId;
    const subject = await prisma.subject.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${marker}-${params.marker}-subject-ar`,
        nameEn: `${marker}-${params.marker}-subject`,
        code: `${suffix}-${params.marker}`.slice(0, 30).toUpperCase(),
        color: '#6633ff',
        isActive: true,
      },
      select: { id: true },
    });
    cleanup.subjectIds.add(subject.id);

    const allocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId: params.schoolId,
        teacherUserId: params.teacherUserId,
        subjectId: subject.id,
        classroomId: params.source.classroomId,
        termId: params.termId,
      },
      select: { id: true },
    });
    cleanup.allocationIds.add(allocation.id);

    const curriculum = await prisma.curriculum.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        termId: params.termId,
        gradeId: classroomGradeId,
        subjectId: subject.id,
        title: `${marker}-${params.marker}-curriculum`,
        status: params.curriculumStatus ?? CurriculumStatus.ACTIVE,
        createdByUserId: params.teacherUserId,
      },
      select: { id: true },
    });
    cleanup.curriculumIds.add(curriculum.id);

    const unit = await prisma.curriculumUnit.create({
      data: {
        schoolId: params.schoolId,
        curriculumId: curriculum.id,
        title: `${marker}-${params.marker}-unit`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    cleanup.curriculumUnitIds.add(unit.id);

    const lesson = await prisma.curriculumLesson.create({
      data: {
        schoolId: params.schoolId,
        curriculumId: curriculum.id,
        unitId: unit.id,
        title: `${marker}-${params.marker}-lesson`,
        objectives: ['objective'],
        sortOrder: 1,
      },
      select: { id: true },
    });
    cleanup.curriculumLessonIds.add(lesson.id);

    await prisma.lessonContentItem.create({
      data: {
        schoolId: params.schoolId,
        curriculumId: curriculum.id,
        unitId: unit.id,
        lessonId: lesson.id,
        type: LessonContentItemType.TEXT,
        title: `${marker}-${params.marker}-text`,
        bodyText: `${params.marker} hidden`,
        sortOrder: 1,
        createdByUserId: params.teacherUserId,
      },
    });

    const plan = await prisma.lessonPlan.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        termId: params.termId,
        teacherSubjectAllocationId: allocation.id,
        teacherUserId: params.teacherUserId,
        classroomId: params.source.classroomId,
        subjectId: subject.id,
        curriculumId: curriculum.id,
        title: `${marker}-${params.marker}-plan`,
        status: params.planStatus ?? LessonPlanStatus.ACTIVE,
        weekStartDate: new Date('2026-09-14T00:00:00.000Z'),
        weekEndDate: new Date('2026-09-20T00:00:00.000Z'),
        createdByUserId: params.teacherUserId,
      },
      select: { id: true },
    });
    cleanup.lessonPlanIds.add(plan.id);

    const item = await prisma.lessonPlanItem.create({
      data: {
        schoolId: params.schoolId,
        lessonPlanId: plan.id,
        curriculumId: curriculum.id,
        unitId: unit.id,
        lessonId: lesson.id,
        timetableEntryId: null,
        plannedDate: new Date('2026-09-14T00:00:00.000Z'),
        dayOfWeek: 1,
        title: `${marker}-${params.marker}-item`,
        status: LessonPlanItemStatus.PLANNED,
        sortOrder: 2,
        createdByUserId: params.teacherUserId,
      },
      select: { id: true },
    });
    cleanup.lessonPlanItemIds.add(item.id);
    return item.id;
  }

  function tupleItemData(params: {
    id: string;
    title: string;
    plannedDate: string;
    timetableEntryId: string | null;
    sortOrder: number;
  }): Prisma.LessonPlanItemCreateManyInput {
    return {
      id: params.id,
      schoolId,
      lessonPlanId: fixture.lessonPlanId,
      curriculumId: fixture.curriculumId,
      unitId: fixture.unitId,
      lessonId: fixture.lessonId,
      timetableEntryId: params.timetableEntryId,
      plannedDate: new Date(`${params.plannedDate}T00:00:00.000Z`),
      title: params.title,
      status: LessonPlanItemStatus.PLANNED,
      sortOrder: params.sortOrder,
      createdByUserId: teacherUserId,
    };
  }

  async function createAdditionalTimetableEntry(params: {
    sourceEntryId: string;
    periodIndex: number;
    label: string;
  }): Promise<string> {
    const source = await prisma.timetableEntry.findUniqueOrThrow({
      where: { id: params.sourceEntryId },
      select: {
        schoolId: true,
        academicYearId: true,
        termId: true,
        timetableConfigId: true,
        dayOfWeek: true,
        gradeId: true,
        sectionId: true,
        classroomId: true,
        subjectId: true,
        teacherUserId: true,
        teacherSubjectAllocationId: true,
        roomId: true,
      },
    });
    const period = await prisma.timetablePeriod.create({
      data: {
        schoolId: source.schoolId,
        timetableConfigId: source.timetableConfigId,
        periodIndex: params.periodIndex,
        label: params.label,
        startTime: '09:00',
        endTime: '09:45',
        type: TimetablePeriodType.CLASS,
        isInstructional: true,
      },
      select: { id: true },
    });
    cleanup.timetablePeriodIds.add(period.id);
    const entry = await prisma.timetableEntry.create({
      data: {
        ...source,
        periodId: period.id,
        status: TimetableEntryStatus.ACTIVE,
      },
      select: { id: true },
    });
    cleanup.timetableEntryIds.add(entry.id);
    return entry.id;
  }

  async function createEligibilityMatrixSubject(params: {
    label: string;
    subjectIsActive?: boolean;
    subjectDeletedAt?: Date;
    matchingAllocation?: boolean;
    planClassroomId?: string;
    planAcademicYearId?: string;
    planTermId?: string;
    planStatus?: LessonPlanStatus;
    planDeletedAt?: Date;
    curriculumStatus?: CurriculumStatus;
    curriculumDeletedAt?: Date;
  }): Promise<string> {
    const classroom = await prisma.classroom.findUniqueOrThrow({
      where: { id: fixture.classroomId },
      select: { section: { select: { gradeId: true } } },
    });
    const subject = await prisma.subject.create({
      data: {
        schoolId,
        nameAr: `${marker}-${params.label}-subject-ar`,
        nameEn: `${marker}-${params.label}-subject`,
        code: `${suffix}-T-${params.label}`.slice(0, 30).toUpperCase(),
        isActive: params.subjectIsActive ?? true,
        deletedAt: params.subjectDeletedAt,
      },
      select: { id: true },
    });
    cleanup.subjectIds.add(subject.id);

    let allocationSubjectId = subject.id;
    if (!params.matchingAllocation) {
      const placeholder = await prisma.subject.create({
        data: {
          schoolId,
          nameAr: `${marker}-${params.label}-placeholder-ar`,
          nameEn: `${marker}-${params.label}-placeholder`,
          code: `${suffix}-P-${params.label}`.slice(0, 30).toUpperCase(),
          isActive: true,
        },
        select: { id: true },
      });
      cleanup.subjectIds.add(placeholder.id);
      allocationSubjectId = placeholder.id;
    }

    const allocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId,
        teacherUserId,
        subjectId: allocationSubjectId,
        classroomId: fixture.classroomId,
        termId: academic.termId,
      },
      select: { id: true },
    });
    cleanup.allocationIds.add(allocation.id);

    const planAcademicYearId =
      params.planAcademicYearId ?? academic.academicYearId;
    const planTermId = params.planTermId ?? academic.termId;
    const curriculum = await prisma.curriculum.create({
      data: {
        schoolId,
        academicYearId: planAcademicYearId,
        termId: planTermId,
        gradeId: classroom.section.gradeId,
        subjectId: subject.id,
        title: `${marker}-${params.label}-curriculum`,
        status: params.curriculumStatus ?? CurriculumStatus.ACTIVE,
        deletedAt: params.curriculumDeletedAt,
        createdByUserId: teacherUserId,
      },
      select: { id: true },
    });
    cleanup.curriculumIds.add(curriculum.id);

    const plan = await prisma.lessonPlan.create({
      data: {
        schoolId,
        academicYearId: planAcademicYearId,
        termId: planTermId,
        teacherSubjectAllocationId: allocation.id,
        teacherUserId,
        classroomId: params.planClassroomId ?? fixture.classroomId,
        subjectId: subject.id,
        curriculumId: curriculum.id,
        title: `${marker}-${params.label}-plan`,
        status: params.planStatus ?? LessonPlanStatus.ACTIVE,
        weekStartDate: new Date('2026-10-05T00:00:00.000Z'),
        weekEndDate: new Date('2026-10-11T00:00:00.000Z'),
        deletedAt: params.planDeletedAt,
        createdByUserId: teacherUserId,
      },
      select: { id: true },
    });
    cleanup.lessonPlanIds.add(plan.id);
    return subject.id;
  }

  async function createInvalidItemOmissionFixture(): Promise<{
    subjectId: string;
    itemIds: string[];
  }> {
    const classroom = await prisma.classroom.findUniqueOrThrow({
      where: { id: fixture.classroomId },
      select: { section: { select: { gradeId: true } } },
    });
    const subject = await prisma.subject.create({
      data: {
        schoolId,
        nameAr: `${marker}-omission-subject-ar`,
        nameEn: `${marker}-omission-subject`,
        code: `${suffix}-OMISSION`.slice(0, 30).toUpperCase(),
        isActive: true,
      },
      select: { id: true },
    });
    cleanup.subjectIds.add(subject.id);
    const allocationSubject = await prisma.subject.create({
      data: {
        schoolId,
        nameAr: `${marker}-omission-allocation-subject-ar`,
        nameEn: `${marker}-omission-allocation-subject`,
        code: `${suffix}-OMISSION-ALLOCATION`.slice(0, 30).toUpperCase(),
        isActive: true,
      },
      select: { id: true },
    });
    cleanup.subjectIds.add(allocationSubject.id);
    const allocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId,
        teacherUserId,
        subjectId: allocationSubject.id,
        classroomId: fixture.classroomId,
        termId: academic.termId,
      },
      select: { id: true },
    });
    cleanup.allocationIds.add(allocation.id);
    const curriculum = await prisma.curriculum.create({
      data: {
        schoolId,
        academicYearId: academic.academicYearId,
        termId: academic.termId,
        gradeId: classroom.section.gradeId,
        subjectId: subject.id,
        title: `${marker}-omission-curriculum`,
        status: CurriculumStatus.ACTIVE,
        createdByUserId: teacherUserId,
      },
      select: { id: true },
    });
    cleanup.curriculumIds.add(curriculum.id);
    const [deletedUnit, activeUnit] = await Promise.all([
      prisma.curriculumUnit.create({
        data: {
          schoolId,
          curriculumId: curriculum.id,
          title: `${marker}-omission-deleted-unit`,
          sortOrder: 1,
          deletedAt: new Date(),
        },
        select: { id: true },
      }),
      prisma.curriculumUnit.create({
        data: {
          schoolId,
          curriculumId: curriculum.id,
          title: `${marker}-omission-active-unit`,
          sortOrder: 2,
        },
        select: { id: true },
      }),
    ]);
    cleanup.curriculumUnitIds.add(deletedUnit.id);
    cleanup.curriculumUnitIds.add(activeUnit.id);
    const [deletedUnitLesson, deletedLesson, activeLesson] = await Promise.all([
      prisma.curriculumLesson.create({
        data: {
          schoolId,
          curriculumId: curriculum.id,
          unitId: deletedUnit.id,
          title: `${marker}-omission-deleted-unit-lesson`,
          sortOrder: 1,
        },
        select: { id: true },
      }),
      prisma.curriculumLesson.create({
        data: {
          schoolId,
          curriculumId: curriculum.id,
          unitId: activeUnit.id,
          title: `${marker}-omission-deleted-lesson`,
          sortOrder: 2,
          deletedAt: new Date(),
        },
        select: { id: true },
      }),
      prisma.curriculumLesson.create({
        data: {
          schoolId,
          curriculumId: curriculum.id,
          unitId: activeUnit.id,
          title: `${marker}-omission-active-lesson`,
          sortOrder: 3,
        },
        select: { id: true },
      }),
    ]);
    for (const lesson of [deletedUnitLesson, deletedLesson, activeLesson]) {
      cleanup.curriculumLessonIds.add(lesson.id);
    }
    const plan = await prisma.lessonPlan.create({
      data: {
        schoolId,
        academicYearId: academic.academicYearId,
        termId: academic.termId,
        teacherSubjectAllocationId: allocation.id,
        teacherUserId,
        classroomId: fixture.classroomId,
        subjectId: subject.id,
        curriculumId: curriculum.id,
        title: `${marker}-omission-plan`,
        status: LessonPlanStatus.ACTIVE,
        weekStartDate: new Date('2026-11-09T00:00:00.000Z'),
        weekEndDate: new Date('2026-11-15T00:00:00.000Z'),
        createdByUserId: teacherUserId,
      },
      select: { id: true },
    });
    cleanup.lessonPlanIds.add(plan.id);
    const itemIds = [
      '13000000-0000-4000-8000-000000000001',
      '13000000-0000-4000-8000-000000000002',
      '13000000-0000-4000-8000-000000000003',
      '13000000-0000-4000-8000-000000000004',
    ];
    const common = {
      schoolId,
      lessonPlanId: plan.id,
      curriculumId: curriculum.id,
      status: LessonPlanItemStatus.PLANNED,
      createdByUserId: teacherUserId,
    };
    await prisma.lessonPlanItem.createMany({
      data: [
        {
          ...common,
          id: itemIds[0],
          unitId: deletedUnit.id,
          lessonId: deletedUnitLesson.id,
          title: `${marker}-omission-deleted-unit-item`,
          plannedDate: new Date('2026-11-10T00:00:00.000Z'),
          sortOrder: 1,
        },
        {
          ...common,
          id: itemIds[1],
          unitId: activeUnit.id,
          lessonId: deletedLesson.id,
          title: `${marker}-omission-deleted-lesson-item`,
          plannedDate: new Date('2026-11-10T00:00:00.000Z'),
          sortOrder: 2,
        },
        {
          ...common,
          id: itemIds[2],
          unitId: activeUnit.id,
          lessonId: activeLesson.id,
          title: `${marker}-omission-deleted-item`,
          plannedDate: new Date('2026-11-10T00:00:00.000Z'),
          sortOrder: 3,
          deletedAt: new Date(),
        },
        {
          ...common,
          id: itemIds[3],
          unitId: activeUnit.id,
          lessonId: activeLesson.id,
          title: `${marker}-omission-null-date-item`,
          plannedDate: null,
          sortOrder: 4,
        },
      ],
    });
    for (const id of itemIds) cleanup.lessonPlanItemIds.add(id);
    return { subjectId: subject.id, itemIds };
  }

  function decodeOpaqueCursor(cursor: unknown): Record<string, unknown> {
    if (typeof cursor !== 'string') {
      throw new Error('Expected an opaque cursor string');
    }
    return JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
  }

  async function login(email: string): Promise<AuthTokens> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    return { accessToken: response.body.accessToken };
  }

  function bearer(tokens: AuthTokens): string {
    return `Bearer ${tokens.accessToken}`;
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
    await prisma.session.deleteMany({
      where: { userId: { in: [...cleanup.userIds] } },
    });
    await prisma.lessonPlanItem.deleteMany({
      where: { id: { in: [...cleanup.lessonPlanItemIds] } },
    });
    await prisma.lessonPlan.deleteMany({
      where: { id: { in: [...cleanup.lessonPlanIds] } },
    });
    await prisma.lessonContentItem.deleteMany({
      where: { schoolId: { in: [...cleanup.schoolIds] } },
    });
    await prisma.curriculumLesson.deleteMany({
      where: { id: { in: [...cleanup.curriculumLessonIds] } },
    });
    await prisma.curriculumUnit.deleteMany({
      where: { id: { in: [...cleanup.curriculumUnitIds] } },
    });
    await prisma.curriculum.deleteMany({
      where: { id: { in: [...cleanup.curriculumIds] } },
    });
    await prisma.timetablePublication.deleteMany({
      where: { id: { in: [...cleanup.timetablePublicationIds] } },
    });
    await prisma.timetableEntry.deleteMany({
      where: { id: { in: [...cleanup.timetableEntryIds] } },
    });
    await prisma.timetablePeriod.deleteMany({
      where: { id: { in: [...cleanup.timetablePeriodIds] } },
    });
    await prisma.timetableConfig.deleteMany({
      where: { id: { in: [...cleanup.timetableConfigIds] } },
    });
    await prisma.fileUploadSession.deleteMany({
      where: { id: { in: [...cleanup.fileUploadSessionIds] } },
    });
    await prisma.file.deleteMany({
      where: { id: { in: [...cleanup.fileIds] } },
    });
    await prisma.teacherSubjectAllocation.deleteMany({
      where: { id: { in: [...cleanup.allocationIds] } },
    });
    await prisma.subject.deleteMany({
      where: { id: { in: [...cleanup.subjectIds] } },
    });
    await prisma.enrollment.deleteMany({
      where: { id: { in: [...cleanup.enrollmentIds] } },
    });
    await prisma.student.deleteMany({
      where: { id: { in: [...cleanup.studentIds] } },
    });
    await prisma.classroom.deleteMany({
      where: { id: { in: [...cleanup.classroomIds] } },
    });
    await prisma.room.deleteMany({
      where: { id: { in: [...cleanup.roomIds] } },
    });
    await prisma.section.deleteMany({
      where: { id: { in: [...cleanup.sectionIds] } },
    });
    await prisma.grade.deleteMany({
      where: { id: { in: [...cleanup.gradeIds] } },
    });
    await prisma.stage.deleteMany({
      where: { id: { in: [...cleanup.stageIds] } },
    });
    await prisma.term.deleteMany({
      where: { id: { in: [...cleanup.termIds] } },
    });
    await prisma.academicYear.deleteMany({
      where: { id: { in: [...cleanup.academicYearIds] } },
    });
    await prisma.membership.deleteMany({
      where: { userId: { in: [...cleanup.userIds] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [...cleanup.userIds] } },
    });
    await prisma.school.deleteMany({
      where: { id: { in: [...cleanup.schoolIds] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [...cleanup.organizationIds] } },
    });
  }
});

async function ensurePlaybackBucket(): Promise<void> {
  const bucket = process.env.STORAGE_BUCKET;
  if (!bucket) {
    throw new Error('STORAGE_BUCKET is required for playback E2E tests');
  }
  await new MinioAdapter(new ConfigService(process.env)).ensureBucketExists(
    bucket,
  );
}

function createCleanupState() {
  return {
    organizationIds: new Set<string>(),
    schoolIds: new Set<string>(),
    userIds: new Set<string>(),
    academicYearIds: new Set<string>(),
    termIds: new Set<string>(),
    stageIds: new Set<string>(),
    gradeIds: new Set<string>(),
    sectionIds: new Set<string>(),
    roomIds: new Set<string>(),
    classroomIds: new Set<string>(),
    subjectIds: new Set<string>(),
    allocationIds: new Set<string>(),
    timetableConfigIds: new Set<string>(),
    timetablePeriodIds: new Set<string>(),
    timetableEntryIds: new Set<string>(),
    timetablePublicationIds: new Set<string>(),
    curriculumIds: new Set<string>(),
    curriculumUnitIds: new Set<string>(),
    curriculumLessonIds: new Set<string>(),
    lessonPlanIds: new Set<string>(),
    lessonPlanItemIds: new Set<string>(),
    fileUploadSessionIds: new Set<string>(),
    fileIds: new Set<string>(),
    studentIds: new Set<string>(),
    enrollmentIds: new Set<string>(),
  };
}
