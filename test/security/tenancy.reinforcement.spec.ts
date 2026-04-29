import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  FileVisibility,
  MembershipStatus,
  OrganizationStatus,
  Prisma,
  PrismaClient,
  ReinforcementProofType,
  ReinforcementRewardType,
  ReinforcementReviewOutcome,
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

const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';

const TENANT_B_ORG_SLUG = 'reinforcement-tenancy-org-b';
const TENANT_B_SCHOOL_SLUG = 'reinforcement-tenancy-school-b';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(45000);

describe('Reinforcement tenancy isolation (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let demoSchoolId: string;
  let demoOrganizationId: string;
  let tenantBSchoolId: string;
  let tenantBOrganizationId: string;

  let demoYearId: string;
  let demoTermId: string;
  let demoStageId: string;
  let demoGradeId: string;
  let demoSectionId: string;
  let demoClassroomId: string;
  let demoSubjectId: string;
  let demoStudentId: string;
  let demoStudentTwoId: string;
  let demoEnrollmentId: string;
  let demoEnrollmentTwoId: string;
  let demoTaskId: string;
  let demoAssignmentId: string;
  let demoTaskStageId: string;
  let demoCancelledTaskId: string;
  let demoTemplateId: string;
  let demoSubmittedSubmissionId: string;
  let demoApprovedSubmissionId: string;
  let demoXpPolicyId: string;
  let demoXpLedgerId: string;

  let tenantBYearId: string;
  let tenantBTermId: string;
  let tenantBStageId: string;
  let tenantBGradeId: string;
  let tenantBSectionId: string;
  let tenantBClassroomId: string;
  let tenantBSubjectId: string;
  let tenantBStudentId: string;
  let tenantBEnrollmentId: string;
  let tenantBTaskId: string;
  let tenantBAssignmentId: string;
  let tenantBTaskStageId: string;
  let tenantBTemplateId: string;
  let tenantBSubmittedSubmissionId: string;
  let tenantBApprovedSubmissionId: string;
  let tenantBXpPolicyId: string;
  let tenantBXpLedgerId: string;
  let tenantBProofFileId: string;

  let noAccessEmail: string;
  let taskViewerEmail: string;
  let reviewViewerEmail: string;
  let templateNoViewEmail: string;
  let templateViewerEmail: string;
  let xpViewerEmail: string;
  let teacherEmail: string;
  let parentEmail: string;
  let studentEmail: string;

  const password = 'Reinforce123!';
  const testSuffix = `reinforcement-security-${Date.now()}`;
  const createdTaskIds: string[] = [];
  const createdTemplateIds: string[] = [];
  const createdXpPolicyIds: string[] = [];
  const createdXpLedgerIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdAcademicYearIds: string[] = [];
  const createdFileIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const demoSchool = await prisma.school.findFirst({
      where: { slug: 'moazez-academy' },
      select: { id: true, organizationId: true },
    });
    if (!demoSchool) {
      throw new Error('Demo school not found - run `npm run seed` first.');
    }
    demoSchoolId = demoSchool.id;
    demoOrganizationId = demoSchool.organizationId;

    const [
      schoolAdminRole,
      teacherRole,
      parentRole,
      studentRole,
      tasksViewPermission,
      tasksManagePermission,
      templatesViewPermission,
      templatesManagePermission,
      reviewsViewPermission,
      reviewsManagePermission,
      overviewViewPermission,
      xpViewPermission,
      xpManagePermission,
    ] = await Promise.all([
      prisma.role.findFirst({
        where: { key: 'school_admin', schoolId: null, isSystem: true },
        select: { id: true },
      }),
      prisma.role.findFirst({
        where: { key: 'teacher', schoolId: null, isSystem: true },
        select: { id: true },
      }),
      prisma.role.findFirst({
        where: { key: 'parent', schoolId: null, isSystem: true },
        select: { id: true },
      }),
      prisma.role.findFirst({
        where: { key: 'student', schoolId: null, isSystem: true },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'reinforcement.tasks.view' },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'reinforcement.tasks.manage' },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'reinforcement.templates.view' },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'reinforcement.templates.manage' },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'reinforcement.reviews.view' },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'reinforcement.reviews.manage' },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'reinforcement.overview.view' },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'reinforcement.xp.view' },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'reinforcement.xp.manage' },
        select: { id: true },
      }),
    ]);

    if (
      !schoolAdminRole ||
      !teacherRole ||
      !parentRole ||
      !studentRole ||
      !tasksViewPermission ||
      !tasksManagePermission ||
      !templatesViewPermission ||
      !templatesManagePermission ||
      !reviewsViewPermission ||
      !reviewsManagePermission ||
      !overviewViewPermission ||
      !xpViewPermission ||
      !xpManagePermission
    ) {
      throw new Error('Reinforcement roles or permissions missing - run seed.');
    }

    const demoAdmin = await prisma.user.findUnique({
      where: { email: DEMO_ADMIN_EMAIL },
      select: { id: true },
    });
    if (!demoAdmin) {
      throw new Error('Demo admin not found - run `npm run seed` first.');
    }

    await prisma.membership.updateMany({
      where: {
        userId: demoAdmin.id,
        schoolId: demoSchoolId,
        deletedAt: null,
      },
      data: {
        roleId: schoolAdminRole.id,
        userType: UserType.SCHOOL_USER,
        status: MembershipStatus.ACTIVE,
        endedAt: null,
      },
    });

    const noAccessRoleId = await createCustomRole('no_access', []);
    const taskViewerRoleId = await createCustomRole('task_viewer', [
      tasksViewPermission.id,
      templatesViewPermission.id,
    ]);
    const reviewViewerRoleId = await createCustomRole('review_viewer', [
      reviewsViewPermission.id,
    ]);
    const templateNoViewRoleId = await createCustomRole('template_no_view', [
      tasksViewPermission.id,
    ]);
    const templateViewerRoleId = await createCustomRole('template_viewer', [
      templatesViewPermission.id,
    ]);
    const xpViewerRoleId = await createCustomRole('xp_viewer', [
      xpViewPermission.id,
    ]);

    noAccessEmail = `${testSuffix}-no-access@security.moazez.local`;
    taskViewerEmail = `${testSuffix}-task-viewer@security.moazez.local`;
    reviewViewerEmail = `${testSuffix}-review-viewer@security.moazez.local`;
    templateNoViewEmail = `${testSuffix}-template-no-view@security.moazez.local`;
    templateViewerEmail = `${testSuffix}-template-viewer@security.moazez.local`;
    xpViewerEmail = `${testSuffix}-xp-viewer@security.moazez.local`;
    teacherEmail = `${testSuffix}-teacher@security.moazez.local`;
    parentEmail = `${testSuffix}-parent@security.moazez.local`;
    studentEmail = `${testSuffix}-student-user@security.moazez.local`;

    await createUserWithMembership(
      noAccessEmail,
      UserType.SCHOOL_USER,
      noAccessRoleId,
    );
    await createUserWithMembership(
      taskViewerEmail,
      UserType.SCHOOL_USER,
      taskViewerRoleId,
    );
    await createUserWithMembership(
      reviewViewerEmail,
      UserType.SCHOOL_USER,
      reviewViewerRoleId,
    );
    await createUserWithMembership(
      templateNoViewEmail,
      UserType.SCHOOL_USER,
      templateNoViewRoleId,
    );
    await createUserWithMembership(
      templateViewerEmail,
      UserType.SCHOOL_USER,
      templateViewerRoleId,
    );
    await createUserWithMembership(
      xpViewerEmail,
      UserType.SCHOOL_USER,
      xpViewerRoleId,
    );
    await createUserWithMembership(teacherEmail, UserType.TEACHER, teacherRole.id);
    await createUserWithMembership(parentEmail, UserType.PARENT, parentRole.id);
    await createUserWithMembership(studentEmail, UserType.STUDENT, studentRole.id);

    const orgB = await prisma.organization.upsert({
      where: { slug: TENANT_B_ORG_SLUG },
      update: { status: OrganizationStatus.ACTIVE },
      create: {
        slug: TENANT_B_ORG_SLUG,
        name: 'Reinforcement Tenancy Org B',
        status: OrganizationStatus.ACTIVE,
      },
    });
    tenantBOrganizationId = orgB.id;

    const schoolB = await prisma.school.upsert({
      where: {
        organizationId_slug: {
          organizationId: orgB.id,
          slug: TENANT_B_SCHOOL_SLUG,
        },
      },
      update: { status: SchoolStatus.ACTIVE },
      create: {
        organizationId: orgB.id,
        slug: TENANT_B_SCHOOL_SLUG,
        name: 'Reinforcement Tenancy School B',
        status: SchoolStatus.ACTIVE,
      },
    });
    tenantBSchoolId = schoolB.id;
    await cleanupReinforcementTenantSchool(tenantBSchoolId);

    const demo = await createAcademicFixture('a', demoSchoolId, demoOrganizationId);
    demoYearId = demo.yearId;
    demoTermId = demo.termId;
    demoStageId = demo.stageId;
    demoGradeId = demo.gradeId;
    demoSectionId = demo.sectionId;
    demoClassroomId = demo.classroomId;
    demoSubjectId = demo.subjectId;
    demoStudentId = demo.studentId;
    demoStudentTwoId = demo.studentTwoId;
    demoEnrollmentId = demo.enrollmentId;
    demoEnrollmentTwoId = demo.enrollmentTwoId;

    const tenantB = await createAcademicFixture(
      'b',
      tenantBSchoolId,
      tenantBOrganizationId,
    );
    tenantBYearId = tenantB.yearId;
    tenantBTermId = tenantB.termId;
    tenantBStageId = tenantB.stageId;
    tenantBGradeId = tenantB.gradeId;
    tenantBSectionId = tenantB.sectionId;
    tenantBClassroomId = tenantB.classroomId;
    tenantBSubjectId = tenantB.subjectId;
    tenantBStudentId = tenantB.studentId;
    tenantBEnrollmentId = tenantB.enrollmentId;

    const demoTask = await createTaskFixture({
      schoolId: demoSchoolId,
      academicYearId: demoYearId,
      termId: demoTermId,
      subjectId: demoSubjectId,
      titleEn: `${testSuffix}-task-a`,
      target: {
        scopeType: ReinforcementTargetScope.STUDENT,
        scopeKey: demoStudentId,
        studentId: demoStudentId,
      },
      assignment: {
        studentId: demoStudentId,
        enrollmentId: demoEnrollmentId,
      },
    });
    demoTaskId = demoTask.taskId;
    demoTaskStageId = demoTask.stageId;
    demoAssignmentId = demoTask.assignmentId;

    const demoCancelledTask = await createTaskFixture({
      schoolId: demoSchoolId,
      academicYearId: demoYearId,
      termId: demoTermId,
      subjectId: demoSubjectId,
      titleEn: `${testSuffix}-task-a-cancelled`,
      status: ReinforcementTaskStatus.CANCELLED,
      target: {
        scopeType: ReinforcementTargetScope.STUDENT,
        scopeKey: demoStudentTwoId,
        studentId: demoStudentTwoId,
      },
      assignment: {
        studentId: demoStudentTwoId,
        enrollmentId: demoEnrollmentTwoId,
      },
    });
    demoCancelledTaskId = demoCancelledTask.taskId;

    const tenantBTask = await createTaskFixture({
      schoolId: tenantBSchoolId,
      academicYearId: tenantBYearId,
      termId: tenantBTermId,
      subjectId: tenantBSubjectId,
      titleEn: `${testSuffix}-task-b`,
      target: {
        scopeType: ReinforcementTargetScope.STUDENT,
        scopeKey: tenantBStudentId,
        studentId: tenantBStudentId,
      },
      assignment: {
        studentId: tenantBStudentId,
        enrollmentId: tenantBEnrollmentId,
      },
    });
    tenantBTaskId = tenantBTask.taskId;
    tenantBTaskStageId = tenantBTask.stageId;
    tenantBAssignmentId = tenantBTask.assignmentId;

    demoTemplateId = await createTemplateFixture(
      demoSchoolId,
      `${testSuffix}-template-a`,
    );
    tenantBTemplateId = await createTemplateFixture(
      tenantBSchoolId,
      `${testSuffix}-template-b`,
    );
    tenantBProofFileId = await createProofFileFixture(
      tenantBSchoolId,
      tenantBOrganizationId,
      'tenant-b-proof',
    );

    const demoQueueTask = await createTaskFixture({
      schoolId: demoSchoolId,
      academicYearId: demoYearId,
      termId: demoTermId,
      subjectId: demoSubjectId,
      titleEn: `${testSuffix}-queue-a`,
      target: {
        scopeType: ReinforcementTargetScope.STUDENT,
        scopeKey: demoStudentId,
        studentId: demoStudentId,
      },
      assignment: {
        studentId: demoStudentId,
        enrollmentId: demoEnrollmentId,
      },
    });
    demoSubmittedSubmissionId = await createSubmissionFixture({
      schoolId: demoSchoolId,
      taskId: demoQueueTask.taskId,
      assignmentId: demoQueueTask.assignmentId,
      stageId: demoQueueTask.stageId,
      studentId: demoStudentId,
      enrollmentId: demoEnrollmentId,
    });

    tenantBSubmittedSubmissionId = await createSubmissionFixture({
      schoolId: tenantBSchoolId,
      taskId: tenantBTaskId,
      assignmentId: tenantBAssignmentId,
      stageId: tenantBTaskStageId,
      studentId: tenantBStudentId,
      enrollmentId: tenantBEnrollmentId,
    });

    const demoApprovedTask = await createDemoTaskFixture('approved-xp-grant');
    demoApprovedSubmissionId = await createSubmissionFixture({
      schoolId: demoSchoolId,
      taskId: demoApprovedTask.taskId,
      assignmentId: demoApprovedTask.assignmentId,
      stageId: demoApprovedTask.stageId,
      studentId: demoStudentId,
      enrollmentId: demoEnrollmentId,
      status: ReinforcementSubmissionStatus.APPROVED,
    });

    const tenantBApprovedTask = await createTaskFixture({
      schoolId: tenantBSchoolId,
      academicYearId: tenantBYearId,
      termId: tenantBTermId,
      subjectId: tenantBSubjectId,
      titleEn: `${testSuffix}-approved-xp-grant-b`,
      target: {
        scopeType: ReinforcementTargetScope.STUDENT,
        scopeKey: tenantBStudentId,
        studentId: tenantBStudentId,
      },
      assignment: {
        studentId: tenantBStudentId,
        enrollmentId: tenantBEnrollmentId,
      },
    });
    tenantBApprovedSubmissionId = await createSubmissionFixture({
      schoolId: tenantBSchoolId,
      taskId: tenantBApprovedTask.taskId,
      assignmentId: tenantBApprovedTask.assignmentId,
      stageId: tenantBApprovedTask.stageId,
      studentId: tenantBStudentId,
      enrollmentId: tenantBEnrollmentId,
      status: ReinforcementSubmissionStatus.APPROVED,
    });

    demoXpPolicyId = await createXpPolicyFixture({
      schoolId: demoSchoolId,
      academicYearId: demoYearId,
      termId: demoTermId,
      scopeType: ReinforcementTargetScope.GRADE,
      scopeKey: demoGradeId,
      dailyCap: 500,
    });
    tenantBXpPolicyId = await createXpPolicyFixture({
      schoolId: tenantBSchoolId,
      academicYearId: tenantBYearId,
      termId: tenantBTermId,
      scopeType: ReinforcementTargetScope.GRADE,
      scopeKey: tenantBGradeId,
      dailyCap: 500,
    });
    demoXpLedgerId = await createXpLedgerFixture({
      schoolId: demoSchoolId,
      academicYearId: demoYearId,
      termId: demoTermId,
      studentId: demoStudentId,
      enrollmentId: demoEnrollmentId,
      sourceType: XpSourceType.MANUAL_BONUS,
      sourceId: `${testSuffix}-ledger-a`,
      amount: 5,
    });
    tenantBXpLedgerId = await createXpLedgerFixture({
      schoolId: tenantBSchoolId,
      academicYearId: tenantBYearId,
      termId: tenantBTermId,
      studentId: tenantBStudentId,
      enrollmentId: tenantBEnrollmentId,
      sourceType: XpSourceType.MANUAL_BONUS,
      sourceId: `${testSuffix}-ledger-b`,
      amount: 99,
    });

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
    if (app) await app.close();
    if (prisma) {
      await prisma.xpLedger.deleteMany({
        where: { id: { in: createdXpLedgerIds } },
      });
      await prisma.reinforcementSubmission.updateMany({
        where: { taskId: { in: createdTaskIds } },
        data: { currentReviewId: null },
      });
      await prisma.reinforcementReview.deleteMany({
        where: { taskId: { in: createdTaskIds } },
      });
      await prisma.reinforcementSubmission.deleteMany({
        where: { taskId: { in: createdTaskIds } },
      });
      await prisma.reinforcementAssignment.deleteMany({
        where: { taskId: { in: createdTaskIds } },
      });
      await prisma.reinforcementTaskTarget.deleteMany({
        where: { taskId: { in: createdTaskIds } },
      });
      await prisma.reinforcementTaskStage.deleteMany({
        where: { taskId: { in: createdTaskIds } },
      });
      await prisma.reinforcementTask.deleteMany({
        where: { id: { in: createdTaskIds } },
      });
      await prisma.reinforcementTaskTemplateStage.deleteMany({
        where: { templateId: { in: createdTemplateIds } },
      });
      await prisma.reinforcementTaskTemplate.deleteMany({
        where: { id: { in: createdTemplateIds } },
      });
      await prisma.xpPolicy.deleteMany({
        where: { id: { in: createdXpPolicyIds } },
      });
      await prisma.enrollment.deleteMany({
        where: {
          id: {
            in: [
              demoEnrollmentId,
              demoEnrollmentTwoId,
              tenantBEnrollmentId,
            ].filter(Boolean),
          },
        },
      });
      await prisma.student.deleteMany({
        where: {
          id: {
            in: [demoStudentId, demoStudentTwoId, tenantBStudentId].filter(Boolean),
          },
        },
      });
      await prisma.classroom.deleteMany({
        where: {
          id: { in: [demoClassroomId, tenantBClassroomId].filter(Boolean) },
        },
      });
      await prisma.section.deleteMany({
        where: { id: { in: [demoSectionId, tenantBSectionId].filter(Boolean) } },
      });
      await prisma.grade.deleteMany({
        where: { id: { in: [demoGradeId, tenantBGradeId].filter(Boolean) } },
      });
      await prisma.subject.deleteMany({
        where: { id: { in: [demoSubjectId, tenantBSubjectId].filter(Boolean) } },
      });
      await prisma.stage.deleteMany({
        where: { id: { in: [demoStageId, tenantBStageId].filter(Boolean) } },
      });
      await prisma.term.deleteMany({
        where: { id: { in: [demoTermId, tenantBTermId].filter(Boolean) } },
      });
      await prisma.academicYear.deleteMany({
        where: { id: { in: createdAcademicYearIds } },
      });
      await prisma.file.deleteMany({
        where: { id: { in: createdFileIds } },
      });
      await prisma.membership.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: createdRoleIds } },
      });
      await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
      if (tenantBSchoolId) {
        await prisma.school.deleteMany({ where: { id: tenantBSchoolId } });
      }
      await prisma.organization.deleteMany({ where: { slug: TENANT_B_ORG_SLUG } });
      await prisma.$disconnect();
    }
  });

  async function login(email: string): Promise<{ accessToken: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: email === DEMO_ADMIN_EMAIL ? DEMO_ADMIN_PASSWORD : password })
      .expect(200);

    return { accessToken: response.body.accessToken };
  }

  it('school A overview does not include school B tasks, assignments, reviews, or XP', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const response = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/overview?yearId=${demoYearId}&termId=${demoTermId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const serialized = JSON.stringify(response.body);
    expect(response.body.xp.totalXp).toBe(5);
    expect(response.body.topStudents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ studentId: demoStudentId }),
      ]),
    );
    expect(serialized).toContain(demoStudentId);
    expect(serialized).not.toContain(tenantBTaskId);
    expect(serialized).not.toContain(tenantBAssignmentId);
    expect(serialized).not.toContain(tenantBSubmittedSubmissionId);
    expect(serialized).not.toContain(tenantBXpLedgerId);
    expect(serialized).not.toContain(tenantBStudentId);
  });

  it('school A cannot get progress for a school B student', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const response = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/students/${tenantBStudentId}/progress?yearId=${demoYearId}&termId=${demoTermId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('school A cannot get summary for a school B classroom', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const response = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/classrooms/${tenantBClassroomId}/summary?yearId=${demoYearId}&termId=${demoTermId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 403 when overview permission is missing', async () => {
    const { accessToken } = await login(noAccessEmail);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/overview?yearId=${demoYearId}&termId=${demoTermId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/students/${demoStudentId}/progress?yearId=${demoYearId}&termId=${demoTermId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/classrooms/${demoClassroomId}/summary?yearId=${demoYearId}&termId=${demoTermId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('school admin can read overview, student progress, and classroom summaries', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const overview = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/overview?yearId=${demoYearId}&termId=${demoTermId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(overview.body.scope).toMatchObject({
      academicYearId: demoYearId,
      termId: demoTermId,
    });

    const progress = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/students/${demoStudentId}/progress?yearId=${demoYearId}&termId=${demoTermId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(progress.body.student.id).toBe(demoStudentId);
    expect(progress.body.enrollment.classroomId).toBe(demoClassroomId);

    const classroom = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/classrooms/${demoClassroomId}/summary?yearId=${demoYearId}&termId=${demoTermId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(classroom.body.classroom.classroomId).toBe(demoClassroomId);
    expect(classroom.body.studentsCount).toBeGreaterThanOrEqual(2);
  });

  it('teacher, parent, and student actors cannot read dashboard overview APIs without overview permission', async () => {
    for (const email of [teacherEmail, parentEmail, studentEmail]) {
      const { accessToken } = await login(email);

      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/reinforcement/overview?yearId=${demoYearId}&termId=${demoTermId}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/reinforcement/students/${demoStudentId}/progress?yearId=${demoYearId}&termId=${demoTermId}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/reinforcement/classrooms/${demoClassroomId}/summary?yearId=${demoYearId}&termId=${demoTermId}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    }
  });

  it('overview read endpoints do not mutate reinforcement tables', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);
    const before = await reinforcementMutationCounts();

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/overview?yearId=${demoYearId}&termId=${demoTermId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/students/${demoStudentId}/progress?yearId=${demoYearId}&termId=${demoTermId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/classrooms/${demoClassroomId}/summary?yearId=${demoYearId}&termId=${demoTermId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await expect(reinforcementMutationCounts()).resolves.toEqual(before);
  });

  it('school A cannot read school B task detail', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/tasks/${tenantBTaskId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('school A cannot duplicate school B task', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/tasks/${tenantBTaskId}/duplicate`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('school A cannot cancel school B task', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/tasks/${tenantBTaskId}/cancel`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: `${testSuffix}-cross-school-cancel` })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it.each([
    ['stage', () => tenantBStageId],
    ['grade', () => tenantBGradeId],
    ['section', () => tenantBSectionId],
    ['classroom', () => tenantBClassroomId],
    ['student', () => tenantBStudentId],
  ])('school A cannot create task with school B %s target', async (scopeType, id) => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/tasks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(taskPayload({ targets: [{ scopeType, scopeId: id() }] }))
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('school A cannot create task with a school B subject', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/tasks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(taskPayload({ subjectId: tenantBSubjectId }))
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('school A cannot list school B tasks or default cancelled tasks', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/tasks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const ids = response.body.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(demoTaskId);
    expect(ids).not.toContain(tenantBTaskId);
    expect(ids).not.toContain(demoCancelledTaskId);
  });

  it('school A cannot see school B templates', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/templates`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const ids = response.body.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(demoTemplateId);
    expect(ids).not.toContain(tenantBTemplateId);
  });

  it('school A cannot create a template leaking into school B', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);
    const nameEn = `${testSuffix}-template-created-through-api`;

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/templates`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nameEn })
      .expect(201);
    createdTemplateIds.push(response.body.id);

    const [schoolACount, schoolBCount] = await Promise.all([
      prisma.reinforcementTaskTemplate.count({
        where: { schoolId: demoSchoolId, nameEn },
      }),
      prisma.reinforcementTaskTemplate.count({
        where: { schoolId: tenantBSchoolId, nameEn },
      }),
    ]);
    expect(schoolACount).toBe(1);
    expect(schoolBCount).toBe(0);
  });

  it('returns 403 when tasks view permission is missing', async () => {
    const { accessToken } = await login(noAccessEmail);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/filter-options`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/tasks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/tasks/${demoTaskId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('returns 403 when tasks manage permission is missing', async () => {
    const { accessToken } = await login(taskViewerEmail);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/tasks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(taskPayload())
      .expect(403);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/tasks/${demoTaskId}/duplicate`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/tasks/${demoTaskId}/cancel`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'forbidden' })
      .expect(403);
  });

  it('returns 403 for missing template permissions', async () => {
    const noView = await login(templateNoViewEmail);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/templates`)
      .set('Authorization', `Bearer ${noView.accessToken}`)
      .expect(403);

    const viewOnly = await login(templateViewerEmail);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/templates`)
      .set('Authorization', `Bearer ${viewOnly.accessToken}`)
      .send({ nameEn: `${testSuffix}-forbidden-template` })
      .expect(403);
  });

  it('school admin can create, list, detail, duplicate, and cancel tasks', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const createResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/tasks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(taskPayload({ titleEn: `${testSuffix}-admin-task` }))
      .expect(201);
    createdTaskIds.push(createResponse.body.id);
    expect(createResponse.body.assignmentSummary.total).toBe(1);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/tasks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/tasks/${createResponse.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const duplicateResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/tasks/${createResponse.body.id}/duplicate`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ titleEn: `${testSuffix}-admin-task-copy` })
      .expect(201);
    createdTaskIds.push(duplicateResponse.body.id);
    expect(duplicateResponse.body.status).toBe('not_completed');

    const cancelResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/tasks/${createResponse.body.id}/cancel`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'Admin cancelled' })
      .expect(201);
    expect(cancelResponse.body.status).toBe('cancelled');
  });

  it('teacher can create, list, detail, duplicate, and cancel tasks', async () => {
    const { accessToken } = await login(teacherEmail);

    const createResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/tasks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(taskPayload({ titleEn: `${testSuffix}-teacher-task` }))
      .expect(201);
    createdTaskIds.push(createResponse.body.id);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/tasks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/tasks/${createResponse.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const duplicateResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/tasks/${createResponse.body.id}/duplicate`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ titleEn: `${testSuffix}-teacher-task-copy` })
      .expect(201);
    createdTaskIds.push(duplicateResponse.body.id);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/tasks/${createResponse.body.id}/cancel`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'Teacher cancelled' })
      .expect(201);
  });

  it('parent and student task-view actors cannot manage tasks', async () => {
    for (const email of [parentEmail, studentEmail]) {
      const { accessToken } = await login(email);
      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/reinforcement/tasks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(taskPayload({ titleEn: `${testSuffix}-${email}-forbidden` }))
        .expect(403);
    }
  });

  it('school target materialization does not include school B students', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/tasks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        taskPayload({
          titleEn: `${testSuffix}-school-target`,
          targets: [{ scopeType: 'school' }],
        }),
      )
      .expect(201);
    createdTaskIds.push(response.body.id);

    const assignments = await prisma.reinforcementAssignment.findMany({
      where: { taskId: response.body.id },
      select: { studentId: true },
    });
    const studentIds = assignments.map((assignment) => assignment.studentId);
    expect(studentIds).toContain(demoStudentId);
    expect(studentIds).toContain(demoStudentTwoId);
    expect(studentIds).not.toContain(tenantBStudentId);
  });

  it('school A cannot submit proof for a school B assignment', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/assignments/${tenantBAssignmentId}/stages/${tenantBTaskStageId}/submit`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ proofText: `${testSuffix}-cross-school-assignment` })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('school A cannot submit proof using a school B stage', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/assignments/${demoAssignmentId}/stages/${tenantBTaskStageId}/submit`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ proofText: `${testSuffix}-cross-school-stage` })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('school A cannot submit proof using a school B file', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/assignments/${demoAssignmentId}/stages/${demoTaskStageId}/submit`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ proofFileId: tenantBProofFileId })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('school A cannot list school B review queue rows', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/review-queue`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const ids = response.body.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(demoSubmittedSubmissionId);
    expect(ids).not.toContain(tenantBSubmittedSubmissionId);
  });

  it('school A cannot read, approve, or reject a school B review item', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/review-queue/${tenantBSubmittedSubmissionId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/review-queue/${tenantBSubmittedSubmissionId}/approve`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ note: 'cross-school approve' })
      .expect(404);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/review-queue/${tenantBSubmittedSubmissionId}/reject`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ note: 'cross-school reject' })
      .expect(404);
  });

  it('returns 403 when task manage permission is missing for submit', async () => {
    const { accessToken } = await login(taskViewerEmail);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/assignments/${demoAssignmentId}/stages/${demoTaskStageId}/submit`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ proofText: `${testSuffix}-forbidden-submit` })
      .expect(403);
  });

  it('returns 403 when review view permission is missing', async () => {
    const { accessToken } = await login(noAccessEmail);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/review-queue`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/review-queue/${demoSubmittedSubmissionId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('returns 403 when review manage permission is missing', async () => {
    const { accessToken } = await login(reviewViewerEmail);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/review-queue/${demoSubmittedSubmissionId}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ note: 'view only approve' })
      .expect(403);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/review-queue/${demoSubmittedSubmissionId}/reject`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ note: 'view only reject' })
      .expect(403);
  });

  it('school admin can submit, list, detail, approve, and reject review items', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);
    const submitFixture = await createDemoTaskFixture('admin-submit-review');

    const submitResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/assignments/${submitFixture.assignmentId}/stages/${submitFixture.stageId}/submit`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ proofText: `${testSuffix}-admin-proof` })
      .expect(201);

    expect(submitResponse.body.status).toBe('submitted');

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/review-queue`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/review-queue/${submitResponse.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const approveResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/review-queue/${submitResponse.body.id}/approve`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ note: 'Approved by admin' })
      .expect(201);

    expect(approveResponse.body.status).toBe('approved');
    expect(approveResponse.body.assignment.status).toBe('completed');
    expect(approveResponse.body.assignment.progress).toBe(100);
    await expectReviewCount(
      submitResponse.body.id,
      ReinforcementReviewOutcome.APPROVED,
      1,
    );

    const rejectFixture = await createDemoTaskFixture('admin-reject-review');
    const rejectSubmissionId = await createSubmissionFixture({
      schoolId: demoSchoolId,
      taskId: rejectFixture.taskId,
      assignmentId: rejectFixture.assignmentId,
      stageId: rejectFixture.stageId,
      studentId: demoStudentId,
      enrollmentId: demoEnrollmentId,
    });

    const rejectResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/review-queue/${rejectSubmissionId}/reject`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ note: 'Rejected by admin' })
      .expect(201);

    expect(rejectResponse.body.status).toBe('rejected');
    expect(rejectResponse.body.assignment.status).toBe('in_progress');
    await expectReviewCount(
      rejectSubmissionId,
      ReinforcementReviewOutcome.REJECTED,
      1,
    );
  });

  it('teacher can submit, list, detail, approve, and reject review items', async () => {
    const { accessToken } = await login(teacherEmail);
    const submitFixture = await createDemoTaskFixture('teacher-submit-review');

    const submitResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/assignments/${submitFixture.assignmentId}/stages/${submitFixture.stageId}/submit`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ proofText: `${testSuffix}-teacher-proof` })
      .expect(201);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/review-queue`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/review-queue/${submitResponse.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/review-queue/${submitResponse.body.id}/approve`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ note: 'Approved by teacher' })
      .expect(201);

    const rejectFixture = await createDemoTaskFixture('teacher-reject-review');
    const rejectSubmissionId = await createSubmissionFixture({
      schoolId: demoSchoolId,
      taskId: rejectFixture.taskId,
      assignmentId: rejectFixture.assignmentId,
      stageId: rejectFixture.stageId,
      studentId: demoStudentId,
      enrollmentId: demoEnrollmentId,
    });

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/review-queue/${rejectSubmissionId}/reject`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ note: 'Rejected by teacher' })
      .expect(201);
  });

  it('parent and student actors cannot approve or reject reviews', async () => {
    for (const email of [parentEmail, studentEmail]) {
      const { accessToken } = await login(email);

      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/reinforcement/review-queue/${demoSubmittedSubmissionId}/approve`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ note: `${email} approve` })
        .expect(403);

      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/reinforcement/review-queue/${demoSubmittedSubmissionId}/reject`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ note: `${email} reject` })
        .expect(403);
    }
  });

  it('reject without a note returns validation failure', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/review-queue/${demoSubmittedSubmissionId}/reject`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(400);

    expect(response.body?.error?.code).toBe('validation.failed');
  });

  it('approve and reject only work for submitted items', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);
    const approvedFixture = await createDemoTaskFixture('approved-not-submitted');
    const approvedSubmissionId = await createSubmissionFixture({
      schoolId: demoSchoolId,
      taskId: approvedFixture.taskId,
      assignmentId: approvedFixture.assignmentId,
      stageId: approvedFixture.stageId,
      studentId: demoStudentId,
      enrollmentId: demoEnrollmentId,
      status: ReinforcementSubmissionStatus.APPROVED,
    });
    const rejectedFixture = await createDemoTaskFixture('rejected-not-submitted');
    const rejectedSubmissionId = await createSubmissionFixture({
      schoolId: demoSchoolId,
      taskId: rejectedFixture.taskId,
      assignmentId: rejectedFixture.assignmentId,
      stageId: rejectedFixture.stageId,
      studentId: demoStudentId,
      enrollmentId: demoEnrollmentId,
      status: ReinforcementSubmissionStatus.REJECTED,
    });

    const approveResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/review-queue/${approvedSubmissionId}/approve`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ note: 'already approved' })
      .expect(409);
    expect(approveResponse.body?.error?.code).toBe(
      'reinforcement.review.not_submitted',
    );

    const rejectResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/review-queue/${rejectedSubmissionId}/reject`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ note: 'already rejected' })
      .expect(409);
    expect(rejectResponse.body?.error?.code).toBe(
      'reinforcement.review.not_submitted',
    );
  });

  it('approval updates assignment progress without leaking tenants or creating XP', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);
    const fixture = await createDemoTaskFixture('tenant-isolated-approval');
    const submissionId = await createSubmissionFixture({
      schoolId: demoSchoolId,
      taskId: fixture.taskId,
      assignmentId: fixture.assignmentId,
      stageId: fixture.stageId,
      studentId: demoStudentId,
      enrollmentId: demoEnrollmentId,
    });
    const beforeXpCount = await prisma.xpLedger.count({
      where: { assignmentId: fixture.assignmentId },
    });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/review-queue/${submissionId}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ note: 'tenant isolated approval' })
      .expect(201);

    const [demoAssignment, tenantBAssignment, afterXpCount] = await Promise.all([
      prisma.reinforcementAssignment.findUnique({
        where: { id: fixture.assignmentId },
        select: { status: true, progress: true },
      }),
      prisma.reinforcementAssignment.findUnique({
        where: { id: tenantBAssignmentId },
        select: { status: true, progress: true },
      }),
      prisma.xpLedger.count({ where: { assignmentId: fixture.assignmentId } }),
    ]);

    expect(demoAssignment).toMatchObject({
      status: ReinforcementTaskStatus.COMPLETED,
      progress: 100,
    });
    expect(tenantBAssignment).toMatchObject({
      status: ReinforcementTaskStatus.UNDER_REVIEW,
      progress: 0,
    });
    expect(afterXpCount).toBe(beforeXpCount);
  });

  it('school A cannot list or update school B XP policies', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const listResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/xp/policies`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const ids = listResponse.body.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(demoXpPolicyId);
    expect(ids).not.toContain(tenantBXpPolicyId);

    const updateResponse = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/reinforcement/xp/policies/${tenantBXpPolicyId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ dailyCap: 300 })
      .expect(404);
    expect(updateResponse.body?.error?.code).toBe('not_found');
  });

  it('school A cannot use school B scope resources when creating XP policies', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/xp/policies`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        yearId: demoYearId,
        termId: demoTermId,
        scopeType: 'grade',
        scopeId: tenantBGradeId,
        dailyCap: 100,
      })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('school A cannot see school B XP ledger entries', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/xp/ledger`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const ids = response.body.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(demoXpLedgerId);
    expect(ids).not.toContain(tenantBXpLedgerId);
  });

  it('school A cannot grant XP for school B submissions or students', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/xp/grants/reinforcement-review/${tenantBApprovedSubmissionId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ amount: 10, reason: 'cross-school' })
      .expect(404);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/xp/grants/manual`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        yearId: demoYearId,
        termId: demoTermId,
        studentId: tenantBStudentId,
        amount: 10,
        reason: 'cross-school student',
        dedupeKey: `${testSuffix}-cross-school-student`,
      })
      .expect(404);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/xp/grants/manual`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        yearId: demoYearId,
        termId: demoTermId,
        studentId: demoStudentId,
        enrollmentId: tenantBEnrollmentId,
        amount: 10,
        reason: 'cross-school enrollment',
        dedupeKey: `${testSuffix}-cross-school-enrollment`,
      })
      .expect(404);
  });

  it('returns 403 when XP view permission is missing', async () => {
    const { accessToken } = await login(noAccessEmail);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/xp/policies`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/xp/policies/effective?yearId=${demoYearId}&termId=${demoTermId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/xp/ledger`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/xp/summary?yearId=${demoYearId}&termId=${demoTermId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('returns 403 when XP manage permission is missing', async () => {
    const { accessToken } = await login(xpViewerEmail);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/xp/policies`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        yearId: demoYearId,
        termId: demoTermId,
        scopeType: 'student',
        scopeId: demoStudentId,
        dailyCap: 50,
      })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/reinforcement/xp/policies/${demoXpPolicyId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ dailyCap: 50 })
      .expect(403);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/xp/grants/reinforcement-review/${demoApprovedSubmissionId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ amount: 10, reason: 'view only' })
      .expect(403);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/xp/grants/manual`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        yearId: demoYearId,
        termId: demoTermId,
        studentId: demoStudentId,
        amount: 10,
        reason: 'view only',
        dedupeKey: `${testSuffix}-view-only-manual`,
      })
      .expect(403);
  });

  it('teacher can view XP but cannot manage XP', async () => {
    const { accessToken } = await login(teacherEmail);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/xp/policies`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/xp/ledger`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/xp/summary?yearId=${demoYearId}&termId=${demoTermId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/xp/policies`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        yearId: demoYearId,
        termId: demoTermId,
        scopeType: 'student',
        scopeId: demoStudentId,
        dailyCap: 50,
      })
      .expect(403);
  });

  it('school admin can create, update, and resolve XP policies', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const createResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/xp/policies`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        yearId: demoYearId,
        termId: demoTermId,
        scopeType: 'section',
        scopeId: demoSectionId,
        dailyCap: 120,
        weeklyCap: 600,
      })
      .expect(201);
    createdXpPolicyIds.push(createResponse.body.id);
    expect(createResponse.body.scopeType).toBe('section');

    const updateResponse = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/reinforcement/xp/policies/${createResponse.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ weeklyCap: 650 })
      .expect(200);
    expect(updateResponse.body.weeklyCap).toBe(650);

    const effectiveResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/xp/policies/effective?yearId=${demoYearId}&termId=${demoTermId}&sectionId=${demoSectionId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(effectiveResponse.body.scopeType).toBe('section');
  });

  it('school admin can grant XP for approved reviews and duplicates are idempotent', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);
    const fixture = await createDemoTaskFixture('duplicate-xp-grant');
    const submissionId = await createSubmissionFixture({
      schoolId: demoSchoolId,
      taskId: fixture.taskId,
      assignmentId: fixture.assignmentId,
      stageId: fixture.stageId,
      studentId: demoStudentId,
      enrollmentId: demoEnrollmentId,
      status: ReinforcementSubmissionStatus.APPROVED,
    });

    const first = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/xp/grants/reinforcement-review/${submissionId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ amount: 8, reason: 'approved reinforcement' })
      .expect(201);
    createdXpLedgerIds.push(first.body.id);

    const second = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/xp/grants/reinforcement-review/${submissionId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ amount: 8, reason: 'approved reinforcement' })
      .expect(201);

    expect(second.body.id).toBe(first.body.id);
    await expect(
      prisma.xpLedger.count({
        where: {
          sourceType: XpSourceType.REINFORCEMENT_TASK,
          sourceId: submissionId,
          studentId: demoStudentId,
        },
      }),
    ).resolves.toBe(1);
  });

  it('parent and student actors cannot manage XP', async () => {
    for (const email of [parentEmail, studentEmail]) {
      const { accessToken } = await login(email);

      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/reinforcement/xp/grants/manual`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          yearId: demoYearId,
          termId: demoTermId,
          studentId: demoStudentId,
          amount: 10,
          reason: `${email} forbidden`,
          dedupeKey: `${testSuffix}-${email}-xp-forbidden`,
        })
        .expect(403);
    }
  });

  it('cap enforcement is tenant-isolated for manual bonuses', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);
    const policyId = await createXpPolicyFixture({
      schoolId: demoSchoolId,
      academicYearId: demoYearId,
      termId: demoTermId,
      scopeType: ReinforcementTargetScope.STUDENT,
      scopeKey: demoStudentTwoId,
      dailyCap: 10,
      weeklyCap: 100,
    });
    expect(policyId).toBeTruthy();

    const first = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/xp/grants/manual`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        yearId: demoYearId,
        termId: demoTermId,
        studentId: demoStudentTwoId,
        enrollmentId: demoEnrollmentTwoId,
        amount: 8,
        reason: 'first capped bonus',
        dedupeKey: `${testSuffix}-cap-first`,
      })
      .expect(201);
    createdXpLedgerIds.push(first.body.id);

    const rejected = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/xp/grants/manual`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        yearId: demoYearId,
        termId: demoTermId,
        studentId: demoStudentTwoId,
        enrollmentId: demoEnrollmentTwoId,
        amount: 5,
        reason: 'second capped bonus',
        dedupeKey: `${testSuffix}-cap-second`,
      })
      .expect(429);
    expect(rejected.body?.error?.code).toBe(
      'reinforcement.xp.daily_cap_reached',
    );
  });

  it('manual bonus XP does not leak across schools', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);
    const sourceId = `${testSuffix}-manual-leak-check`;

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/xp/grants/manual`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        yearId: demoYearId,
        termId: demoTermId,
        studentId: demoStudentId,
        enrollmentId: demoEnrollmentId,
        amount: 7,
        reason: 'manual leak check',
        dedupeKey: sourceId,
      })
      .expect(201);
    createdXpLedgerIds.push(response.body.id);

    const [schoolACount, schoolBCount] = await Promise.all([
      prisma.xpLedger.count({
        where: { schoolId: demoSchoolId, sourceId },
      }),
      prisma.xpLedger.count({
        where: { schoolId: tenantBSchoolId, sourceId },
      }),
    ]);
    expect(schoolACount).toBe(1);
    expect(schoolBCount).toBe(0);
  });

  async function reinforcementMutationCounts() {
    const [tasks, assignments, submissions, reviews, xpLedger] =
      await Promise.all([
        prisma.reinforcementTask.count(),
        prisma.reinforcementAssignment.count(),
        prisma.reinforcementSubmission.count(),
        prisma.reinforcementReview.count(),
        prisma.xpLedger.count(),
      ]);

    return {
      tasks,
      assignments,
      submissions,
      reviews,
      xpLedger,
    };
  }

  async function createCustomRole(
    keySuffix: string,
    permissionIds: string[],
  ): Promise<string> {
    const role = await prisma.role.create({
      data: {
        schoolId: demoSchoolId,
        key: `${testSuffix}-${keySuffix}`,
        name: `${testSuffix} ${keySuffix}`,
        isSystem: false,
      },
      select: { id: true },
    });
    createdRoleIds.push(role.id);

    if (permissionIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
      });
    }

    return role.id;
  }

  async function createUserWithMembership(
    email: string,
    userType: UserType,
    roleId: string,
  ): Promise<void> {
    const user = await prisma.user.create({
      data: {
        email,
        firstName: 'Reinforcement',
        lastName: 'Security',
        userType,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(password, ARGON2_OPTIONS),
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: demoOrganizationId,
        schoolId: demoSchoolId,
        roleId,
        userType,
        status: MembershipStatus.ACTIVE,
      },
    });
  }

  async function createAcademicFixture(
    suffix: string,
    schoolId: string,
    organizationId: string,
  ) {
    let year = await prisma.academicYear.findFirst({
      where: {
        schoolId,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!year) {
      year = await prisma.academicYear.create({
        data: {
          schoolId,
          nameAr: `${testSuffix}-year-${suffix}-ar`,
          nameEn: `${testSuffix}-year-${suffix}`,
          startDate: new Date('2026-09-01T00:00:00.000Z'),
          endDate: new Date('2027-06-30T00:00:00.000Z'),
          isActive: true,
        },
        select: { id: true },
      });
      createdAcademicYearIds.push(year.id);
    }

    const term = await prisma.term.create({
      data: {
        schoolId,
        academicYearId: year.id,
        nameAr: `${testSuffix}-term-${suffix}-ar`,
        nameEn: `${testSuffix}-term-${suffix}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId,
        nameAr: `${testSuffix}-stage-${suffix}-ar`,
        nameEn: `${testSuffix}-stage-${suffix}`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId,
        stageId: stage.id,
        nameAr: `${testSuffix}-grade-${suffix}-ar`,
        nameEn: `${testSuffix}-grade-${suffix}`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `${testSuffix}-section-${suffix}-ar`,
        nameEn: `${testSuffix}-section-${suffix}`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: section.id,
        nameAr: `${testSuffix}-classroom-${suffix}-ar`,
        nameEn: `${testSuffix}-classroom-${suffix}`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const subject = await prisma.subject.create({
      data: {
        schoolId,
        nameAr: `${testSuffix}-subject-${suffix}-ar`,
        nameEn: `${testSuffix}-subject-${suffix}`,
        code: `${testSuffix}-${suffix}`.slice(0, 40),
        isActive: true,
      },
      select: { id: true },
    });
    const student = await prisma.student.create({
      data: {
        schoolId,
        organizationId,
        firstName: `${testSuffix}-student-${suffix}`,
        lastName: 'One',
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    const enrollment = await prisma.enrollment.create({
      data: {
        schoolId,
        studentId: student.id,
        academicYearId: year.id,
        termId: term.id,
        classroomId: classroom.id,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      select: { id: true },
    });

    let studentTwoId = student.id;
    let enrollmentTwoId = enrollment.id;
    if (suffix === 'a') {
      const studentTwo = await prisma.student.create({
        data: {
          schoolId,
          organizationId,
          firstName: `${testSuffix}-student-${suffix}`,
          lastName: 'Two',
          status: StudentStatus.ACTIVE,
        },
        select: { id: true },
      });
      const enrollmentTwo = await prisma.enrollment.create({
        data: {
          schoolId,
          studentId: studentTwo.id,
          academicYearId: year.id,
          termId: term.id,
          classroomId: classroom.id,
          status: StudentEnrollmentStatus.ACTIVE,
          enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
        },
        select: { id: true },
      });
      studentTwoId = studentTwo.id;
      enrollmentTwoId = enrollmentTwo.id;
    }

    return {
      yearId: year.id,
      termId: term.id,
      stageId: stage.id,
      gradeId: grade.id,
      sectionId: section.id,
      classroomId: classroom.id,
      subjectId: subject.id,
      studentId: student.id,
      studentTwoId,
      enrollmentId: enrollment.id,
      enrollmentTwoId,
    };
  }

  async function cleanupReinforcementTenantSchool(schoolId: string): Promise<void> {
    await prisma.xpLedger.deleteMany({ where: { schoolId } });
    await prisma.reinforcementSubmission.updateMany({
      where: { schoolId },
      data: { currentReviewId: null },
    });
    await prisma.reinforcementReview.deleteMany({ where: { schoolId } });
    await prisma.reinforcementSubmission.deleteMany({ where: { schoolId } });
    await prisma.reinforcementAssignment.deleteMany({ where: { schoolId } });
    await prisma.reinforcementTaskTarget.deleteMany({ where: { schoolId } });
    await prisma.reinforcementTaskStage.deleteMany({ where: { schoolId } });
    await prisma.reinforcementTask.deleteMany({ where: { schoolId } });
    await prisma.reinforcementTaskTemplateStage.deleteMany({ where: { schoolId } });
    await prisma.reinforcementTaskTemplate.deleteMany({ where: { schoolId } });
    await prisma.xpPolicy.deleteMany({ where: { schoolId } });
    await prisma.file.deleteMany({ where: { schoolId } });
    await prisma.enrollment.deleteMany({ where: { schoolId } });
    await prisma.student.deleteMany({ where: { schoolId } });
    await prisma.classroom.deleteMany({ where: { schoolId } });
    await prisma.section.deleteMany({ where: { schoolId } });
    await prisma.grade.deleteMany({ where: { schoolId } });
    await prisma.subject.deleteMany({ where: { schoolId } });
    await prisma.stage.deleteMany({ where: { schoolId } });
    await prisma.term.deleteMany({ where: { schoolId } });
    await prisma.academicYear.deleteMany({ where: { schoolId } });
  }

  async function createDemoTaskFixture(titleSuffix: string): Promise<{
    taskId: string;
    stageId: string;
    assignmentId: string;
  }> {
    return createTaskFixture({
      schoolId: demoSchoolId,
      academicYearId: demoYearId,
      termId: demoTermId,
      subjectId: demoSubjectId,
      titleEn: `${testSuffix}-${titleSuffix}`,
      target: {
        scopeType: ReinforcementTargetScope.STUDENT,
        scopeKey: demoStudentId,
        studentId: demoStudentId,
      },
      assignment: {
        studentId: demoStudentId,
        enrollmentId: demoEnrollmentId,
      },
    });
  }

  async function expectReviewCount(
    submissionId: string,
    outcome: ReinforcementReviewOutcome,
    expected: number,
  ): Promise<void> {
    await expect(
      prisma.reinforcementReview.count({
        where: { submissionId, outcome },
      }),
    ).resolves.toBe(expected);
  }

  async function createXpPolicyFixture(params: {
    schoolId: string;
    academicYearId: string;
    termId: string;
    scopeType: ReinforcementTargetScope;
    scopeKey: string;
    dailyCap?: number | null;
    weeklyCap?: number | null;
    cooldownMinutes?: number | null;
  }): Promise<string> {
    const policy = await prisma.xpPolicy.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        termId: params.termId,
        scopeType: params.scopeType,
        scopeKey: params.scopeKey,
        dailyCap: params.dailyCap ?? null,
        weeklyCap: params.weeklyCap ?? null,
        cooldownMinutes: params.cooldownMinutes ?? null,
        isActive: true,
      },
      select: { id: true },
    });
    createdXpPolicyIds.push(policy.id);

    return policy.id;
  }

  async function createXpLedgerFixture(params: {
    schoolId: string;
    academicYearId: string;
    termId: string;
    studentId: string;
    enrollmentId: string;
    sourceType: XpSourceType;
    sourceId: string;
    amount: number;
  }): Promise<string> {
    const ledger = await prisma.xpLedger.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        termId: params.termId,
        studentId: params.studentId,
        enrollmentId: params.enrollmentId,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        amount: params.amount,
        reason: `${testSuffix}-fixture-xp`,
      },
      select: { id: true },
    });
    createdXpLedgerIds.push(ledger.id);

    return ledger.id;
  }

  async function createTaskFixture(params: {
    schoolId: string;
    academicYearId: string;
    termId: string;
    subjectId: string;
    titleEn: string;
    status?: ReinforcementTaskStatus;
    proofType?: ReinforcementProofType;
    target: {
      scopeType: ReinforcementTargetScope;
      scopeKey: string;
      studentId?: string | null;
    };
    assignment: {
      studentId: string;
      enrollmentId: string;
    };
  }): Promise<{ taskId: string; stageId: string; assignmentId: string }> {
    const task = await prisma.reinforcementTask.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        termId: params.termId,
        subjectId: params.subjectId,
        titleEn: params.titleEn,
        source: ReinforcementSource.TEACHER,
        status: params.status ?? ReinforcementTaskStatus.NOT_COMPLETED,
        rewardType: ReinforcementRewardType.XP,
        rewardValue: new Prisma.Decimal(25),
      },
      select: { id: true },
    });
    createdTaskIds.push(task.id);

    await prisma.reinforcementTaskTarget.create({
      data: {
        schoolId: params.schoolId,
        taskId: task.id,
        scopeType: params.target.scopeType,
        scopeKey: params.target.scopeKey,
        studentId: params.target.studentId ?? null,
      },
    });
    const stage = await prisma.reinforcementTaskStage.create({
      data: {
        schoolId: params.schoolId,
        taskId: task.id,
        sortOrder: 1,
        titleEn: params.titleEn,
        proofType: params.proofType ?? ReinforcementProofType.NONE,
        requiresApproval: true,
      },
      select: { id: true },
    });
    const assignment = await prisma.reinforcementAssignment.create({
      data: {
        schoolId: params.schoolId,
        taskId: task.id,
        academicYearId: params.academicYearId,
        termId: params.termId,
        studentId: params.assignment.studentId,
        enrollmentId: params.assignment.enrollmentId,
        status: params.status ?? ReinforcementTaskStatus.NOT_COMPLETED,
      },
      select: { id: true },
    });

    return {
      taskId: task.id,
      stageId: stage.id,
      assignmentId: assignment.id,
    };
  }

  async function createProofFileFixture(
    schoolId: string,
    organizationId: string,
    suffix: string,
  ): Promise<string> {
    const file = await prisma.file.create({
      data: {
        schoolId,
        organizationId,
        bucket: 'reinforcement-security',
        objectKey: `${testSuffix}-${suffix}`,
        originalName: `${suffix}.png`,
        mimeType: 'image/png',
        sizeBytes: BigInt(128),
        visibility: FileVisibility.PRIVATE,
      },
      select: { id: true },
    });
    createdFileIds.push(file.id);

    return file.id;
  }

  async function createSubmissionFixture(params: {
    schoolId: string;
    taskId: string;
    assignmentId: string;
    stageId: string;
    studentId: string;
    enrollmentId: string;
    status?: ReinforcementSubmissionStatus;
    proofFileId?: string | null;
  }): Promise<string> {
    const status = params.status ?? ReinforcementSubmissionStatus.SUBMITTED;
    const submittedAt =
      status === ReinforcementSubmissionStatus.PENDING ? null : new Date();
    const submission = await prisma.reinforcementSubmission.create({
      data: {
        schoolId: params.schoolId,
        assignmentId: params.assignmentId,
        taskId: params.taskId,
        stageId: params.stageId,
        studentId: params.studentId,
        enrollmentId: params.enrollmentId,
        status,
        proofText: `${testSuffix}-proof`,
        proofFileId: params.proofFileId ?? null,
        submittedAt,
      },
      select: { id: true },
    });

    await prisma.reinforcementAssignment.updateMany({
      where: { id: params.assignmentId, schoolId: params.schoolId },
      data: {
        status:
          status === ReinforcementSubmissionStatus.APPROVED
            ? ReinforcementTaskStatus.COMPLETED
            : ReinforcementTaskStatus.UNDER_REVIEW,
        progress: status === ReinforcementSubmissionStatus.APPROVED ? 100 : 0,
        startedAt: submittedAt ?? new Date(),
        ...(status === ReinforcementSubmissionStatus.APPROVED
          ? { completedAt: submittedAt ?? new Date() }
          : {}),
      },
    });

    return submission.id;
  }

  async function createTemplateFixture(
    schoolId: string,
    nameEn: string,
  ): Promise<string> {
    const template = await prisma.reinforcementTaskTemplate.create({
      data: {
        schoolId,
        nameEn,
        source: ReinforcementSource.TEACHER,
        rewardType: ReinforcementRewardType.XP,
      },
      select: { id: true },
    });
    createdTemplateIds.push(template.id);
    await prisma.reinforcementTaskTemplateStage.create({
      data: {
        schoolId,
        templateId: template.id,
        sortOrder: 1,
        titleEn: nameEn,
        proofType: ReinforcementProofType.NONE,
        requiresApproval: true,
      },
    });

    return template.id;
  }

  function taskPayload(
    overrides?: Partial<{
      titleEn: string;
      subjectId: string;
      targets: Array<{ scopeType: string; scopeId?: string }>;
    }>,
  ) {
    return {
      yearId: demoYearId,
      termId: demoTermId,
      subjectId: overrides?.subjectId ?? demoSubjectId,
      titleEn: overrides?.titleEn ?? `${testSuffix}-api-task`,
      source: 'teacher',
      targets:
        overrides?.targets ??
        [{ scopeType: 'student', scopeId: demoStudentId }],
      stages: [{ titleEn: `${testSuffix}-api-stage`, proofType: 'none' }],
    };
  }
});
