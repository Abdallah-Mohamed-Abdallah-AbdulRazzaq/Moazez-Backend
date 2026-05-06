import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BehaviorPointLedgerEntryType,
  BehaviorRecordStatus,
  BehaviorRecordType,
  BehaviorSeverity,
  CommunicationConversationStatus,
  CommunicationConversationType,
  CommunicationMessageKind,
  CommunicationMessageStatus,
  CommunicationParticipantRole,
  CommunicationParticipantStatus,
  FileVisibility,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  ReinforcementProofType,
  ReinforcementRewardType,
  ReinforcementSource,
  ReinforcementSubmissionStatus,
  ReinforcementTargetScope,
  ReinforcementTaskStatus,
  SchoolStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
  XpSourceType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'TeacherApp123!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

type AcademicContext = {
  academicYearId: string;
  termId: string;
  termName: string;
};

type AcademicFixture = AcademicContext & {
  allocationId: string;
  classroomId: string;
  classroomName: string;
  subjectId: string;
  subjectName: string;
  stageId: string;
  stageName: string;
  gradeId: string;
  gradeName: string;
  sectionId: string;
  sectionName: string;
  studentIds: string[];
  enrollmentIds: string[];
};

type TaskFixture = {
  taskId: string;
  stageId: string;
  assignmentId: string;
  submissionId: string;
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

jest.setTimeout(120000);

describe('Sprint 7D Teacher App final closeout flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationAId = '';
  let organizationBId = '';
  let schoolAId = '';
  let schoolBId = '';
  let teacherAId = '';
  let teacherBId = '';
  let teacherCrossSchoolId = '';
  let parentUserId = '';
  let teacherAEmail = '';
  let teacherBEmail = '';
  let teacherCrossSchoolEmail = '';
  let adminEmail = '';
  let parentEmail = '';
  let studentEmail = '';
  let ownFixture: AcademicFixture;
  let otherTeacherFixture: AcademicFixture;
  let crossSchoolFixture: AcademicFixture;
  let ownReviewApprove: TaskFixture;
  let ownReviewReject: TaskFixture;
  let otherTeacherTask: TaskFixture;
  let crossSchoolTask: TaskFixture;
  let ownConversationId = '';
  let otherTeacherConversationId = '';
  let crossSchoolConversationId = '';
  let ownVisibleMessageId = '';

  const suffix = randomUUID().split('-')[0];
  const testMarker = `s7d-${suffix}`;
  const privateMarkers = new Set<string>();
  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdAcademicYearIds: string[] = [];
  const createdTermIds: string[] = [];
  const createdStageIds: string[] = [];
  const createdGradeIds: string[] = [];
  const createdSectionIds: string[] = [];
  const createdRoomIds: string[] = [];
  const createdClassroomIds: string[] = [];
  const createdSubjectIds: string[] = [];
  const createdAllocationIds: string[] = [];
  const createdStudentIds: string[] = [];
  const createdEnrollmentIds: string[] = [];
  const createdBehaviorCategoryIds: string[] = [];
  const createdBehaviorRecordIds: string[] = [];
  const createdBehaviorPointLedgerIds: string[] = [];
  const createdXpLedgerIds: string[] = [];
  const createdFileIds: string[] = [];
  const createdReinforcementTaskIds: string[] = [];
  const createdReinforcementTargetIds: string[] = [];
  const createdReinforcementStageIds: string[] = [];
  const createdReinforcementAssignmentIds: string[] = [];
  const createdReinforcementSubmissionIds: string[] = [];
  const createdCommunicationConversationIds: string[] = [];
  const createdCommunicationParticipantIds: string[] = [];
  const createdCommunicationMessageIds: string[] = [];
  const createdCommunicationAttachmentIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [teacherRole, schoolAdminRole, parentRole, studentRole] =
      await Promise.all([
        findSystemRole('teacher'),
        findSystemRole('school_admin'),
        findSystemRole('parent'),
        findSystemRole('student'),
      ]);

    const orgA = await prisma.organization.create({
      data: {
        slug: `${testMarker}-org-a`,
        name: `Sprint 7D Org A ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    organizationAId = orgA.id;
    createdOrganizationIds.push(orgA.id);

    const orgB = await prisma.organization.create({
      data: {
        slug: `${testMarker}-org-b`,
        name: `Sprint 7D Org B ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    organizationBId = orgB.id;
    createdOrganizationIds.push(orgB.id);

    const schoolA = await prisma.school.create({
      data: {
        organizationId: organizationAId,
        slug: `${testMarker}-school-a`,
        name: `Sprint 7D School A ${suffix}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    schoolAId = schoolA.id;
    createdSchoolIds.push(schoolA.id);

    const schoolB = await prisma.school.create({
      data: {
        organizationId: organizationBId,
        slug: `${testMarker}-school-b`,
        name: `Sprint 7D School B ${suffix}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    schoolBId = schoolB.id;
    createdSchoolIds.push(schoolB.id);

    privateMarkers.add(`${testMarker}-raw-logo-url`);
    await prisma.schoolProfile.create({
      data: {
        schoolId: schoolAId,
        schoolName: `Sprint 7D Academy ${suffix}`,
        logoUrl: `${testMarker}-raw-logo-url`,
        formattedAddress: `Sprint 7D Address ${suffix}`,
      },
    });

    teacherAEmail = `${testMarker}-teacher-a@e2e.moazez.local`;
    teacherBEmail = `${testMarker}-teacher-b@e2e.moazez.local`;
    teacherCrossSchoolEmail = `${testMarker}-teacher-cross@e2e.moazez.local`;
    adminEmail = `${testMarker}-admin@e2e.moazez.local`;
    parentEmail = `${testMarker}-parent@e2e.moazez.local`;
    studentEmail = `${testMarker}-student@e2e.moazez.local`;

    teacherAId = await createUserWithMembership({
      email: teacherAEmail,
      firstName: 'Sprint7D',
      lastName: 'TeacherA',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    teacherBId = await createUserWithMembership({
      email: teacherBEmail,
      firstName: 'Sprint7D',
      lastName: 'TeacherB',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    teacherCrossSchoolId = await createUserWithMembership({
      email: teacherCrossSchoolEmail,
      firstName: 'Sprint7D',
      lastName: 'TeacherCross',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId: organizationBId,
      schoolId: schoolBId,
    });
    await createUserWithMembership({
      email: adminEmail,
      firstName: 'Sprint7D',
      lastName: 'Admin',
      userType: UserType.SCHOOL_USER,
      roleId: schoolAdminRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    parentUserId = await createUserWithMembership({
      email: parentEmail,
      firstName: 'Sprint7D',
      lastName: 'Parent',
      userType: UserType.PARENT,
      roleId: parentRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    await createUserWithMembership({
      email: studentEmail,
      firstName: 'Sprint7D',
      lastName: 'StudentUser',
      userType: UserType.STUDENT,
      roleId: studentRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });

    const schoolAContext = await createActiveAcademicContext({
      schoolId: schoolAId,
      marker: 'school-a',
    });
    const schoolBContext = await createActiveAcademicContext({
      schoolId: schoolBId,
      marker: 'school-b',
    });

    ownFixture = await createAcademicFixture({
      organizationId: organizationAId,
      schoolId: schoolAId,
      context: schoolAContext,
      teacherUserId: teacherAId,
      marker: 'own',
      studentCount: 2,
    });
    otherTeacherFixture = await createAcademicFixture({
      organizationId: organizationAId,
      schoolId: schoolAId,
      context: schoolAContext,
      teacherUserId: teacherBId,
      marker: 'other-teacher',
      studentCount: 1,
    });
    crossSchoolFixture = await createAcademicFixture({
      organizationId: organizationBId,
      schoolId: schoolBId,
      context: schoolBContext,
      teacherUserId: teacherCrossSchoolId,
      marker: 'cross-school',
      studentCount: 1,
    });

    await createBehaviorPointFixture({
      schoolId: schoolAId,
      fixture: ownFixture,
      studentIndex: 0,
    });

    ownReviewApprove = await createTaskFixture({
      schoolId: schoolAId,
      fixture: ownFixture,
      teacherUserId: teacherAId,
      marker: 'approve',
      studentIndex: 0,
      status: ReinforcementTaskStatus.UNDER_REVIEW,
      withProofFile: true,
    });
    ownReviewReject = await createTaskFixture({
      schoolId: schoolAId,
      fixture: ownFixture,
      teacherUserId: teacherAId,
      marker: 'reject',
      studentIndex: 1,
      status: ReinforcementTaskStatus.UNDER_REVIEW,
      withProofFile: true,
    });
    otherTeacherTask = await createTaskFixture({
      schoolId: schoolAId,
      fixture: otherTeacherFixture,
      teacherUserId: teacherBId,
      marker: 'other-teacher',
      studentIndex: 0,
      status: ReinforcementTaskStatus.UNDER_REVIEW,
      withProofFile: true,
    });
    crossSchoolTask = await createTaskFixture({
      schoolId: schoolBId,
      fixture: crossSchoolFixture,
      teacherUserId: teacherCrossSchoolId,
      marker: 'cross-school',
      studentIndex: 0,
      status: ReinforcementTaskStatus.UNDER_REVIEW,
      withProofFile: true,
    });

    await createXpLedgerFixture({
      schoolId: schoolAId,
      fixture: ownFixture,
      studentIndex: 0,
      sourceId: `${testMarker}-own-xp`,
      amount: 30,
      reason: `${testMarker}-own-xp-reason`,
    });
    await createXpLedgerFixture({
      schoolId: schoolAId,
      fixture: otherTeacherFixture,
      studentIndex: 0,
      sourceId: `${testMarker}-other-xp`,
      amount: 40,
      reason: `${testMarker}-other-xp-reason`,
    });
    await createXpLedgerFixture({
      schoolId: schoolBId,
      fixture: crossSchoolFixture,
      studentIndex: 0,
      sourceId: `${testMarker}-cross-xp`,
      amount: 50,
      reason: `${testMarker}-cross-xp-reason`,
    });

    const ownConversation = await createMessageConversationFixture({
      schoolId: schoolAId,
      title: null,
      participantUserIds: [teacherAId, parentUserId],
      messagePrefix: 'own',
      attachFile: true,
    });
    ownConversationId = ownConversation.conversationId;
    ownVisibleMessageId = ownConversation.visibleMessageId;

    const otherConversation = await createMessageConversationFixture({
      schoolId: schoolAId,
      title: `Sprint 7D Other Teacher ${suffix}`,
      participantUserIds: [teacherBId],
      messagePrefix: 'other-teacher',
      attachFile: false,
    });
    otherTeacherConversationId = otherConversation.conversationId;

    const crossConversation = await createMessageConversationFixture({
      schoolId: schoolBId,
      title: `Sprint 7D Cross School ${suffix}`,
      participantUserIds: [teacherCrossSchoolId],
      messagePrefix: 'cross-school',
      attachFile: false,
    });
    crossSchoolConversationId = crossConversation.conversationId;

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
  });

  afterAll(async () => {
    try {
      await cleanupCloseoutData();
    } finally {
      if (app) await app.close();
      if (prisma) await prisma.$disconnect();
    }
  });

  it('registers the Sprint 7D Teacher App route set and keeps deferred routes absent', async () => {
    const routes = listRegisteredTeacherRoutes();

    expect(routes).toEqual([
      'GET /api/v1/teacher/classroom/:classId',
      'GET /api/v1/teacher/classroom/:classId/assignments',
      'GET /api/v1/teacher/classroom/:classId/assignments/:assignmentId',
      'GET /api/v1/teacher/classroom/:classId/assignments/:assignmentId/submissions',
      'GET /api/v1/teacher/classroom/:classId/assignments/:assignmentId/submissions/:submissionId',
      'GET /api/v1/teacher/classroom/:classId/attendance/roster',
      'GET /api/v1/teacher/classroom/:classId/attendance/sessions/:sessionId',
      'GET /api/v1/teacher/classroom/:classId/grades/assessments',
      'GET /api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId',
      'GET /api/v1/teacher/classroom/:classId/grades/gradebook',
      'GET /api/v1/teacher/classroom/:classId/roster',
      'GET /api/v1/teacher/home',
      'GET /api/v1/teacher/messages/conversations',
      'GET /api/v1/teacher/messages/conversations/:conversationId',
      'GET /api/v1/teacher/messages/conversations/:conversationId/messages',
      'GET /api/v1/teacher/my-classes',
      'GET /api/v1/teacher/my-classes/:classId',
      'GET /api/v1/teacher/profile',
      'GET /api/v1/teacher/profile/employment',
      'GET /api/v1/teacher/settings/about',
      'GET /api/v1/teacher/settings/contact',
      'GET /api/v1/teacher/tasks',
      'GET /api/v1/teacher/tasks/:taskId',
      'GET /api/v1/teacher/tasks/dashboard',
      'GET /api/v1/teacher/tasks/review-queue',
      'GET /api/v1/teacher/tasks/review-queue/:submissionId',
      'GET /api/v1/teacher/tasks/selectors',
      'GET /api/v1/teacher/xp/classes/:classId',
      'GET /api/v1/teacher/xp/dashboard',
      'GET /api/v1/teacher/xp/students/:studentId',
      'GET /api/v1/teacher/xp/students/:studentId/history',
      'PATCH /api/v1/teacher/classroom/:classId/assignments/:assignmentId/submissions/:submissionId/answers/:answerId/review',
      'POST /api/v1/teacher/classroom/:classId/assignments/:assignmentId/submissions/:submissionId/review/finalize',
      'POST /api/v1/teacher/classroom/:classId/assignments/:assignmentId/submissions/:submissionId/sync-grade-item',
      'POST /api/v1/teacher/classroom/:classId/attendance/session/resolve',
      'POST /api/v1/teacher/classroom/:classId/attendance/sessions/:sessionId/submit',
      'POST /api/v1/teacher/messages/conversations/:conversationId/messages',
      'POST /api/v1/teacher/messages/conversations/:conversationId/read',
      'POST /api/v1/teacher/tasks',
      'POST /api/v1/teacher/tasks/review-queue/:submissionId/approve',
      'POST /api/v1/teacher/tasks/review-queue/:submissionId/reject',
      'PUT /api/v1/teacher/classroom/:classId/assignments/:assignmentId/submissions/:submissionId/answers/review',
      'PUT /api/v1/teacher/classroom/:classId/attendance/sessions/:sessionId/entries',
    ]);

    for (const absentRoute of [
      'GET /api/v1/teacher/schedule',
      'GET /api/v1/teacher/schedule/week',
      'GET /api/v1/teacher/homeworks',
      'POST /api/v1/teacher/xp/bonus',
      'GET /api/v1/teacher/messages/contacts',
      'POST /api/v1/teacher/messages/conversations',
      'POST /api/v1/teacher/messages/conversations/:conversationId/attachments',
      'POST /api/v1/teacher/messages/conversations/:conversationId/audio',
      'PUT /api/v1/teacher/profile',
      'POST /api/v1/teacher/profile/avatar',
      'PUT /api/v1/teacher/settings',
      'GET /api/v1/teacher/settings/privacy',
      'POST /api/v1/teacher/settings/support-ticket',
      'POST /api/v1/teacher/settings/app-rating',
      'GET /api/v1/teacher/announcements',
      'GET /api/v1/teacher/notifications',
    ]) {
      expect(routes).not.toContain(absentRoute);
    }

    const { accessToken } = await login(teacherAEmail);
    for (const route of [
      '/teacher/schedule',
      '/teacher/schedule/week',
      '/teacher/homeworks',
      `/teacher/homeworks/classes/${ownFixture.allocationId}/assignments`,
      '/teacher/messages/contacts',
      '/teacher/settings/privacy',
      '/teacher/announcements',
      '/teacher/notifications',
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}${route}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    }

    for (const route of [
      '/teacher/xp/bonus',
      '/teacher/messages/conversations',
      `/teacher/messages/conversations/${ownConversationId}/attachments`,
      `/teacher/messages/conversations/${ownConversationId}/messages/audio`,
      '/teacher/profile/avatar',
      '/teacher/settings/support-ticket',
      '/teacher/settings/app-rating',
    ]) {
      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}${route}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(404);
    }
  });

  it('covers Teacher Home summaries and non-teacher denial', async () => {
    const { accessToken } = await login(teacherAEmail);

    const home = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/home`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(home.body.teacher).toMatchObject({
      id: teacherAId,
      email: teacherAEmail,
      userType: 'teacher',
    });
    expect(home.body.summary).toMatchObject({
      classesCount: 1,
      studentsCount: 2,
      pendingTasksCount: expect.any(Number),
      unreadMessagesCount: expect.any(Number),
    });
    expect(home.body.schedule).toEqual({
      available: false,
      reason: 'timetable_not_available',
      items: [],
    });
    expect(home.body.userInfo).toMatchObject({
      id: teacherAId,
      email: teacherAEmail,
      userType: 'teacher',
      points: 0,
    });
    expect(Array.isArray(home.body.stats)).toBe(true);
    expect(Array.isArray(home.body.weeklySchedule)).toBe(true);
    expect(Array.isArray(home.body.actionSummaries)).toBe(true);
    expect(home.body.tasks).toMatchObject({
      activeTasksCount: 2,
      pendingReviewCount: 2,
      recentTasks: expect.any(Array),
    });
    expect(home.body.xp).toMatchObject({
      studentsCount: 2,
      totalXp: 30,
      averageXp: 15,
    });
    expect(home.body.messages).toMatchObject({
      unreadConversationsCount: expect.any(Number),
      unreadMessagesCount: expect.any(Number),
      recentConversations: expect.any(Array),
    });
    expectSafeTeacherPayload(home.body);

    for (const email of [adminEmail, parentEmail, studentEmail]) {
      const actor = await login(email);
      for (const route of [
        '/teacher/home',
        '/teacher/tasks/dashboard',
        '/teacher/xp/dashboard',
        '/teacher/messages/conversations',
        '/teacher/profile',
        '/teacher/settings/about',
      ]) {
        const response = await request(app.getHttpServer())
          .get(`${GLOBAL_PREFIX}${route}`)
          .set('Authorization', `Bearer ${actor.accessToken}`)
          .expect(403);
        expect(response.body?.error?.code).toBe(
          'teacher_app.actor.required_teacher',
        );
      }
    }
  });

  it('covers Teacher Tasks create/read and review queue actions without XP or behavior side effects', async () => {
    const { accessToken } = await login(teacherAEmail);

    const dashboard = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/tasks/dashboard`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(dashboard.body.summary.totalTasks).toBe(2);
    expect(dashboard.body.summary.underReviewTasks).toBe(2);
    expect(dashboard.body.byClass).toEqual([
      expect.objectContaining({
        classId: ownFixture.allocationId,
        studentsCount: 2,
        underReviewCount: 2,
      }),
    ]);
    expectSafeTeacherPayload(dashboard.body);

    const selectors = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/tasks/selectors`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(selectors.body.classes).toEqual([
      expect.objectContaining({
        classId: ownFixture.allocationId,
        subjectId: ownFixture.subjectId,
        studentsCount: 2,
      }),
    ]);
    expect(selectors.body.students.map((student: { studentId: string }) => student.studentId)).toEqual(
      ownFixture.studentIds,
    );
    expect(selectors.body.rewardTypes).toEqual(['moral', 'financial']);
    expectSafeTeacherPayload(selectors.body);

    const list = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/tasks`)
      .query({ limit: 20 })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const listedTaskIds = list.body.tasks.map(
      (task: { taskId: string }) => task.taskId,
    );
    expect(listedTaskIds).toEqual(
      expect.arrayContaining([
        ownReviewApprove.taskId,
        ownReviewReject.taskId,
      ]),
    );
    expect(listedTaskIds).not.toContain(otherTeacherTask.taskId);
    expect(listedTaskIds).not.toContain(crossSchoolTask.taskId);
    expect(list.body.tasks[0].target.classId).toBe(ownFixture.allocationId);
    expectSafeTeacherPayload(list.body);

    const detail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/tasks/${ownReviewApprove.taskId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(detail.body.task).toMatchObject({
      taskId: ownReviewApprove.taskId,
      source: 'teacher',
      status: 'underReview',
      target: {
        classId: ownFixture.allocationId,
        studentId: ownFixture.studentIds[0],
      },
    });
    expect(detail.body.task.stages[0]).toMatchObject({
      stageId: ownReviewApprove.stageId,
      proofType: 'image',
    });
    expect(detail.body.task.submissions[0]).toMatchObject({
      submissionId: ownReviewApprove.submissionId,
      assignmentId: ownReviewApprove.assignmentId,
      proofFile: expect.objectContaining({
        downloadPath: expect.stringMatching(/^\/api\/v1\/files\/.+\/download$/),
      }),
    });
    expectSafeTeacherPayload(detail.body);

    const beforeTaskCreateXpCount = await prisma.xpLedger.count({
      where: { schoolId: schoolAId },
    });
    const beforeTaskCreateBehaviorPointCount =
      await prisma.behaviorPointLedger.count({
        where: { schoolId: schoolAId },
      });
    const beforeTaskCreateBehaviorRecordCount =
      await prisma.behaviorRecord.count({
        where: { schoolId: schoolAId },
      });

    const created = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/teacher/tasks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: `${testMarker}-teacher-created-task`,
        description: `${testMarker}-teacher-created-task-description`,
        classIds: [ownFixture.allocationId],
        studentIds: [ownFixture.studentIds[1]],
        stages: [
          {
            title: `${testMarker}-teacher-created-stage`,
            order: 1,
            proofType: 'none',
          },
        ],
        reward: { type: 'none' },
        dueAt: '2026-09-20T00:00:00.000Z',
      })
      .expect(201);
    await trackCreatedReinforcementTaskTree(created.body.task.taskId);
    expect(created.body.task).toMatchObject({
      title: `${testMarker}-teacher-created-task`,
      source: 'teacher',
      target: {
        classId: ownFixture.allocationId,
        studentId: ownFixture.studentIds[1],
      },
      reward: {
        type: null,
        value: null,
        label: null,
      },
    });
    expectSafeTeacherPayload(created.body);

    await expectSchoolCounts({
      xpLedgerCount: beforeTaskCreateXpCount,
      behaviorPointLedgerCount: beforeTaskCreateBehaviorPointCount,
      behaviorRecordCount: beforeTaskCreateBehaviorRecordCount,
    });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/teacher/tasks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: `${testMarker}-forbidden-class-task`,
        classIds: [otherTeacherFixture.allocationId],
      })
      .expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/teacher/tasks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: `${testMarker}-forbidden-student-task`,
        classIds: [ownFixture.allocationId],
        studentIds: [otherTeacherFixture.studentIds[0]],
      })
      .expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/tasks/${otherTeacherTask.taskId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/tasks/${crossSchoolTask.taskId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    const queue = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/tasks/review-queue`)
      .query({ limit: 20 })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const queueSubmissionIds = queue.body.items.map(
      (item: { submissionId: string }) => item.submissionId,
    );
    expect(queueSubmissionIds).toEqual(
      expect.arrayContaining([
        ownReviewApprove.submissionId,
        ownReviewReject.submissionId,
      ]),
    );
    expect(queueSubmissionIds).not.toContain(otherTeacherTask.submissionId);
    expect(queueSubmissionIds).not.toContain(crossSchoolTask.submissionId);
    expect(queue.body.items[0].class.classId).toBe(ownFixture.allocationId);
    expectSafeTeacherPayload(queue.body);

    const reviewDetail = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/tasks/review-queue/${ownReviewApprove.submissionId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(reviewDetail.body.submission).toMatchObject({
      submissionId: ownReviewApprove.submissionId,
      taskId: ownReviewApprove.taskId,
      status: 'submitted',
      review: {
        status: 'pending',
      },
    });
    expectSafeTeacherPayload(reviewDetail.body);

    const beforeReviewXpCount = await prisma.xpLedger.count({
      where: { schoolId: schoolAId },
    });
    const beforeReviewBehaviorPointCount =
      await prisma.behaviorPointLedger.count({
        where: { schoolId: schoolAId },
      });

    const approved = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/tasks/review-queue/${ownReviewApprove.submissionId}/approve`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ comment: `${testMarker}-approved` })
      .expect(201);
    expect(approved.body.submission).toMatchObject({
      submissionId: ownReviewApprove.submissionId,
      status: 'approved',
      review: {
        status: 'approved',
        comment: `${testMarker}-approved`,
      },
    });
    expectSafeTeacherPayload(approved.body);

    const rejected = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/tasks/review-queue/${ownReviewReject.submissionId}/reject`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: `${testMarker}-rejected` })
      .expect(201);
    expect(rejected.body.submission).toMatchObject({
      submissionId: ownReviewReject.submissionId,
      status: 'rejected',
      review: {
        status: 'rejected',
        comment: `${testMarker}-rejected`,
      },
    });
    expectSafeTeacherPayload(rejected.body);

    expect(await prisma.xpLedger.count({ where: { schoolId: schoolAId } })).toBe(
      beforeReviewXpCount,
    );
    expect(
      await prisma.behaviorPointLedger.count({ where: { schoolId: schoolAId } }),
    ).toBe(beforeReviewBehaviorPointCount);

    for (const submissionId of [
      otherTeacherTask.submissionId,
      crossSchoolTask.submissionId,
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/teacher/tasks/review-queue/${submissionId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .post(
          `${GLOBAL_PREFIX}/teacher/tasks/review-queue/${submissionId}/approve`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ comment: `${testMarker}-forbidden-review` })
        .expect(404);
    }
  });

  it('covers Teacher XP Center read APIs from XP ledger only', async () => {
    const { accessToken } = await login(teacherAEmail);
    const beforeLedgerCount = await prisma.xpLedger.count({
      where: { schoolId: schoolAId },
    });

    const dashboard = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/xp/dashboard`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(dashboard.body.summary).toMatchObject({
      studentsCount: 2,
      totalXp: 30,
      averageXp: 15,
      recentActivityCount: 1,
    });
    expect(dashboard.body.byClass).toEqual([
      expect.objectContaining({
        classId: ownFixture.allocationId,
        studentsCount: 2,
        totalXp: 30,
        averageXp: 15,
      }),
    ]);
    expect(dashboard.body.recentActivity).toEqual([
      expect.objectContaining({
        studentId: ownFixture.studentIds[0],
        amount: 30,
        sourceType: 'reinforcement_task',
      }),
    ]);
    expect(JSON.stringify(dashboard.body)).not.toContain(
      `${testMarker}-behavior-points`,
    );
    expectSafeTeacherPayload(dashboard.body);

    const classXp = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/xp/classes/${ownFixture.allocationId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(classXp.body).toMatchObject({
      classId: ownFixture.allocationId,
      students: expect.arrayContaining([
        expect.objectContaining({
          studentId: ownFixture.studentIds[0],
          totalXp: 30,
          rank: null,
          tier: null,
          level: null,
        }),
        expect.objectContaining({
          studentId: ownFixture.studentIds[1],
          totalXp: 0,
          rank: null,
          tier: null,
          level: null,
        }),
      ]),
      summary: expect.objectContaining({
        classId: ownFixture.allocationId,
        totalXp: 30,
      }),
    });
    expectSafeTeacherPayload(classXp.body);

    const studentXp = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/xp/students/${ownFixture.studentIds[0]}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(studentXp.body).toMatchObject({
      studentId: ownFixture.studentIds[0],
      totalXp: 30,
      rank: null,
      tier: null,
      level: null,
      recentActivity: [
        expect.objectContaining({
          amount: 30,
          sourceType: 'reinforcement_task',
        }),
      ],
    });
    expectSafeTeacherPayload(studentXp.body);

    const history = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/xp/students/${ownFixture.studentIds[0]}/history`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(history.body).toMatchObject({
      studentId: ownFixture.studentIds[0],
      items: [
        expect.objectContaining({
          amount: 30,
          sourceType: 'reinforcement_task',
        }),
      ],
      pagination: {
        page: 1,
        limit: 20,
        total: 1,
      },
    });
    expectSafeTeacherPayload(history.body);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/xp/classes/${otherTeacherFixture.allocationId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/xp/students/${otherTeacherFixture.studentIds[0]}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/xp/students/${crossSchoolFixture.studentIds[0]}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/teacher/xp/bonus`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ studentId: ownFixture.studentIds[0], xpValue: 10 })
      .expect(404);

    expect(await prisma.xpLedger.count({ where: { schoolId: schoolAId } })).toBe(
      beforeLedgerCount,
    );
  });

  it('covers Teacher Profile, Settings, and Messages without mutations or discovery routes', async () => {
    const { accessToken } = await login(teacherAEmail);

    const profile = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/profile`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(profile.body).toMatchObject({
      teacher: {
        userId: teacherAId,
        email: teacherAEmail,
        avatarUrl: null,
        userType: 'teacher',
      },
      school: {
        name: `Sprint 7D Academy ${suffix}`,
        logoUrl: null,
      },
      classesSummary: {
        classesCount: 1,
        subjectsCount: 1,
        studentsCount: 2,
      },
    });
    expectSafeTeacherPayload(profile.body);

    const employment = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/profile/employment`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(employment.body).toEqual({
      employment: {
        employeeId: null,
        department: null,
        specialization: null,
        employmentType: null,
        joiningDate: null,
        officeHours: null,
        manager: null,
        status: 'unsupported',
      },
      reason: 'teacher_employment_profile_not_available',
    });
    expectSafeTeacherPayload(employment.body);

    const about = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/settings/about`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(about.body).toMatchObject({
      app: {
        name: 'Moazez',
        version: null,
        environment: null,
      },
      legal: {
        termsUrl: null,
        privacyUrl: null,
        status: 'not_configured',
      },
      unsupported: {
        privacySettings: true,
        appPreferences: true,
        supportTickets: true,
        rating: true,
      },
    });
    expectSafeTeacherPayload(about.body);

    const contact = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/settings/contact`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(contact.body).toEqual({
      school: {
        name: `Sprint 7D Academy ${suffix}`,
        email: null,
        phone: null,
        address: `Sprint 7D Address ${suffix}`,
      },
      support: {
        email: null,
        phone: null,
        status: 'not_configured',
      },
    });
    expectSafeTeacherPayload(contact.body);

    for (const route of [
      '/teacher/profile',
      '/teacher/settings',
      '/teacher/settings/privacy',
      '/teacher/settings/preferences',
    ]) {
      await request(app.getHttpServer())
        .put(`${GLOBAL_PREFIX}${route}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(404);
    }

    const conversations = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/messages/conversations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const conversationIds = conversations.body.conversations.map(
      (conversation: { conversationId: string }) =>
        conversation.conversationId,
    );
    expect(conversationIds).toContain(ownConversationId);
    expect(conversationIds).not.toContain(otherTeacherConversationId);
    expect(conversationIds).not.toContain(crossSchoolConversationId);
    expect(conversations.body.summary.unreadMessagesCount).toBeGreaterThanOrEqual(
      1,
    );
    expectSafeTeacherPayload(conversations.body);

    const conversation = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/messages/conversations/${ownConversationId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(conversation.body.conversation).toMatchObject({
      conversationId: ownConversationId,
      type: 'direct',
      status: 'active',
      participants: expect.arrayContaining([
        expect.objectContaining({
          userId: teacherAId,
          isMe: true,
        }),
        expect.objectContaining({
          userId: parentUserId,
          isMe: false,
        }),
      ]),
    });
    expectSafeTeacherPayload(conversation.body);

    const messages = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/messages/conversations/${ownConversationId}/messages`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(messages.body).toMatchObject({
      conversationId: ownConversationId,
      messages: expect.arrayContaining([
        expect.objectContaining({
          messageId: ownVisibleMessageId,
          type: 'text',
          attachments: [
            expect.objectContaining({
              downloadPath: expect.stringMatching(
                /^\/api\/v1\/files\/.+\/download$/,
              ),
            }),
          ],
        }),
      ]),
    });
    expectSafeTeacherPayload(messages.body);

    const messageCountBeforeAudioAttempt = await prisma.communicationMessage.count({
      where: { conversationId: ownConversationId },
    });
    const sent = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/messages/conversations/${ownConversationId}/messages`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ body: `${testMarker}-teacher-text-message` })
      .expect(201);
    createdCommunicationMessageIds.push(sent.body.message.messageId);
    expect(sent.body.message).toMatchObject({
      type: 'text',
      body: `${testMarker}-teacher-text-message`,
      sender: {
        userId: teacherAId,
        isMe: true,
      },
      attachments: [],
    });
    expectSafeTeacherPayload(sent.body);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/messages/conversations/${ownConversationId}/messages`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        body: `${testMarker}-audio-attempt`,
        type: 'audio',
        audioUrl: `${testMarker}-raw-audio-key`,
      })
      .expect(400);
    expect(
      await prisma.communicationMessage.count({
        where: { conversationId: ownConversationId },
      }),
    ).toBe(messageCountBeforeAudioAttempt + 1);

    const read = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/messages/conversations/${ownConversationId}/read`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    expect(read.body).toMatchObject({
      conversationId: ownConversationId,
      markedCount: expect.any(Number),
    });

    for (const conversationId of [
      otherTeacherConversationId,
      crossSchoolConversationId,
    ]) {
      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/teacher/messages/conversations/${conversationId}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/teacher/messages/conversations/${conversationId}/messages`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .post(
          `${GLOBAL_PREFIX}/teacher/messages/conversations/${conversationId}/messages`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ body: `${testMarker}-forbidden-message` })
        .expect(404);
    }
  });

  async function findSystemRole(key: string): Promise<{ id: string }> {
    const role = await prisma.role.findFirst({
      where: { key, schoolId: null, isSystem: true },
      select: { id: true },
    });
    if (!role) throw new Error(`${key} system role not found - run seed.`);
    return role;
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
    createdUserIds.push(user.id);

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

  async function createActiveAcademicContext(params: {
    schoolId: string;
    marker: string;
  }): Promise<AcademicContext> {
    const year = await prisma.academicYear.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `S7D ${suffix} ${params.marker} Year AR`,
        nameEn: `S7D ${suffix} ${params.marker} Year`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    createdAcademicYearIds.push(year.id);

    const termName = `S7D ${suffix} ${params.marker} Term`;
    const term = await prisma.term.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: year.id,
        nameAr: `${termName} AR`,
        nameEn: termName,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    createdTermIds.push(term.id);

    return {
      academicYearId: year.id,
      termId: term.id,
      termName,
    };
  }

  async function createAcademicFixture(params: {
    organizationId: string;
    schoolId: string;
    context: AcademicContext;
    teacherUserId: string;
    marker: string;
    studentCount: number;
  }): Promise<AcademicFixture> {
    const stageName = `S7D ${suffix} ${params.marker} Stage`;
    const stage = await prisma.stage.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${stageName} AR`,
        nameEn: stageName,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdStageIds.push(stage.id);

    const gradeName = `S7D ${suffix} ${params.marker} Grade`;
    const grade = await prisma.grade.create({
      data: {
        schoolId: params.schoolId,
        stageId: stage.id,
        nameAr: `${gradeName} AR`,
        nameEn: gradeName,
        sortOrder: 1,
        capacity: 30,
      },
      select: { id: true },
    });
    createdGradeIds.push(grade.id);

    const sectionName = `S7D ${suffix} ${params.marker} Section`;
    const section = await prisma.section.create({
      data: {
        schoolId: params.schoolId,
        gradeId: grade.id,
        nameAr: `${sectionName} AR`,
        nameEn: sectionName,
        sortOrder: 1,
        capacity: 30,
      },
      select: { id: true },
    });
    createdSectionIds.push(section.id);

    const room = await prisma.room.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `S7D ${suffix} ${params.marker} Room AR`,
        nameEn: `S7D ${suffix} ${params.marker} Room`,
        building: 'Main',
        floor: '1',
        capacity: 30,
        isActive: true,
      },
      select: { id: true },
    });
    createdRoomIds.push(room.id);

    const classroomName = `S7D ${suffix} ${params.marker} Classroom`;
    const classroom = await prisma.classroom.create({
      data: {
        schoolId: params.schoolId,
        sectionId: section.id,
        roomId: room.id,
        nameAr: `${classroomName} AR`,
        nameEn: classroomName,
        sortOrder: 1,
        capacity: 30,
      },
      select: { id: true },
    });
    createdClassroomIds.push(classroom.id);

    const subjectName = `S7D ${suffix} ${params.marker} Subject`;
    const subject = await prisma.subject.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${subjectName} AR`,
        nameEn: subjectName,
        code: `S7D-${suffix}-${params.marker}`.toUpperCase(),
        isActive: true,
      },
      select: { id: true },
    });
    createdSubjectIds.push(subject.id);

    const allocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId: params.schoolId,
        teacherUserId: params.teacherUserId,
        subjectId: subject.id,
        classroomId: classroom.id,
        termId: params.context.termId,
      },
      select: { id: true },
    });
    createdAllocationIds.push(allocation.id);

    const studentIds: string[] = [];
    const enrollmentIds: string[] = [];
    for (let index = 0; index < params.studentCount; index += 1) {
      const student = await prisma.student.create({
        data: {
          schoolId: params.schoolId,
          organizationId: params.organizationId,
          firstName: `S7D ${params.marker} Student`,
          lastName: String(index + 1),
          status: StudentStatus.ACTIVE,
        },
        select: { id: true },
      });
      createdStudentIds.push(student.id);
      studentIds.push(student.id);

      const enrollment = await prisma.enrollment.create({
        data: {
          schoolId: params.schoolId,
          studentId: student.id,
          academicYearId: params.context.academicYearId,
          termId: params.context.termId,
          classroomId: classroom.id,
          status: StudentEnrollmentStatus.ACTIVE,
          enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
        },
        select: { id: true },
      });
      createdEnrollmentIds.push(enrollment.id);
      enrollmentIds.push(enrollment.id);
    }

    return {
      ...params.context,
      allocationId: allocation.id,
      classroomId: classroom.id,
      classroomName,
      subjectId: subject.id,
      subjectName,
      stageId: stage.id,
      stageName,
      gradeId: grade.id,
      gradeName,
      sectionId: section.id,
      sectionName,
      studentIds,
      enrollmentIds,
    };
  }

  async function createBehaviorPointFixture(params: {
    schoolId: string;
    fixture: AcademicFixture;
    studentIndex: number;
  }): Promise<void> {
    const category = await prisma.behaviorCategory.create({
      data: {
        schoolId: params.schoolId,
        code: `${testMarker}-behavior-category`,
        nameEn: `${testMarker}-behavior-category`,
        type: BehaviorRecordType.POSITIVE,
        defaultSeverity: BehaviorSeverity.LOW,
        defaultPoints: 99,
        isActive: true,
      },
      select: { id: true },
    });
    createdBehaviorCategoryIds.push(category.id);

    const record = await prisma.behaviorRecord.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.fixture.academicYearId,
        termId: params.fixture.termId,
        studentId: params.fixture.studentIds[params.studentIndex],
        enrollmentId: params.fixture.enrollmentIds[params.studentIndex],
        categoryId: category.id,
        type: BehaviorRecordType.POSITIVE,
        severity: BehaviorSeverity.LOW,
        status: BehaviorRecordStatus.APPROVED,
        titleEn: `${testMarker}-behavior-record`,
        points: 99,
        occurredAt: new Date('2026-09-16T09:00:00.000Z'),
        createdById: teacherAId,
        submittedById: teacherAId,
        submittedAt: new Date('2026-09-16T09:01:00.000Z'),
        reviewedById: teacherAId,
        reviewedAt: new Date('2026-09-16T09:02:00.000Z'),
      },
      select: { id: true },
    });
    createdBehaviorRecordIds.push(record.id);

    const ledger = await prisma.behaviorPointLedger.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.fixture.academicYearId,
        termId: params.fixture.termId,
        studentId: params.fixture.studentIds[params.studentIndex],
        enrollmentId: params.fixture.enrollmentIds[params.studentIndex],
        recordId: record.id,
        categoryId: category.id,
        entryType: BehaviorPointLedgerEntryType.AWARD,
        amount: 99,
        reasonEn: `${testMarker}-behavior-points`,
        actorId: teacherAId,
        occurredAt: new Date('2026-09-16T09:03:00.000Z'),
      },
      select: { id: true },
    });
    createdBehaviorPointLedgerIds.push(ledger.id);
  }

  async function createTaskFixture(params: {
    schoolId: string;
    fixture: AcademicFixture;
    teacherUserId: string;
    marker: string;
    studentIndex: number;
    status: ReinforcementTaskStatus;
    withProofFile: boolean;
  }): Promise<TaskFixture> {
    const task = await prisma.reinforcementTask.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.fixture.academicYearId,
        termId: params.fixture.termId,
        subjectId: params.fixture.subjectId,
        titleEn: `${testMarker}-${params.marker}-task`,
        descriptionEn: `${testMarker}-${params.marker}-description`,
        source: ReinforcementSource.TEACHER,
        status: params.status,
        rewardType: ReinforcementRewardType.MORAL,
        rewardLabelEn: `${testMarker}-${params.marker}-reward`,
        dueDate: new Date('2026-09-20T00:00:00.000Z'),
        assignedById: params.teacherUserId,
        assignedByName: `${params.marker} teacher`,
        createdById: params.teacherUserId,
      },
      select: { id: true },
    });
    createdReinforcementTaskIds.push(task.id);

    const target = await prisma.reinforcementTaskTarget.create({
      data: {
        schoolId: params.schoolId,
        taskId: task.id,
        scopeType: ReinforcementTargetScope.STUDENT,
        scopeKey: params.fixture.studentIds[params.studentIndex],
        classroomId: params.fixture.classroomId,
        studentId: params.fixture.studentIds[params.studentIndex],
      },
      select: { id: true },
    });
    createdReinforcementTargetIds.push(target.id);

    const stage = await prisma.reinforcementTaskStage.create({
      data: {
        schoolId: params.schoolId,
        taskId: task.id,
        sortOrder: 1,
        titleEn: `${testMarker}-${params.marker}-stage`,
        proofType: params.withProofFile
          ? ReinforcementProofType.IMAGE
          : ReinforcementProofType.NONE,
        requiresApproval: true,
      },
      select: { id: true },
    });
    createdReinforcementStageIds.push(stage.id);

    const assignment = await prisma.reinforcementAssignment.create({
      data: {
        schoolId: params.schoolId,
        taskId: task.id,
        academicYearId: params.fixture.academicYearId,
        termId: params.fixture.termId,
        studentId: params.fixture.studentIds[params.studentIndex],
        enrollmentId: params.fixture.enrollmentIds[params.studentIndex],
        status: params.status,
        progress: 50,
      },
      select: { id: true },
    });
    createdReinforcementAssignmentIds.push(assignment.id);

    let proofFileId: string | null = null;
    if (params.withProofFile) {
      const objectKey = `${testMarker}-${params.marker}-raw-storage-key`;
      const bucket = `${testMarker}-${params.marker}-private-bucket`;
      privateMarkers.add(objectKey);
      privateMarkers.add(bucket);
      const file = await prisma.file.create({
        data: {
          schoolId: params.schoolId,
          uploaderId: params.teacherUserId,
          bucket,
          objectKey,
          originalName: `${params.marker}-proof.png`,
          mimeType: 'image/png',
          sizeBytes: BigInt(1234),
          visibility: FileVisibility.PRIVATE,
        },
        select: { id: true },
      });
      createdFileIds.push(file.id);
      proofFileId = file.id;
    }

    const submission = await prisma.reinforcementSubmission.create({
      data: {
        schoolId: params.schoolId,
        assignmentId: assignment.id,
        taskId: task.id,
        stageId: stage.id,
        studentId: params.fixture.studentIds[params.studentIndex],
        enrollmentId: params.fixture.enrollmentIds[params.studentIndex],
        status: ReinforcementSubmissionStatus.SUBMITTED,
        proofFileId,
        proofText: `${testMarker}-${params.marker}-proof-text`,
        submittedById: params.teacherUserId,
        submittedAt: new Date('2026-09-16T10:00:00.000Z'),
      },
      select: { id: true },
    });
    createdReinforcementSubmissionIds.push(submission.id);

    return {
      taskId: task.id,
      stageId: stage.id,
      assignmentId: assignment.id,
      submissionId: submission.id,
    };
  }

  async function createXpLedgerFixture(params: {
    schoolId: string;
    fixture: AcademicFixture;
    studentIndex: number;
    sourceId: string;
    amount: number;
    reason: string;
  }): Promise<void> {
    const ledger = await prisma.xpLedger.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.fixture.academicYearId,
        termId: params.fixture.termId,
        studentId: params.fixture.studentIds[params.studentIndex],
        enrollmentId: params.fixture.enrollmentIds[params.studentIndex],
        sourceType: XpSourceType.REINFORCEMENT_TASK,
        sourceId: params.sourceId,
        amount: params.amount,
        reason: params.reason,
        occurredAt: new Date('2026-09-17T10:00:00.000Z'),
      },
      select: { id: true },
    });
    createdXpLedgerIds.push(ledger.id);
  }

  async function createMessageConversationFixture(params: {
    schoolId: string;
    title: string | null;
    participantUserIds: string[];
    messagePrefix: string;
    attachFile: boolean;
  }): Promise<{ conversationId: string; visibleMessageId: string }> {
    const conversation = await prisma.communicationConversation.create({
      data: {
        schoolId: params.schoolId,
        type: CommunicationConversationType.DIRECT,
        status: CommunicationConversationStatus.ACTIVE,
        titleEn: params.title,
        lastMessageAt: new Date('2026-09-18T10:00:00.000Z'),
      },
      select: { id: true },
    });
    createdCommunicationConversationIds.push(conversation.id);

    for (const userId of params.participantUserIds) {
      const participant =
        await prisma.communicationConversationParticipant.create({
          data: {
            schoolId: params.schoolId,
            conversationId: conversation.id,
            userId,
            role: CommunicationParticipantRole.MEMBER,
            status: CommunicationParticipantStatus.ACTIVE,
          },
          select: { id: true },
        });
      createdCommunicationParticipantIds.push(participant.id);
    }

    const senderUserId =
      params.participantUserIds[1] ?? params.participantUserIds[0];
    const visibleMessage = await prisma.communicationMessage.create({
      data: {
        schoolId: params.schoolId,
        conversationId: conversation.id,
        senderUserId,
        kind: CommunicationMessageKind.TEXT,
        status: CommunicationMessageStatus.SENT,
        body: `${testMarker}-${params.messagePrefix}-visible-message`,
        sentAt: new Date('2026-09-18T10:00:00.000Z'),
      },
      select: { id: true },
    });
    createdCommunicationMessageIds.push(visibleMessage.id);

    if (params.attachFile) {
      const objectKey = `${testMarker}-${params.messagePrefix}-message-object-key`;
      const bucket = `${testMarker}-${params.messagePrefix}-message-bucket`;
      privateMarkers.add(objectKey);
      privateMarkers.add(bucket);
      const file = await prisma.file.create({
        data: {
          schoolId: params.schoolId,
          uploaderId: senderUserId,
          bucket,
          objectKey,
          originalName: `${params.messagePrefix}-message-file.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: BigInt(4321),
          visibility: FileVisibility.PRIVATE,
        },
        select: { id: true },
      });
      createdFileIds.push(file.id);

      const attachment = await prisma.communicationMessageAttachment.create({
        data: {
          schoolId: params.schoolId,
          conversationId: conversation.id,
          messageId: visibleMessage.id,
          fileId: file.id,
          uploadedById: senderUserId,
          caption: `${testMarker}-${params.messagePrefix}-attachment-caption`,
          sortOrder: 1,
        },
        select: { id: true },
      });
      createdCommunicationAttachmentIds.push(attachment.id);
    }

    return {
      conversationId: conversation.id,
      visibleMessageId: visibleMessage.id,
    };
  }

  async function trackCreatedReinforcementTaskTree(
    taskId: string,
  ): Promise<void> {
    const [targets, stages, assignments, submissions] = await Promise.all([
      prisma.reinforcementTaskTarget.findMany({
        where: { taskId },
        select: { id: true },
      }),
      prisma.reinforcementTaskStage.findMany({
        where: { taskId },
        select: { id: true },
      }),
      prisma.reinforcementAssignment.findMany({
        where: { taskId },
        select: { id: true },
      }),
      prisma.reinforcementSubmission.findMany({
        where: { taskId },
        select: { id: true },
      }),
    ]);

    pushUnique(createdReinforcementTaskIds, taskId);
    for (const target of targets) pushUnique(createdReinforcementTargetIds, target.id);
    for (const stage of stages) pushUnique(createdReinforcementStageIds, stage.id);
    for (const assignment of assignments) {
      pushUnique(createdReinforcementAssignmentIds, assignment.id);
    }
    for (const submission of submissions) {
      pushUnique(createdReinforcementSubmissionIds, submission.id);
    }
  }

  async function expectSchoolCounts(expected: {
    xpLedgerCount: number;
    behaviorPointLedgerCount: number;
    behaviorRecordCount: number;
  }): Promise<void> {
    expect(await prisma.xpLedger.count({ where: { schoolId: schoolAId } })).toBe(
      expected.xpLedgerCount,
    );
    expect(
      await prisma.behaviorPointLedger.count({ where: { schoolId: schoolAId } }),
    ).toBe(expected.behaviorPointLedgerCount);
    expect(
      await prisma.behaviorRecord.count({ where: { schoolId: schoolAId } }),
    ).toBe(expected.behaviorRecordCount);
  }

  async function login(email: string): Promise<{ accessToken: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    return { accessToken: response.body.accessToken };
  }

  function listRegisteredTeacherRoutes(): string[] {
    const expressApp = app.getHttpAdapter().getInstance() as {
      _router?: { stack?: ExpressLayer[] };
      router?: { stack?: ExpressLayer[] };
    };
    const stack = expressApp._router?.stack ?? expressApp.router?.stack ?? [];
    const routes: string[] = [];

    collectRoutes(stack, routes);

    return routes.filter((route) => route.includes('/api/v1/teacher')).sort();
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

  function expectSafeTeacherPayload(value: unknown): void {
    expectNoObjectKey(value, 'schoolId');
    expectNoObjectKey(value, 'scheduleId');
    expectNoObjectKey(value, 'passwordHash');
    expectNoObjectKey(value, 'sessionId');
    expectNoObjectKey(value, 'refreshToken');
    expectNoObjectKey(value, 'objectKey');
    expectNoObjectKey(value, 'bucket');
    expectNoObjectKey(value, 'actorUserId');
    expectNoObjectKey(value, 'metadata');

    const json = JSON.stringify(value);
    for (const marker of privateMarkers) {
      expect(json).not.toContain(marker);
    }
    for (const forbidden of [
      'raw-storage-key',
      'private-bucket',
      'raw-logo-url',
      'BehaviorPointLedger',
      'behaviorPointLedger',
    ]) {
      expect(json).not.toContain(forbidden);
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

  async function cleanupCloseoutData(): Promise<void> {
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
    await prisma.communicationMessageAttachment.deleteMany({
      where: { id: { in: createdCommunicationAttachmentIds } },
    });
    await prisma.communicationMessageRead.deleteMany({
      where: { conversationId: { in: createdCommunicationConversationIds } },
    });
    await prisma.communicationConversationParticipant.updateMany({
      where: { id: { in: createdCommunicationParticipantIds } },
      data: { lastReadMessageId: null, lastReadAt: null },
    });
    await prisma.communicationMessage.deleteMany({
      where: {
        OR: [
          { id: { in: createdCommunicationMessageIds } },
          { conversationId: { in: createdCommunicationConversationIds } },
        ],
      },
    });
    await prisma.communicationConversationParticipant.deleteMany({
      where: { id: { in: createdCommunicationParticipantIds } },
    });
    await prisma.communicationConversation.deleteMany({
      where: { id: { in: createdCommunicationConversationIds } },
    });
    await prisma.xpLedger.deleteMany({
      where: { id: { in: createdXpLedgerIds } },
    });
    await prisma.reinforcementSubmission.updateMany({
      where: { id: { in: createdReinforcementSubmissionIds } },
      data: { currentReviewId: null },
    });
    await prisma.reinforcementReview.deleteMany({
      where: { submissionId: { in: createdReinforcementSubmissionIds } },
    });
    await prisma.reinforcementSubmission.deleteMany({
      where: { id: { in: createdReinforcementSubmissionIds } },
    });
    await prisma.reinforcementTaskStage.deleteMany({
      where: { id: { in: createdReinforcementStageIds } },
    });
    await prisma.reinforcementAssignment.deleteMany({
      where: { id: { in: createdReinforcementAssignmentIds } },
    });
    await prisma.reinforcementTaskTarget.deleteMany({
      where: { id: { in: createdReinforcementTargetIds } },
    });
    await prisma.reinforcementTask.deleteMany({
      where: { id: { in: createdReinforcementTaskIds } },
    });
    await prisma.file.deleteMany({
      where: { id: { in: createdFileIds } },
    });
    await prisma.behaviorPointLedger.deleteMany({
      where: { id: { in: createdBehaviorPointLedgerIds } },
    });
    await prisma.behaviorRecord.deleteMany({
      where: { id: { in: createdBehaviorRecordIds } },
    });
    await prisma.behaviorCategory.deleteMany({
      where: { id: { in: createdBehaviorCategoryIds } },
    });
    await prisma.enrollment.deleteMany({
      where: { id: { in: createdEnrollmentIds } },
    });
    await prisma.student.deleteMany({
      where: { id: { in: createdStudentIds } },
    });
    await prisma.teacherSubjectAllocation.deleteMany({
      where: { id: { in: createdAllocationIds } },
    });
    await prisma.subject.deleteMany({
      where: { id: { in: createdSubjectIds } },
    });
    await prisma.classroom.deleteMany({
      where: { id: { in: createdClassroomIds } },
    });
    await prisma.room.deleteMany({
      where: { id: { in: createdRoomIds } },
    });
    await prisma.section.deleteMany({
      where: { id: { in: createdSectionIds } },
    });
    await prisma.grade.deleteMany({
      where: { id: { in: createdGradeIds } },
    });
    await prisma.stage.deleteMany({
      where: { id: { in: createdStageIds } },
    });
    await prisma.term.deleteMany({
      where: { id: { in: createdTermIds } },
    });
    await prisma.academicYear.deleteMany({
      where: { id: { in: createdAcademicYearIds } },
    });
    await prisma.schoolProfile.deleteMany({
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

  function pushUnique(values: string[], value: string): void {
    if (!values.includes(value)) values.push(value);
  }
});
