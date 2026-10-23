import { randomUUID } from 'node:crypto';
import { get as httpGet, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Transform } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  HomeworkAssignmentMode,
  HomeworkAssignmentStatus,
  HomeworkQuestionType,
  HomeworkTargetMode,
  MembershipStatus,
  OrganizationStatus,
  Prisma,
  PrismaClient,
  SchoolStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';
import { StorageService } from '../../src/infrastructure/storage/storage.service';
import { HomeworkRepository } from '../../src/modules/homework/infrastructure/homework.repository';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'Sprint14E123!';
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
};

type ClassroomPlacement = {
  classroomId: string;
  subjectId: string;
  allocationId: string;
};

type SideEffectCounts = {
  gradeAssessments: number;
  gradeItems: number;
  gradeSubmissions: number;
  gradeSubmissionAnswers: number;
  communicationNotifications: number;
  xpLedgerEntries: number;
  rewardRedemptions: number;
  files: number;
  attachments: number;
};

jest.setTimeout(180000);

describe('Sprint 14E Homework Submissions final closeout (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationId = '';
  let schoolId = '';
  let teacherUserId = '';
  let studentUserId = '';
  let parentUserId = '';
  let adminEmail = '';
  let teacherEmail = '';
  let studentEmail = '';
  let parentEmail = '';
  let academic: AcademicBase;
  let placement: ClassroomPlacement;
  let studentId = '';
  let enrollmentId = '';
  let guardianId = '';
  let reviewedHomeworkId = '';
  let reviewedTargetId = '';
  let lateHomeworkId = '';
  let lateTargetId = '';
  let reviewedQuestionId = '';
  let reviewedSubmissionId = '';
  let lateSubmissionId = '';
  let adminAuth: AuthTokens;
  let teacherAuth: AuthTokens;
  let studentAuth: AuthTokens;
  let parentAuth: AuthTokens;

  const suffix = randomUUID().split('-')[0];
  const marker = `s14e-${suffix}`;
  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdHomeworkAssignmentIds: string[] = [];
  const createdHomeworkTargetIds: string[] = [];
  const createdHomeworkSubmissionIds: string[] = [];
  const createdFileIds: string[] = [];
  const storedObjects: { bucket: string; objectKey: string }[] = [];
  const fileBytes = Buffer.from(
    '%PDF-1.4\nST01 owned private storage fixture\n',
  );

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [schoolAdminRole, teacherRole, studentRole, parentRole] =
      await Promise.all([
        findSystemRole('school_admin'),
        findSystemRole('teacher'),
        findSystemRole('student'),
        findSystemRole('parent'),
      ]);

    organizationId = await createOrganization();
    schoolId = await createSchool(organizationId);
    academic = await createAcademicBase(schoolId);

    adminEmail = `${marker}-admin@example.test`;
    teacherEmail = `${marker}-teacher@example.test`;
    studentEmail = `${marker}-student@example.test`;
    parentEmail = `${marker}-parent@example.test`;

    await createUserWithMembership({
      email: adminEmail,
      firstName: 'Sprint14E',
      lastName: 'Admin',
      userType: UserType.SCHOOL_USER,
      roleId: schoolAdminRole.id,
    });
    teacherUserId = await createUserWithMembership({
      email: teacherEmail,
      firstName: 'Sprint14E',
      lastName: 'Teacher',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
    });
    studentUserId = await createUserWithMembership({
      email: studentEmail,
      firstName: 'Sprint14E',
      lastName: 'Student',
      userType: UserType.STUDENT,
      roleId: studentRole.id,
    });
    parentUserId = await createUserWithMembership({
      email: parentEmail,
      firstName: 'Sprint14E',
      lastName: 'Parent',
      userType: UserType.PARENT,
      roleId: parentRole.id,
    });

    placement = await createClassroomPlacement({
      schoolId,
      academic,
      teacherUserId,
    });

    const student = await createStudentWithEnrollment({
      schoolId,
      organizationId,
      academic,
      classroomId: placement.classroomId,
      studentUserId,
    });
    studentId = student.studentId;
    enrollmentId = student.enrollmentId;

    guardianId = await createGuardian();
    await linkGuardian(guardianId, studentId);

    const reviewedHomework = await createPublishedHomework({
      marker: 'reviewed-flow',
      dueAt: new Date('2030-05-25T12:00:00.000Z'),
      isGraded: true,
      totalMarks: new Prisma.Decimal(10),
      includeQuestion: true,
    });
    reviewedHomeworkId = reviewedHomework.homeworkId;
    reviewedTargetId = reviewedHomework.targetId;
    reviewedQuestionId = reviewedHomework.questionId ?? '';

    const lateHomework = await createPublishedHomework({
      marker: 'late-flow',
      dueAt: new Date('2026-01-01T12:00:00.000Z'),
      isGraded: false,
      totalMarks: null,
    });
    lateHomeworkId = lateHomework.homeworkId;
    lateTargetId = lateHomework.targetId;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BullmqService)
      .useValue(createNoopBullmqService())
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
    teacherAuth = await login(teacherEmail);
    studentAuth = await login(studentEmail);
    parentAuth = await login(parentEmail);
  });

  afterAll(async () => {
    try {
      if (app)
        for (const object of storedObjects)
          await app.get<StorageService>(StorageService).deleteObject(object);
      if (app) await app.close();
      await cleanupCloseoutData();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('registers completed submission routes and keeps deferred Homework routes absent', () => {
    const routes = listRegisteredRoutes();

    expect(routes).toEqual(
      expect.arrayContaining([
        'GET /api/v1/student/homeworks/:homeworkId/submission',
        'PUT /api/v1/student/homeworks/:homeworkId/submission',
        'GET /api/v1/student/homeworks/:homeworkId/submission/answers',
        'PUT /api/v1/student/homeworks/:homeworkId/submission/answers',
        'GET /api/v1/student/homeworks/:homeworkId/submission/attachments',
        'POST /api/v1/student/homeworks/:homeworkId/submit',
        'POST /api/v1/student/homeworks/:homeworkId/submission/submit',
        'GET /api/v1/homework/assignments/:homeworkId/questions',
        'POST /api/v1/homework/assignments/:homeworkId/questions',
        'GET /api/v1/homework/assignments/:homeworkId/attachments',
        'POST /api/v1/homework/assignments/:homeworkId/attachments',
        'GET /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions',
        'POST /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/questions',
        'GET /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/attachments',
        'POST /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/attachments',
        'GET /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions',
        'GET /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId',
        'GET /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/answers',
        'GET /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/attachments',
        'POST /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/review',
        'GET /api/v1/homework/assignments/:homeworkId/submissions',
        'GET /api/v1/homework/assignments/:homeworkId/submissions/:submissionId',
        'POST /api/v1/homework/assignments/:homeworkId/submissions/:submissionId/review',
        'PATCH /api/v1/homework/assignments/:homeworkId/submissions/:submissionId/review',
        'GET /api/v1/parent/children/:studentId/homeworks/:homeworkId',
      ]),
    );

    for (const absentRoute of [
      'POST /api/v1/parent/children/:studentId/homeworks/:homeworkId/submit',
      'POST /api/v1/parent/children/:studentId/homeworks/:homeworkId/submission/submit',
      'PUT /api/v1/parent/children/:studentId/homeworks/:homeworkId/submission',
      'PATCH /api/v1/parent/children/:studentId/homeworks/:homeworkId/submission',
      'POST /api/v1/student/homeworks/:homeworkId/files',
      'POST /api/v1/student/homeworks/:homeworkId/attachments',
      'POST /api/v1/student/homeworks/:homeworkId/proof',
      'GET /api/v1/student/homeworks/:homeworkId/questions',
      'POST /api/v1/student/homeworks/:homeworkId/answers',
      'GET /api/v1/parent/children/:studentId/homeworks/:homeworkId/questions',
      'GET /api/v1/parent/children/:studentId/homeworks/:homeworkId/attachments',
      'POST /api/v1/homework/assignments/:homeworkId/submissions',
      'POST /api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/sync-grade-item',
      'POST /api/v1/homework/assignments/:homeworkId/submissions/:submissionId/sync-grade-item',
      'POST /api/v1/homework/assignments/:homeworkId/notifications',
      'POST /api/v1/homework/assignments/:homeworkId/xp',
      'POST /api/v1/homework/assignments/:homeworkId/rewards',
      'GET /api/v1/student/pickup',
      'GET /api/v1/parent/pickup',
    ]) {
      expect(routes).not.toContain(absentRoute);
    }

    for (const route of routes) {
      expect(route).not.toMatch(
        /^.+ \/api\/v1\/homework\/.*(file|proof|upload|sync-grade|notification|xp|reward)/,
      );
      expect(route).not.toMatch(
        /^.+ \/api\/v1\/student\/homeworks\/.*(file|proof|upload|grade-sync|sync-grade|notification|xp|reward|pickup|smart-pickup)/,
      );
      expect(route).not.toMatch(
        /^.+ \/api\/v1\/parent\/children\/:studentId\/homeworks\/.*(submit|submission\/submit|question|answer|attachment|file|proof|upload|grade-sync|sync-grade|notification|xp|reward|pickup|smart-pickup)/,
      );
      expect(route).not.toMatch(
        /^.+ \/api\/v1\/teacher\/homeworks\/.*(file|proof|upload|sync-grade|notification|xp|reward|pickup|smart-pickup)/,
      );
    }
  });

  it('covers student submit, teacher review, parent visibility, sanitization, and deferred side effects', async () => {
    const beforeSideEffects = await countDeferredSideEffects();

    const draft = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/student/homeworks/${reviewedHomeworkId}/submission`,
      )
      .set('Authorization', bearer(studentAuth))
      .send({ bodyText: '  Student draft answer for Sprint 14E.  ' })
      .expect(200);

    expect(draft.body.submission).toMatchObject({
      homeworkId: reviewedHomeworkId,
      status: 'draft',
      bodyText: 'Student draft answer for Sprint 14E.',
      submittedAt: null,
      reviewedAt: null,
      reviewNote: null,
      awardedMarks: null,
    });
    expectSafeAppPayload(draft.body);

    const currentDraft = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/student/homeworks/${reviewedHomeworkId}/submission`,
      )
      .set('Authorization', bearer(studentAuth))
      .expect(200);

    expect(currentDraft.body.submission).toMatchObject({
      id: draft.body.submission.id,
      status: 'draft',
      bodyText: 'Student draft answer for Sprint 14E.',
    });
    expectSafeAppPayload(currentDraft.body);

    const savedAnswers = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/student/homeworks/${reviewedHomeworkId}/submission/answers`,
      )
      .set('Authorization', bearer(studentAuth))
      .send({
        answers: [
          {
            questionId: reviewedQuestionId,
            textAnswer: '  Dashboard review surface answer.  ',
          },
        ],
      })
      .expect(200);
    expect(savedAnswers.body.items).toEqual([
      expect.objectContaining({
        questionId: reviewedQuestionId,
        textAnswer: 'Dashboard review surface answer.',
        isDraft: true,
      }),
    ]);
    expectSafeAppPayload(savedAnswers.body);

    const submitted = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/homeworks/${reviewedHomeworkId}/submit`)
      .set('Authorization', bearer(studentAuth))
      .send({})
      .expect(200);

    reviewedSubmissionId = submitted.body.submission.id;
    createdHomeworkSubmissionIds.push(reviewedSubmissionId);
    expect(submitted.body.submission).toMatchObject({
      id: reviewedSubmissionId,
      homeworkId: reviewedHomeworkId,
      status: 'submitted',
      bodyText: 'Student draft answer for Sprint 14E.',
      reviewNote: null,
      awardedMarks: null,
    });
    expect(submitted.body.submission.submittedAt).toEqual(expect.any(String));
    expectSafeAppPayload(submitted.body);

    const late = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/homeworks/${lateHomeworkId}/submit`)
      .set('Authorization', bearer(studentAuth))
      .send({ bodyText: 'Late closeout answer.' })
      .expect(200);

    lateSubmissionId = late.body.submission.id;
    createdHomeworkSubmissionIds.push(lateSubmissionId);
    expect(late.body.submission).toMatchObject({
      id: lateSubmissionId,
      homeworkId: lateHomeworkId,
      status: 'late',
      bodyText: 'Late closeout answer.',
    });
    expectSafeAppPayload(late.body);

    const dashboardSubmissions = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/homework/assignments/${reviewedHomeworkId}/submissions`,
      )
      .set('Authorization', bearer(adminAuth))
      .expect(200);

    expect(dashboardSubmissions.body.submissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: reviewedSubmissionId,
          homeworkId: reviewedHomeworkId,
          targetId: reviewedTargetId,
          status: 'submitted',
          bodyText: 'Student draft answer for Sprint 14E.',
          student: expect.objectContaining({
            id: studentId,
            displayName: 'Sprint14E Student',
          }),
        }),
      ]),
    );
    expectSafeAppPayload(dashboardSubmissions.body);

    const dashboardSubmissionDetail = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/homework/assignments/${reviewedHomeworkId}/submissions/${reviewedSubmissionId}`,
      )
      .set('Authorization', bearer(adminAuth))
      .expect(200);

    expect(dashboardSubmissionDetail.body.submission).toMatchObject({
      id: reviewedSubmissionId,
      homeworkId: reviewedHomeworkId,
      targetId: reviewedTargetId,
      status: 'submitted',
      totalMarks: 10,
      awardedMarks: null,
      isLate: false,
    });
    expectSafeAppPayload(dashboardSubmissionDetail.body);

    const dashboardAnswers = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/homework/assignments/${reviewedHomeworkId}/submissions/${reviewedSubmissionId}/answers`,
      )
      .set('Authorization', bearer(adminAuth))
      .expect(200);
    expect(dashboardAnswers.body.items).toEqual([
      expect.objectContaining({
        answerId: expect.any(String),
        submissionId: reviewedSubmissionId,
        questionId: reviewedQuestionId,
        textAnswer: 'Dashboard review surface answer.',
      }),
    ]);
    expectSafeAppPayload(dashboardAnswers.body);

    const reviewedAnswerId = dashboardAnswers.body.items[0].answerId as string;

    const dashboardAttachments = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/homework/assignments/${reviewedHomeworkId}/submissions/${reviewedSubmissionId}/attachments`,
      )
      .set('Authorization', bearer(adminAuth))
      .expect(200);
    expect(dashboardAttachments.body.items).toEqual([]);
    expectSafeAppPayload(dashboardAttachments.body);

    const reviewedAnswer = await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/homework/assignments/${reviewedHomeworkId}/submissions/${reviewedSubmissionId}/answers/${reviewedAnswerId}/review`,
      )
      .set('Authorization', bearer(adminAuth))
      .send({ awardedPoints: 8, teacherComment: '  Clear answer.  ' })
      .expect(200);
    expect(reviewedAnswer.body.answer).toMatchObject({
      answerId: reviewedAnswerId,
      awardedPoints: 8,
      teacherComment: 'Clear answer.',
      reviewedAt: expect.any(String),
    });
    expectSafeAppPayload(reviewedAnswer.body);

    const submissions = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${placement.allocationId}/assignments/${reviewedHomeworkId}/submissions`,
      )
      .set('Authorization', bearer(teacherAuth))
      .expect(200);

    expect(submissions.body.submissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: reviewedSubmissionId,
          homeworkId: reviewedHomeworkId,
          targetId: reviewedTargetId,
          status: 'submitted',
          bodyText: 'Student draft answer for Sprint 14E.',
          student: expect.objectContaining({
            id: studentId,
            displayName: 'Sprint14E Student',
          }),
        }),
      ]),
    );
    expectSafeAppPayload(submissions.body);

    const lateSubmissions = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${placement.allocationId}/assignments/${lateHomeworkId}/submissions`,
      )
      .query({ status: 'late' })
      .set('Authorization', bearer(teacherAuth))
      .expect(200);

    expect(lateSubmissions.body.submissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: lateSubmissionId,
          homeworkId: lateHomeworkId,
          targetId: lateTargetId,
          status: 'late',
          isLate: true,
        }),
      ]),
    );
    expectSafeAppPayload(lateSubmissions.body);

    const submissionDetail = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${placement.allocationId}/assignments/${reviewedHomeworkId}/submissions/${reviewedSubmissionId}`,
      )
      .set('Authorization', bearer(teacherAuth))
      .expect(200);

    expect(submissionDetail.body.submission).toMatchObject({
      id: reviewedSubmissionId,
      status: 'submitted',
      totalMarks: 10,
      awardedMarks: 8,
      isLate: false,
    });
    expectSafeAppPayload(submissionDetail.body);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/homeworks/classes/${placement.allocationId}/assignments/${reviewedHomeworkId}/submissions/${reviewedSubmissionId}/review`,
      )
      .set('Authorization', bearer(studentAuth))
      .send({ reviewNote: 'Students cannot review homework.', awardedMarks: 8 })
      .expect(403);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/homework/assignments/${reviewedHomeworkId}/submissions/${reviewedSubmissionId}/review`,
      )
      .set('Authorization', bearer(studentAuth))
      .send({ reviewNote: 'Students cannot review dashboard homework.' })
      .expect(403);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/homeworks/${reviewedHomeworkId}/submit`)
      .set('Authorization', bearer(teacherAuth))
      .send({ bodyText: 'Teachers cannot submit as students.' })
      .expect(403);

    const reviewed = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/homework/assignments/${reviewedHomeworkId}/submissions/${reviewedSubmissionId}/review`,
      )
      .set('Authorization', bearer(adminAuth))
      .send({ reviewNote: 'Solid closeout answer.', awardedMarks: 10 })
      .expect(200);

    expect(reviewed.body.submission).toMatchObject({
      id: reviewedSubmissionId,
      homeworkId: reviewedHomeworkId,
      targetId: reviewedTargetId,
      status: 'reviewed',
      bodyText: 'Student draft answer for Sprint 14E.',
      reviewNote: 'Solid closeout answer.',
      awardedMarks: 8,
      totalMarks: 10,
    });
    expect(reviewed.body.submission.reviewedAt).toEqual(expect.any(String));
    expectSafeAppPayload(reviewed.body);

    const lateReviewed = await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/homework/assignments/${lateHomeworkId}/submissions/${lateSubmissionId}/review`,
      )
      .set('Authorization', bearer(adminAuth))
      .send({ reviewNote: 'Late closeout review.' })
      .expect(200);
    expect(lateReviewed.body.submission).toMatchObject({
      id: lateSubmissionId,
      status: 'reviewed',
      reviewNote: 'Late closeout review.',
      isLate: true,
    });
    expectSafeAppPayload(lateReviewed.body);

    const studentDetail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/homeworks/${reviewedHomeworkId}`)
      .set('Authorization', bearer(studentAuth))
      .expect(200);

    expect(studentDetail.body.homework).toMatchObject({
      homeworkId: reviewedHomeworkId,
      targetStatus: 'reviewed',
      submission: {
        id: reviewedSubmissionId,
        homeworkId: reviewedHomeworkId,
        status: 'reviewed',
        bodyText: 'Student draft answer for Sprint 14E.',
        reviewNote: 'Solid closeout answer.',
        awardedMarks: 8,
      },
    });
    expect(studentDetail.body.homework.submission.reviewedAt).toEqual(
      expect.any(String),
    );
    expectSafeStudentOrParentPayload(studentDetail.body);

    const parentDetail = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${studentId}/homeworks/${reviewedHomeworkId}`,
      )
      .set('Authorization', bearer(parentAuth))
      .expect(200);

    expect(parentDetail.body.homework).toMatchObject({
      homeworkId: reviewedHomeworkId,
      child: {
        studentId,
        displayName: 'Sprint14E Student',
      },
      targetStatus: 'reviewed',
      submission: {
        id: reviewedSubmissionId,
        status: 'reviewed',
        bodyText: 'Student draft answer for Sprint 14E.',
        reviewNote: 'Solid closeout answer.',
        awardedMarks: 8,
        totalMarks: 10,
      },
    });
    expect(parentDetail.body.homework.submission.reviewedAt).toEqual(
      expect.any(String),
    );
    expectSafeStudentOrParentPayload(parentDetail.body);

    for (const method of ['post', 'put', 'patch'] as const) {
      await request(app.getHttpServer())
        [
          method
        ](`${GLOBAL_PREFIX}/parent/children/${studentId}/homeworks/${reviewedHomeworkId}/submission`)
        .set('Authorization', bearer(parentAuth))
        .send({ bodyText: 'Parent submit remains deferred.' })
        .expect(404);
    }

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/parent/children/${studentId}/homeworks/${reviewedHomeworkId}/submit`,
      )
      .set('Authorization', bearer(parentAuth))
      .send({ bodyText: 'Parent submit remains deferred.' })
      .expect(404);

    const afterSideEffects = await countDeferredSideEffects();
    expect(afterSideEffects).toEqual(beforeSideEffects);
    expect(afterSideEffects).toEqual({
      gradeAssessments: 0,
      gradeItems: 0,
      gradeSubmissions: 0,
      gradeSubmissionAnswers: 0,
      communicationNotifications: 0,
      xpLedgerEntries: 0,
      rewardRedemptions: 0,
      files: 0,
      attachments: 0,
    });
  });

  it.each([undefined, null, '   '])(
    'ST01 submits a real file without body text (%p), rejects replay and terminal edits',
    async (bodyText) => {
      const fixture = await createFileSubmission();
      const submitted = await submitFile(fixture.homeworkId, { bodyText });
      expect(submitted.body.submission).toMatchObject({
        status: 'submitted',
        bodyText: null,
      });
      await submitFile(fixture.homeworkId, {}, 409);
      await request(app.getHttpServer())
        .delete(studentAttachmentPath(fixture))
        .set('Authorization', bearer(studentAuth))
        .expect(409);
      await request(app.getHttpServer())
        .patch(studentAttachmentPath(fixture))
        .set('Authorization', bearer(studentAuth))
        .send({ title: 'Too late' })
        .expect(409);
    },
  );

  it('ST01 streams real private bytes to the allocated teacher with HEAD, ranges, secure headers and no generic file grant', async () => {
    const fixture = await createFileSubmission();
    await submitFile(fixture.homeworkId);
    for (const mode of ['preview', 'download']) {
      const path = teacherFilePath(fixture, mode);
      const response = await request(app.getHttpServer())
        .get(path)
        .set('Authorization', bearer(teacherAuth))
        .expect(200);
      expect(response.body).toEqual(fileBytes);
      expect(response.headers['content-disposition']).toMatch(
        mode === 'preview' ? /^inline;/ : /^attachment;/,
      );
      expect(response.headers['content-disposition']).not.toMatch(/[\r\n]/);
      expect(response.headers['cache-control']).toBe(
        'no-store, private, max-age=0',
      );
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['accept-ranges']).toBe('bytes');
      expect(response.headers.location).toBeUndefined();
      const head = await request(app.getHttpServer())
        .head(path)
        .set('Authorization', bearer(teacherAuth))
        .set('Range', 'bytes=0-3')
        .expect(200);
      expect(Number(head.headers['content-length'])).toBe(fileBytes.length);
      expect(head.text).toBeUndefined();
      const partial = await request(app.getHttpServer())
        .get(path)
        .set('Authorization', bearer(teacherAuth))
        .set('Range', 'bytes=0-3')
        .expect(206);
      expect(partial.body).toEqual(fileBytes.subarray(0, 4));
      expect(partial.headers['content-range']).toBe(
        `bytes 0-3/${fileBytes.length}`,
      );
      for (const range of ['bytes=999999-', 'bytes=no', 'bytes=0-1,4-5']) {
        const invalid = await request(app.getHttpServer())
          .get(path)
          .set('Authorization', bearer(teacherAuth))
          .set('Range', range)
          .expect(416);
        expect(invalid.headers['content-range']).toBe(
          `bytes */${fileBytes.length}`,
        );
      }
      const full = await request(app.getHttpServer())
        .get(path)
        .set('Authorization', bearer(teacherAuth))
        .set('Range', 'bytes=0-3')
        .set('If-Range', '"stale"')
        .expect(200);
      expect(full.body).toEqual(fileBytes);
    }
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/files/${fixture.fileId}/download`)
      .set('Authorization', bearer(teacherAuth))
      .expect(403);
    // Assignment attachments retain their existing student redirect and content API.
    const assignmentAttachment =
      await prisma.homeworkAssignmentAttachment.create({
        data: {
          schoolId,
          homeworkAssignmentId: fixture.homeworkId,
          fileId: fixture.fileId,
          createdByUserId: teacherUserId,
        },
      });
    const studentPath = `${GLOBAL_PREFIX}/student/homeworks/${fixture.homeworkId}/attachments/${assignmentAttachment.id}/download`;
    await request(app.getHttpServer())
      .get(studentPath)
      .set('Authorization', bearer(studentAuth))
      .expect(307);
    const studentContent = await request(app.getHttpServer())
      .get(studentPath + '/content')
      .set('Authorization', bearer(studentAuth))
      .expect(200);
    expect(studentContent.body).toEqual(fileBytes);
    await request(app.getHttpServer())
      .get(
        teacherFilePath(
          { ...fixture, attachmentId: assignmentAttachment.id },
          'download',
        ),
      )
      .set('Authorization', bearer(teacherAuth))
      .expect(404);
  });

  it('ST01 denies unrelated actors, allocations and mismatched resources without file coordinates', async () => {
    const fixture = await createFileSubmission();
    await request(app.getHttpServer())
      .get(teacherFilePath(fixture, 'download'))
      .set('Authorization', bearer(teacherAuth))
      .expect(404);
    await submitFile(fixture.homeworkId);
    for (const auth of [studentAuth, parentAuth, adminAuth]) {
      await request(app.getHttpServer())
        .get(teacherFilePath(fixture, 'download'))
        .set('Authorization', bearer(auth))
        .expect(403);
    }
    for (const patch of [
      { homeworkId: randomUUID() },
      { submissionId: randomUUID() },
      { attachmentId: randomUUID() },
    ]) {
      const denied = await request(app.getHttpServer())
        .get(teacherFilePath({ ...fixture, ...patch }, 'download'))
        .set('Authorization', bearer(teacherAuth))
        .expect(404);
      expect(JSON.stringify(denied.body)).not.toMatch(
        /objectKey|bucket|X-Amz|storageAccessKey/i,
      );
    }
    const otherEmail = `${marker}-other-teacher@example.test`;
    const otherTeacher = await createUserWithMembership({
      email: otherEmail,
      firstName: 'Other',
      lastName: 'Teacher',
      userType: UserType.TEACHER,
      roleId: (await findSystemRole('teacher')).id,
    });
    const otherAuth = await login(otherEmail);
    await request(app.getHttpServer())
      .get(teacherFilePath(fixture, 'download'))
      .set('Authorization', bearer(otherAuth))
      .expect(404);
    const otherPlacement = await createClassroomPlacement({
      schoolId,
      academic,
      teacherUserId,
    });
    await request(app.getHttpServer())
      .get(
        teacherFilePath(fixture, 'download').replace(
          placement.allocationId,
          otherPlacement.allocationId,
        ),
      )
      .set('Authorization', bearer(teacherAuth))
      .expect(404);
    await prisma.teacherSubjectAllocation.update({
      where: { id: placement.allocationId },
      data: { teacherUserId: otherTeacher },
    });
    try {
      await request(app.getHttpServer())
        .get(teacherFilePath(fixture, 'download'))
        .set('Authorization', bearer(teacherAuth))
        .expect(404);
    } finally {
      await prisma.teacherSubjectAllocation.update({
        where: { id: placement.allocationId },
        data: { teacherUserId },
      });
    }
  });

  it.each(['attachment', 'file', 'allocation', 'enrollment'] as const)(
    'ST01 rechecks %s revocation after real object stat and before bytes',
    async (resource) => {
      const fixture = await createFileSubmission();
      await submitFile(fixture.homeworkId);
      const storage = app.get<StorageService>(StorageService);
      const stat = storage.statObject.bind(
        storage,
      ) as StorageService['statObject'];
      const get = jest.spyOn(storage, 'getObject');
      const spy = jest
        .spyOn(storage, 'statObject')
        .mockImplementationOnce(async (input) => {
          const result = await stat(input);
          if (resource === 'attachment')
            await prisma.homeworkSubmissionAttachment.update({
              where: { id: fixture.attachmentId },
              data: { deletedAt: new Date() },
            });
          if (resource === 'file')
            await prisma.file.update({
              where: { id: fixture.fileId },
              data: { deletedAt: new Date() },
            });
          if (resource === 'allocation')
            await prisma.teacherSubjectAllocation.update({
              where: { id: placement.allocationId },
              data: { teacherUserId: studentUserId },
            });
          if (resource === 'enrollment')
            await prisma.enrollment.update({
              where: { id: enrollmentId },
              data: { endedAt: new Date() },
            });
          return result;
        });
      try {
        const denied = await request(app.getHttpServer())
          .get(teacherFilePath(fixture, 'download'))
          .set('Authorization', bearer(teacherAuth))
          .expect(404);
        expect(denied.headers['content-disposition']).toBeUndefined();
        for (const opened of get.mock.results) {
          const source = await (opened.value as Promise<{
            destroyed: boolean;
          }>);
          expect(source.destroyed).toBe(true);
        }
      } finally {
        spy.mockRestore();
        get.mockRestore();
        await prisma.teacherSubjectAllocation.update({
          where: { id: placement.allocationId },
          data: { teacherUserId },
        });
        await prisma.enrollment.update({
          where: { id: enrollmentId },
          data: { endedAt: null },
        });
      }
    },
  );

  it('ST01 rejects untrusted inline MIME while preserving attachment download and missing-object 404', async () => {
    const fixture = await createFileSubmission();
    await submitFile(fixture.homeworkId);
    await prisma.file.update({
      where: { id: fixture.fileId },
      data: { mimeType: 'text/html' },
    });
    await request(app.getHttpServer())
      .get(teacherFilePath(fixture, 'preview'))
      .set('Authorization', bearer(teacherAuth))
      .expect(403);
    await request(app.getHttpServer())
      .get(teacherFilePath(fixture, 'download'))
      .set('Authorization', bearer(teacherAuth))
      .expect(200);
    await app.get<StorageService>(StorageService).deleteObject(fixture.object);
    await request(app.getHttpServer())
      .get(teacherFilePath(fixture, 'download'))
      .set('Authorization', bearer(teacherAuth))
      .expect(404);
  });

  it.each([
    'attachment',
    'file',
    'uploader',
    'visibility',
    'target',
    'enrollment',
    'status',
  ] as const)(
    'ST01 rejects stale file-only eligibility when %s changes before the final transaction',
    async (resource) => {
      const fixture = await createFileSubmission();
      const repository = app.get<HomeworkRepository>(HomeworkRepository);
      const submit = repository.submitSubmission.bind(
        repository,
      ) as HomeworkRepository['submitSubmission'];
      const spy = jest
        .spyOn(repository, 'submitSubmission')
        .mockImplementationOnce(async (input) => {
          if (resource === 'attachment')
            await prisma.homeworkSubmissionAttachment.update({
              where: { id: fixture.attachmentId },
              data: { deletedAt: new Date() },
            });
          if (resource === 'file')
            await prisma.file.update({
              where: { id: fixture.fileId },
              data: { deletedAt: new Date() },
            });
          if (resource === 'uploader')
            await prisma.file.update({
              where: { id: fixture.fileId },
              data: { uploaderId: teacherUserId },
            });
          if (resource === 'visibility')
            await prisma.file.update({
              where: { id: fixture.fileId },
              data: { visibility: 'PUBLIC' },
            });
          if (resource === 'target')
            await prisma.homeworkSubmissionAttachment.update({
              where: { id: fixture.attachmentId },
              data: { homeworkTargetId: lateTargetId },
            });
          if (resource === 'enrollment')
            await prisma.enrollment.update({
              where: { id: enrollmentId },
              data: { endedAt: new Date() },
            });
          if (resource === 'status')
            await prisma.homeworkSubmission.update({
              where: { id: fixture.submissionId },
              data: { status: 'REVIEWED' },
            });
          return submit(input);
        });
      try {
        await submitFile(
          fixture.homeworkId,
          {},
          resource === 'enrollment' ? 404 : resource === 'status' ? 409 : 400,
        );
        const target = await prisma.homeworkTarget.findUniqueOrThrow({
          where: { id: fixture.targetId },
        });
        expect(target.status).toBe('ASSIGNED');
        expect(target.submittedAt).toBeNull();
      } finally {
        spy.mockRestore();
        await prisma.enrollment.update({
          where: { id: enrollmentId },
          data: { endedAt: null },
        });
      }
    },
  );

  it('ST01 allows one concurrent submit, rejects empty and required-answer omissions, and preserves late status', async () => {
    const fixture = await createFileSubmission();
    const responses = await Promise.all([
      submitFile(fixture.homeworkId, {}, null),
      submitFile(fixture.homeworkId, {}, null),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect(
      await prisma.homeworkSubmission.count({
        where: { homeworkTargetId: fixture.targetId },
      }),
    ).toBe(1);
    const empty = await createPublishedHomework({
      marker: 'empty',
      dueAt: new Date('2030-01-01'),
      isGraded: false,
      totalMarks: null,
    });
    await submitFile(empty.homeworkId, {}, 400);
    const required = await createFileSubmission(true);
    await submitFile(required.homeworkId, {}, 422);
    const late = await createFileSubmission();
    await prisma.homeworkAssignment.update({
      where: { id: late.homeworkId },
      data: { dueAt: new Date('2020-01-01') },
    });
    expect((await submitFile(late.homeworkId)).body.submission.status).toBe(
      'late',
    );
  });

  it('ST01 denies cross-school teachers, foreign files and inconsistent student identities', async () => {
    const fixture = await createFileSubmission();
    await submitFile(fixture.homeworkId);
    const foreignSchoolId = await createSchool(organizationId);
    const teacherRole = await findSystemRole('teacher');
    const foreignEmail = `${marker}-foreign-teacher@example.test`;
    await createUserWithMembership({
      email: foreignEmail,
      firstName: 'Foreign',
      lastName: 'Teacher',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      schoolId: foreignSchoolId,
    });
    const foreignAuth = await login(foreignEmail);
    await request(app.getHttpServer())
      .get(teacherFilePath(fixture, 'download'))
      .set('Authorization', bearer(foreignAuth))
      .expect(404);
    await prisma.file.update({
      where: { id: fixture.fileId },
      data: { schoolId: foreignSchoolId },
    });
    await request(app.getHttpServer())
      .get(teacherFilePath(fixture, 'download'))
      .set('Authorization', bearer(teacherAuth))
      .expect(404);
    await prisma.file.update({
      where: { id: fixture.fileId },
      data: { schoolId },
    });

    const otherEmail = `${marker}-other-student@example.test`;
    const otherUserId = await createUserWithMembership({
      email: otherEmail,
      firstName: 'Other',
      lastName: 'Student',
      userType: UserType.STUDENT,
      roleId: (await findSystemRole('student')).id,
    });
    const otherStudent = await createStudentWithEnrollment({
      schoolId,
      organizationId,
      academic,
      classroomId: placement.classroomId,
      studentUserId: otherUserId,
    });
    const otherAuth = await login(otherEmail);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/homeworks/${fixture.homeworkId}/submit`)
      .set('Authorization', bearer(otherAuth))
      .send({})
      .expect(404);
    await prisma.homeworkSubmission.update({
      where: { id: fixture.submissionId },
      data: {
        studentId: otherStudent.studentId,
        enrollmentId: otherStudent.enrollmentId,
      },
    });
    await request(app.getHttpServer())
      .get(teacherFilePath(fixture, 'download'))
      .set('Authorization', bearer(teacherAuth))
      .expect(404);
    await prisma.homeworkSubmission.update({
      where: { id: fixture.submissionId },
      data: { studentId, enrollmentId },
    });
    await prisma.file.update({
      where: { id: fixture.fileId },
      data: { uploaderId: otherUserId },
    });
    await request(app.getHttpServer())
      .get(teacherFilePath(fixture, 'download'))
      .set('Authorization', bearer(teacherAuth))
      .expect(404);
  });

  it('ST01 waits for a concurrent File update and rejects the deleted file at the mutation boundary', async () => {
    const fixture = await createFileSubmission();
    let pending: ReturnType<typeof submitFile> | undefined;
    await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM files WHERE id = ${fixture.fileId}::uuid FOR UPDATE`;
        pending = submitFile(fixture.homeworkId, {}, null);
        let blocked = false;
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
          const waiting = await prisma.$queryRaw<
            { count: bigint }[]
          >`SELECT count(*) AS count FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'
            AND query LIKE '%homework_submission_attachments%'`;
          if (Number(waiting[0].count) > 0) {
            blocked = true;
            break;
          }
          await delay(20);
        }
        expect(blocked).toBe(true);
        await tx.file.update({
          where: { id: fixture.fileId },
          data: { deletedAt: new Date() },
        });
      },
      { timeout: 10000 },
    );
    expect((await pending)?.status).toBe(400);
    expect(
      (
        await prisma.homeworkSubmission.findUniqueOrThrow({
          where: { id: fixture.submissionId },
        })
      ).status,
    ).toBe('DRAFT');
  });

  it('ST01 destroys an actual storage stream when the HTTP client disconnects', async () => {
    const fixture = await createFileSubmission();
    const bytes = Buffer.concat([fileBytes, Buffer.alloc(2 * 1024 * 1024, 65)]);
    const storage = app.get<StorageService>(StorageService);
    await storage.saveObject({
      ...fixture.object,
      body: bytes,
      contentType: 'application/pdf',
    });
    await prisma.file.update({
      where: { id: fixture.fileId },
      data: { sizeBytes: BigInt(bytes.length) },
    });
    await submitFile(fixture.homeworkId);
    const original = storage.getObject.bind(
      storage,
    ) as StorageService['getObject'];
    let sourceClosed: Promise<void> | undefined;
    const spy = jest
      .spyOn(storage, 'getObject')
      .mockImplementationOnce(async (input) => {
        const source = await original(input);
        sourceClosed = new Promise<void>((resolve) =>
          source.once('close', resolve),
        );
        // Bytes still come from MinIO; throttle the consumer to make disconnect deterministic.
        const consumer = new Transform({
          transform(chunk, encoding, callback) {
            setTimeout(() => callback(null, chunk), 15);
          },
        });
        source.on('error', (error: Error) => consumer.destroy(error));
        consumer.once('close', () => source.destroy());
        return source.pipe(consumer);
      });
    const server = app.getHttpServer() as Server;
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    try {
      await new Promise<void>((resolve, reject) => {
        const operation = httpGet(
          {
            hostname: '127.0.0.1',
            port: (server.address() as AddressInfo).port,
            path: teacherFilePath(fixture, 'download'),
            headers: { Authorization: bearer(teacherAuth) },
          },
          (response) => {
            response.once('data', (chunk: Buffer) => {
              expect(chunk.subarray(0, fileBytes.length)).toEqual(fileBytes);
              response.destroy();
              resolve();
            });
          },
        );
        operation.on('error', reject);
      });
      expect(sourceClosed).toBeDefined();
      await Promise.race([
        sourceClosed,
        new Promise((resolve, reject) => {
          const deadline = setTimeout(
            () =>
              reject(new Error('Storage stream did not close on disconnect')),
            5000,
          );
          void sourceClosed?.then(() => {
            clearTimeout(deadline);
            resolve(undefined);
          });
        }),
      ]);
    } finally {
      spy.mockRestore();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  type FileSubmissionFixture = Awaited<ReturnType<typeof createFileSubmission>>;
  const studentAttachmentPath = (fixture: FileSubmissionFixture) =>
    `${GLOBAL_PREFIX}/student/homeworks/${fixture.homeworkId}/submission/attachments/${fixture.attachmentId}`;
  const teacherFilePath = (
    fixture: Pick<
      FileSubmissionFixture,
      'homeworkId' | 'submissionId' | 'attachmentId'
    >,
    mode: string,
  ) =>
    `${GLOBAL_PREFIX}/teacher/homeworks/classes/${placement.allocationId}/assignments/${fixture.homeworkId}/submissions/${fixture.submissionId}/attachments/${fixture.attachmentId}/${mode}`;

  async function submitFile(
    homeworkId: string,
    body: { bodyText?: string | null } = {},
    expected: number | null = 200,
  ) {
    const operation = request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/homeworks/${homeworkId}/submit`)
      .set('Authorization', bearer(studentAuth))
      .send(body);
    const response = await (expected === null
      ? operation
      : operation.expect(expected));
    return {
      status: response.status,
      body: response.body as {
        submission: { status: string; bodyText: string | null };
      },
    };
  }

  async function createFileSubmission(includeQuestion = false) {
    const homework = await createPublishedHomework({
      marker: `file-${randomUUID()}`,
      dueAt: new Date('2030-01-01'),
      isGraded: false,
      totalMarks: null,
      includeQuestion,
    });
    const objectKey = `${marker}/${randomUUID()}`;
    const { bucket } = await app
      .get<StorageService>(StorageService)
      .saveObject({
        objectKey,
        body: fileBytes,
        contentType: 'application/pdf',
        visibility: 'PRIVATE',
      });
    const object = { bucket, objectKey };
    storedObjects.push(object);
    const file = await prisma.file.create({
      data: {
        schoolId,
        organizationId,
        uploaderId: studentUserId,
        ...object,
        originalName: 'إجابة.pdf',
        mimeType: 'application/pdf',
        sizeBytes: BigInt(fileBytes.length),
        visibility: 'PRIVATE',
      },
    });
    createdFileIds.push(file.id);
    const linked = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/student/homeworks/${homework.homeworkId}/submission/attachments`,
      )
      .set('Authorization', bearer(studentAuth))
      .send({ fileId: file.id })
      .expect(201);
    const linkedBody = linked.body as {
      attachment: { submissionId: string; attachmentId: string };
    };
    return {
      ...homework,
      fileId: file.id,
      object,
      submissionId: linkedBody.attachment.submissionId,
      attachmentId: linkedBody.attachment.attachmentId,
    };
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
        name: `Sprint 14E Org ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);
    return organization.id;
  }

  async function createSchool(inputOrganizationId: string): Promise<string> {
    const schoolMarker = `${marker}-${randomUUID().slice(0, 8)}`;
    const school = await prisma.school.create({
      data: {
        organizationId: inputOrganizationId,
        slug: `${schoolMarker}-school`,
        name: `Sprint 14E School ${suffix}`,
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
    schoolId?: string;
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
        schoolId: params.schoolId ?? schoolId,
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
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2030-12-31T00:00:00.000Z'),
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
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2030-12-31T00:00:00.000Z'),
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

    return {
      academicYearId: academicYear.id,
      termId: term.id,
      stageId: stage.id,
      gradeId: grade.id,
      sectionId: section.id,
    };
  }

  async function createClassroomPlacement(params: {
    schoolId: string;
    academic: AcademicBase;
    teacherUserId: string;
  }): Promise<ClassroomPlacement> {
    const placementMarker = `${marker}-${randomUUID().slice(0, 8)}`;
    const classroom = await prisma.classroom.create({
      data: {
        schoolId: params.schoolId,
        sectionId: params.academic.sectionId,
        nameAr: `${placementMarker}-classroom-ar`,
        nameEn: `${placementMarker}-classroom`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const subject = await prisma.subject.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${placementMarker}-subject-ar`,
        nameEn: `${placementMarker}-subject`,
        code: `S14E-${placementMarker}`,
        isActive: true,
      },
      select: { id: true },
    });
    const allocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId: params.schoolId,
        teacherUserId: params.teacherUserId,
        subjectId: subject.id,
        classroomId: classroom.id,
        termId: params.academic.termId,
      },
      select: { id: true },
    });

    return {
      classroomId: classroom.id,
      subjectId: subject.id,
      allocationId: allocation.id,
    };
  }

  async function createStudentWithEnrollment(params: {
    schoolId: string;
    organizationId: string;
    academic: AcademicBase;
    classroomId: string;
    studentUserId: string;
  }): Promise<{ studentId: string; enrollmentId: string }> {
    const student = await prisma.student.create({
      data: {
        schoolId: params.schoolId,
        organizationId: params.organizationId,
        userId: params.studentUserId,
        firstName: 'Sprint14E',
        lastName: 'Student',
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    const enrollment = await prisma.enrollment.create({
      data: {
        schoolId: params.schoolId,
        studentId: student.id,
        academicYearId: params.academic.academicYearId,
        termId: params.academic.termId,
        classroomId: params.classroomId,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      select: { id: true },
    });

    return { studentId: student.id, enrollmentId: enrollment.id };
  }

  async function createGuardian(): Promise<string> {
    const guardian = await prisma.guardian.create({
      data: {
        schoolId,
        organizationId,
        userId: parentUserId,
        firstName: 'Sprint14E',
        lastName: 'Guardian',
        phone: `${marker}-guardian-phone`,
        email: `${marker}-guardian@example.test`,
        relation: 'mother',
        isPrimary: true,
      },
      select: { id: true },
    });
    return guardian.id;
  }

  async function linkGuardian(
    inputGuardianId: string,
    inputStudentId: string,
  ): Promise<void> {
    await prisma.studentGuardian.create({
      data: {
        schoolId,
        guardianId: inputGuardianId,
        studentId: inputStudentId,
        isPrimary: true,
      },
    });
  }

  async function createPublishedHomework(params: {
    marker: string;
    dueAt: Date;
    isGraded: boolean;
    totalMarks: Prisma.Decimal | null;
    includeQuestion?: boolean;
  }): Promise<{ homeworkId: string; targetId: string; questionId?: string }> {
    const homework = await prisma.homeworkAssignment.create({
      data: {
        schoolId,
        academicYearId: academic.academicYearId,
        termId: academic.termId,
        classroomId: placement.classroomId,
        subjectId: placement.subjectId,
        teacherUserId,
        teacherSubjectAllocationId: placement.allocationId,
        title: `${marker}-${params.marker}`,
        description: `${marker}-${params.marker}-description`,
        mode: HomeworkAssignmentMode.HOMEWORK,
        status: HomeworkAssignmentStatus.PUBLISHED,
        targetMode: HomeworkTargetMode.CLASSROOM,
        publishedAt: new Date('2026-05-01T08:00:00.000Z'),
        publishedByUserId: teacherUserId,
        dueAt: params.dueAt,
        totalMarks: params.totalMarks,
        isGraded: params.isGraded,
        createdByUserId: teacherUserId,
      },
      select: { id: true },
    });
    createdHomeworkAssignmentIds.push(homework.id);

    const question = params.includeQuestion
      ? await prisma.homeworkQuestion.create({
          data: {
            schoolId,
            homeworkAssignmentId: homework.id,
            type: HomeworkQuestionType.SHORT_TEXT,
            prompt: `${marker}-${params.marker}-question`,
            points: params.totalMarks ?? new Prisma.Decimal(10),
            sortOrder: 0,
            isRequired: true,
            createdByUserId: teacherUserId,
          },
          select: { id: true },
        })
      : null;

    const target = await prisma.homeworkTarget.create({
      data: {
        schoolId,
        homeworkAssignmentId: homework.id,
        studentId,
        enrollmentId,
      },
      select: { id: true },
    });
    createdHomeworkTargetIds.push(target.id);

    return {
      homeworkId: homework.id,
      targetId: target.id,
      questionId: question?.id,
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
      gradeItems,
      gradeSubmissions,
      gradeSubmissionAnswers,
      communicationNotifications,
      xpLedgerEntries,
      rewardRedemptions,
      files,
      attachments,
    ] = await Promise.all([
      prisma.gradeAssessment.count({ where: { schoolId } }),
      prisma.gradeItem.count({ where: { schoolId } }),
      prisma.gradeSubmission.count({ where: { schoolId } }),
      prisma.gradeSubmissionAnswer.count({ where: { schoolId } }),
      prisma.communicationNotification.count({ where: { schoolId } }),
      prisma.xpLedger.count({ where: { schoolId } }),
      prisma.rewardRedemption.count({ where: { schoolId } }),
      prisma.file.count({ where: { schoolId } }),
      prisma.attachment.count({ where: { schoolId } }),
    ]);

    return {
      gradeAssessments,
      gradeItems,
      gradeSubmissions,
      gradeSubmissionAnswers,
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

  function expectSafeAppPayload(value: unknown): void {
    for (const key of [
      'schoolId',
      'organizationId',
      'enrollmentId',
      'reviewedByUserId',
    ]) {
      expectNoObjectKey(value, key);
    }
  }

  function expectSafeStudentOrParentPayload(value: unknown): void {
    expectSafeAppPayload(value);
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

  type AppModuleBullmqServiceMock = {
    getQueue: (
      ...args: Parameters<BullmqService['getQueue']>
    ) => NoopBullmqQueue;
    addJob: (
      ...args: Parameters<BullmqService['addJob']>
    ) => Promise<{ id: string }>;
    getQueueReadiness: BullmqService['getQueueReadiness'];
    createWorker: (
      ...args: Parameters<BullmqService['createWorker']>
    ) => NoopBullmqWorker;
  };

  type NoopBullmqQueue = {
    add: (...args: unknown[]) => Promise<{ id: string }>;
    close: () => Promise<void>;
  };

  type NoopBullmqWorker = {
    on: (event: string, listener: (...args: unknown[]) => void) => void;
    close: () => Promise<void>;
  };

  function createNoopBullmqService(): AppModuleBullmqServiceMock {
    return {
      getQueue: jest.fn(() => ({
        add: jest.fn().mockResolvedValue({ id: 'noop-job' }),
        close: jest.fn().mockResolvedValue(undefined),
      })),
      addJob: jest.fn().mockResolvedValue({ id: 'noop-job' }),
      getQueueReadiness: jest.fn().mockResolvedValue({
        name: 'settings-branding-logo-cleanup',
        status: 'ok',
        counts: { waiting: 0, active: 0, delayed: 0, failed: 0 },
      }),
      createWorker: jest.fn(() => ({
        close: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
      })),
    };
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
    await prisma.homeworkSubmissionAnswer.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.homeworkSubmissionAttachment.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.homeworkAssignmentAttachment.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.file.deleteMany({ where: { id: { in: createdFileIds } } });
    await prisma.homeworkSubmission.deleteMany({
      where: {
        OR: [
          { id: { in: createdHomeworkSubmissionIds } },
          { schoolId: { in: createdSchoolIds } },
        ],
      },
    });
    await prisma.homeworkTarget.deleteMany({
      where: {
        OR: [
          { id: { in: createdHomeworkTargetIds } },
          { schoolId: { in: createdSchoolIds } },
        ],
      },
    });
    await prisma.homeworkQuestionOption.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.homeworkQuestion.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.homeworkAssignment.deleteMany({
      where: {
        OR: [
          { id: { in: createdHomeworkAssignmentIds } },
          { schoolId: { in: createdSchoolIds } },
        ],
      },
    });
    await prisma.studentGuardian.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.enrollment.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.guardian.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.student.deleteMany({
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
