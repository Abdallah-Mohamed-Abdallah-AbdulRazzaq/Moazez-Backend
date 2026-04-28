import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeAssessmentType,
  GradeQuestionType,
  GradeItemStatus,
  GradeRoundingMode,
  GradeRuleScale,
  GradeScopeType,
  GradeSubmissionStatus,
  MembershipStatus,
  OrganizationStatus,
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

const GLOBAL_PREFIX = '/api/v1';

const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';

const TENANT_B_ORG_SLUG = 'grades-rules-tenancy-org-b';
const TENANT_B_SCHOOL_SLUG = 'grades-rules-tenancy-school-b';

const VIEW_ONLY_EMAIL = 'grades-rules-viewer@security.moazez.local';
const VIEW_ONLY_PASSWORD = 'GradesView123!';
const MANAGE_ONLY_EMAIL = 'grades-rules-manager@security.moazez.local';
const MANAGE_ONLY_PASSWORD = 'GradesManage123!';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(30000);

describe('Grades tenancy isolation (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let demoSchoolId: string;
  let demoOrganizationId: string;
  let tenantBSchoolId: string;
  let tenantBOrganizationId: string;

  let demoYearId: string;
  let demoTermId: string;
  let demoClosedTermId: string;
  let demoStageId: string;
  let demoGradeId: string;
  let demoSectionId: string;
  let demoClassroomId: string;
  let demoSubjectId: string;
  let demoAssessmentId: string;
  let demoQuestionAssessmentId: string;
  let demoQuestionOneId: string;
  let demoQuestionTwoId: string;
  let demoStudentId: string;
  let demoStudentTwoId: string;
  let demoEnrollmentId: string;
  let demoSchoolRuleId: string;
  let demoGradeRuleId: string;

  let tenantBYearId: string;
  let tenantBTermId: string;
  let tenantBStageId: string;
  let tenantBGradeId: string;
  let tenantBSectionId: string;
  let tenantBClassroomId: string;
  let tenantBSubjectId: string;
  let tenantBAssessmentId: string;
  let tenantBQuestionAssessmentId: string;
  let tenantBQuestionId: string;
  let tenantBStudentId: string;
  let tenantBSchoolRuleId: string;
  let tenantBGradeRuleId: string;

  let viewOnlyRoleId: string;
  let manageOnlyRoleId: string;
  let viewOnlyUserId: string;
  let manageOnlyUserId: string;

  const testSuffix = `grades-rules-security-${Date.now()}`;

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
      rulesViewPermission,
      rulesManagePermission,
      assessmentsViewPermission,
      assessmentsManagePermission,
      assessmentsPublishPermission,
      assessmentsApprovePermission,
      assessmentsLockPermission,
      questionsViewPermission,
      questionsManagePermission,
      itemsViewPermission,
      itemsManagePermission,
    ] = await Promise.all([
      prisma.role.findFirst({
        where: { key: 'school_admin', schoolId: null, isSystem: true },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'grades.rules.view' },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'grades.rules.manage' },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'grades.assessments.view' },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'grades.assessments.manage' },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'grades.assessments.publish' },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'grades.assessments.approve' },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'grades.assessments.lock' },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'grades.questions.view' },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'grades.questions.manage' },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'grades.items.view' },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'grades.items.manage' },
        select: { id: true },
      }),
    ]);

    if (
      !schoolAdminRole ||
      !rulesViewPermission ||
      !rulesManagePermission ||
      !assessmentsViewPermission ||
      !assessmentsManagePermission ||
      !assessmentsPublishPermission ||
      !assessmentsApprovePermission ||
      !assessmentsLockPermission ||
      !questionsViewPermission ||
      !questionsManagePermission ||
      !itemsViewPermission ||
      !itemsManagePermission
    ) {
      throw new Error('Grades permissions missing - run `npm run seed` first.');
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

    const orgB = await prisma.organization.upsert({
      where: { slug: TENANT_B_ORG_SLUG },
      update: { status: OrganizationStatus.ACTIVE },
      create: {
        slug: TENANT_B_ORG_SLUG,
        name: 'Grades Rules Tenancy Org B',
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
        name: 'Grades Rules Tenancy School B',
        status: SchoolStatus.ACTIVE,
      },
    });
    tenantBSchoolId = schoolB.id;

    const demoYear = await prisma.academicYear.create({
      data: {
        schoolId: demoSchoolId,
        nameAr: `${testSuffix}-year-a-ar`,
        nameEn: `${testSuffix}-year-a`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: false,
      },
      select: { id: true },
    });
    demoYearId = demoYear.id;

    const demoTerm = await prisma.term.create({
      data: {
        schoolId: demoSchoolId,
        academicYearId: demoYearId,
        nameAr: `${testSuffix}-term-a-ar`,
        nameEn: `${testSuffix}-term-a`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    demoTermId = demoTerm.id;

    const demoClosedTerm = await prisma.term.create({
      data: {
        schoolId: demoSchoolId,
        academicYearId: demoYearId,
        nameAr: `${testSuffix}-closed-term-a-ar`,
        nameEn: `${testSuffix}-closed-term-a`,
        startDate: new Date('2027-01-01T00:00:00.000Z'),
        endDate: new Date('2027-03-31T00:00:00.000Z'),
        isActive: false,
      },
      select: { id: true },
    });
    demoClosedTermId = demoClosedTerm.id;

    const demoStage = await prisma.stage.create({
      data: {
        schoolId: demoSchoolId,
        nameAr: `${testSuffix}-stage-a-ar`,
        nameEn: `${testSuffix}-stage-a`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    demoStageId = demoStage.id;

    const demoGrade = await prisma.grade.create({
      data: {
        schoolId: demoSchoolId,
        stageId: demoStageId,
        nameAr: `${testSuffix}-grade-a-ar`,
        nameEn: `${testSuffix}-grade-a`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    demoGradeId = demoGrade.id;

    const demoSection = await prisma.section.create({
      data: {
        schoolId: demoSchoolId,
        gradeId: demoGradeId,
        nameAr: `${testSuffix}-section-a-ar`,
        nameEn: `${testSuffix}-section-a`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    demoSectionId = demoSection.id;

    const demoClassroom = await prisma.classroom.create({
      data: {
        schoolId: demoSchoolId,
        sectionId: demoSectionId,
        nameAr: `${testSuffix}-classroom-a-ar`,
        nameEn: `${testSuffix}-classroom-a`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    demoClassroomId = demoClassroom.id;

    const tenantBYear = await prisma.academicYear.create({
      data: {
        schoolId: tenantBSchoolId,
        nameAr: `${testSuffix}-year-b-ar`,
        nameEn: `${testSuffix}-year-b`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: false,
      },
      select: { id: true },
    });
    tenantBYearId = tenantBYear.id;

    const tenantBTerm = await prisma.term.create({
      data: {
        schoolId: tenantBSchoolId,
        academicYearId: tenantBYearId,
        nameAr: `${testSuffix}-term-b-ar`,
        nameEn: `${testSuffix}-term-b`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    tenantBTermId = tenantBTerm.id;

    const tenantBStage = await prisma.stage.create({
      data: {
        schoolId: tenantBSchoolId,
        nameAr: `${testSuffix}-stage-b-ar`,
        nameEn: `${testSuffix}-stage-b`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    tenantBStageId = tenantBStage.id;

    const tenantBGrade = await prisma.grade.create({
      data: {
        schoolId: tenantBSchoolId,
        stageId: tenantBStageId,
        nameAr: `${testSuffix}-grade-b-ar`,
        nameEn: `${testSuffix}-grade-b`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    tenantBGradeId = tenantBGrade.id;

    const tenantBSection = await prisma.section.create({
      data: {
        schoolId: tenantBSchoolId,
        gradeId: tenantBGradeId,
        nameAr: `${testSuffix}-section-b-ar`,
        nameEn: `${testSuffix}-section-b`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    tenantBSectionId = tenantBSection.id;

    const tenantBClassroom = await prisma.classroom.create({
      data: {
        schoolId: tenantBSchoolId,
        sectionId: tenantBSectionId,
        nameAr: `${testSuffix}-classroom-b-ar`,
        nameEn: `${testSuffix}-classroom-b`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    tenantBClassroomId = tenantBClassroom.id;

    const demoSubject = await prisma.subject.create({
      data: {
        schoolId: demoSchoolId,
        nameAr: `${testSuffix}-subject-a-ar`,
        nameEn: `${testSuffix}-subject-a`,
        code: `${testSuffix}-SUBJ-A`,
        color: '#2563eb',
        isActive: true,
      },
      select: { id: true },
    });
    demoSubjectId = demoSubject.id;

    const tenantBSubject = await prisma.subject.create({
      data: {
        schoolId: tenantBSchoolId,
        nameAr: `${testSuffix}-subject-b-ar`,
        nameEn: `${testSuffix}-subject-b`,
        code: `${testSuffix}-SUBJ-B`,
        color: '#16a34a',
        isActive: true,
      },
      select: { id: true },
    });
    tenantBSubjectId = tenantBSubject.id;

    const demoSchoolRule = await prisma.gradeRule.create({
      data: {
        schoolId: demoSchoolId,
        academicYearId: demoYearId,
        termId: demoTermId,
        scopeType: GradeScopeType.SCHOOL,
        scopeKey: demoSchoolId,
        gradingScale: GradeRuleScale.PERCENTAGE,
        passMark: 51,
        rounding: GradeRoundingMode.DECIMAL_2,
      },
      select: { id: true },
    });
    demoSchoolRuleId = demoSchoolRule.id;

    const demoGradeRule = await prisma.gradeRule.create({
      data: {
        schoolId: demoSchoolId,
        academicYearId: demoYearId,
        termId: demoTermId,
        scopeType: GradeScopeType.GRADE,
        scopeKey: demoGradeId,
        gradeId: demoGradeId,
        gradingScale: GradeRuleScale.PERCENTAGE,
        passMark: 61,
        rounding: GradeRoundingMode.DECIMAL_1,
      },
      select: { id: true },
    });
    demoGradeRuleId = demoGradeRule.id;

    const tenantBSchoolRule = await prisma.gradeRule.create({
      data: {
        schoolId: tenantBSchoolId,
        academicYearId: tenantBYearId,
        termId: tenantBTermId,
        scopeType: GradeScopeType.SCHOOL,
        scopeKey: tenantBSchoolId,
        gradingScale: GradeRuleScale.PERCENTAGE,
        passMark: 49,
        rounding: GradeRoundingMode.DECIMAL_2,
      },
      select: { id: true },
    });
    tenantBSchoolRuleId = tenantBSchoolRule.id;

    const tenantBGradeRule = await prisma.gradeRule.create({
      data: {
        schoolId: tenantBSchoolId,
        academicYearId: tenantBYearId,
        termId: tenantBTermId,
        scopeType: GradeScopeType.GRADE,
        scopeKey: tenantBGradeId,
        gradeId: tenantBGradeId,
        gradingScale: GradeRuleScale.PERCENTAGE,
        passMark: 59,
        rounding: GradeRoundingMode.DECIMAL_1,
      },
      select: { id: true },
    });
    tenantBGradeRuleId = tenantBGradeRule.id;

    const demoAssessment = await prisma.gradeAssessment.create({
      data: {
        schoolId: demoSchoolId,
        academicYearId: demoYearId,
        termId: demoTermId,
        subjectId: demoSubjectId,
        scopeType: GradeScopeType.GRADE,
        scopeKey: demoGradeId,
        stageId: demoStageId,
        gradeId: demoGradeId,
        titleEn: `${testSuffix}-assessment-a`,
        titleAr: `${testSuffix}-assessment-a-ar`,
        type: GradeAssessmentType.QUIZ,
        deliveryMode: GradeAssessmentDeliveryMode.SCORE_ONLY,
        date: new Date('2026-09-15T00:00:00.000Z'),
        weight: 20,
        maxScore: 20,
        expectedTimeMinutes: 30,
        approvalStatus: GradeAssessmentApprovalStatus.DRAFT,
      },
      select: { id: true },
    });
    demoAssessmentId = demoAssessment.id;

    const tenantBAssessment = await prisma.gradeAssessment.create({
      data: {
        schoolId: tenantBSchoolId,
        academicYearId: tenantBYearId,
        termId: tenantBTermId,
        subjectId: tenantBSubjectId,
        scopeType: GradeScopeType.GRADE,
        scopeKey: tenantBGradeId,
        stageId: tenantBStageId,
        gradeId: tenantBGradeId,
        titleEn: `${testSuffix}-assessment-b`,
        titleAr: `${testSuffix}-assessment-b-ar`,
        type: GradeAssessmentType.QUIZ,
        deliveryMode: GradeAssessmentDeliveryMode.SCORE_ONLY,
        date: new Date('2026-09-15T00:00:00.000Z'),
        weight: 95,
        maxScore: 20,
        expectedTimeMinutes: 30,
        approvalStatus: GradeAssessmentApprovalStatus.DRAFT,
      },
      select: { id: true },
    });
    tenantBAssessmentId = tenantBAssessment.id;

    const demoQuestionAssessment = await prisma.gradeAssessment.create({
      data: {
        schoolId: demoSchoolId,
        academicYearId: demoYearId,
        termId: demoTermId,
        subjectId: demoSubjectId,
        scopeType: GradeScopeType.GRADE,
        scopeKey: demoGradeId,
        stageId: demoStageId,
        gradeId: demoGradeId,
        titleEn: `${testSuffix}-question-assessment-a`,
        titleAr: `${testSuffix}-question-assessment-a-ar`,
        type: GradeAssessmentType.QUIZ,
        deliveryMode: GradeAssessmentDeliveryMode.QUESTION_BASED,
        date: new Date('2026-09-16T00:00:00.000Z'),
        weight: 0.01,
        maxScore: 10,
        expectedTimeMinutes: 30,
        approvalStatus: GradeAssessmentApprovalStatus.DRAFT,
      },
      select: { id: true },
    });
    demoQuestionAssessmentId = demoQuestionAssessment.id;

    const demoQuestionOne = await prisma.gradeAssessmentQuestion.create({
      data: {
        schoolId: demoSchoolId,
        assessmentId: demoQuestionAssessmentId,
        type: GradeQuestionType.MCQ_SINGLE,
        prompt: `${testSuffix}-question-a-1`,
        points: 5,
        sortOrder: 1,
        required: true,
      },
      select: { id: true },
    });
    demoQuestionOneId = demoQuestionOne.id;
    await prisma.gradeAssessmentQuestionOption.createMany({
      data: [
        {
          schoolId: demoSchoolId,
          assessmentId: demoQuestionAssessmentId,
          questionId: demoQuestionOneId,
          label: 'A',
          value: 'a',
          isCorrect: true,
          sortOrder: 1,
        },
        {
          schoolId: demoSchoolId,
          assessmentId: demoQuestionAssessmentId,
          questionId: demoQuestionOneId,
          label: 'B',
          value: 'b',
          isCorrect: false,
          sortOrder: 2,
        },
      ],
    });

    const demoQuestionTwo = await prisma.gradeAssessmentQuestion.create({
      data: {
        schoolId: demoSchoolId,
        assessmentId: demoQuestionAssessmentId,
        type: GradeQuestionType.SHORT_ANSWER,
        prompt: `${testSuffix}-question-a-2`,
        points: 5,
        sortOrder: 2,
        required: true,
      },
      select: { id: true },
    });
    demoQuestionTwoId = demoQuestionTwo.id;

    const tenantBQuestionAssessment = await prisma.gradeAssessment.create({
      data: {
        schoolId: tenantBSchoolId,
        academicYearId: tenantBYearId,
        termId: tenantBTermId,
        subjectId: tenantBSubjectId,
        scopeType: GradeScopeType.GRADE,
        scopeKey: tenantBGradeId,
        stageId: tenantBStageId,
        gradeId: tenantBGradeId,
        titleEn: `${testSuffix}-question-assessment-b`,
        titleAr: `${testSuffix}-question-assessment-b-ar`,
        type: GradeAssessmentType.QUIZ,
        deliveryMode: GradeAssessmentDeliveryMode.QUESTION_BASED,
        date: new Date('2026-09-16T00:00:00.000Z'),
        weight: 0.01,
        maxScore: 5,
        expectedTimeMinutes: 30,
        approvalStatus: GradeAssessmentApprovalStatus.DRAFT,
      },
      select: { id: true },
    });
    tenantBQuestionAssessmentId = tenantBQuestionAssessment.id;

    const tenantBQuestion = await prisma.gradeAssessmentQuestion.create({
      data: {
        schoolId: tenantBSchoolId,
        assessmentId: tenantBQuestionAssessmentId,
        type: GradeQuestionType.SHORT_ANSWER,
        prompt: `${testSuffix}-question-b-1`,
        points: 5,
        sortOrder: 1,
        required: true,
      },
      select: { id: true },
    });
    tenantBQuestionId = tenantBQuestion.id;

    const demoStudent = await prisma.student.create({
      data: {
        schoolId: demoSchoolId,
        organizationId: demoOrganizationId,
        firstName: `${testSuffix}-student-a`,
        lastName: 'One',
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    demoStudentId = demoStudent.id;

    const demoEnrollment = await prisma.enrollment.create({
      data: {
        schoolId: demoSchoolId,
        studentId: demoStudentId,
        academicYearId: demoYearId,
        termId: demoTermId,
        classroomId: demoClassroomId,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      select: { id: true },
    });
    demoEnrollmentId = demoEnrollment.id;

    const demoStudentTwo = await prisma.student.create({
      data: {
        schoolId: demoSchoolId,
        organizationId: demoOrganizationId,
        firstName: `${testSuffix}-student-a`,
        lastName: 'Two',
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    demoStudentTwoId = demoStudentTwo.id;

    await prisma.enrollment.create({
      data: {
        schoolId: demoSchoolId,
        studentId: demoStudentTwoId,
        academicYearId: demoYearId,
        termId: demoTermId,
        classroomId: demoClassroomId,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    });

    const tenantBStudent = await prisma.student.create({
      data: {
        schoolId: tenantBSchoolId,
        organizationId: tenantBOrganizationId,
        firstName: `${testSuffix}-student-b`,
        lastName: 'One',
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    tenantBStudentId = tenantBStudent.id;

    await prisma.enrollment.create({
      data: {
        schoolId: tenantBSchoolId,
        studentId: tenantBStudentId,
        academicYearId: tenantBYearId,
        termId: tenantBTermId,
        classroomId: tenantBClassroomId,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    });

    viewOnlyRoleId = await createPermissionRole({
      key: 'grades_rules_view_only',
      name: 'Grades Rules View Only',
      permissionIds: [
        rulesViewPermission.id,
        assessmentsViewPermission.id,
        questionsViewPermission.id,
        itemsViewPermission.id,
      ],
    });
    manageOnlyRoleId = await createPermissionRole({
      key: 'grades_rules_manage_only',
      name: 'Grades Rules Manage Only',
      permissionIds: [
        rulesManagePermission.id,
        assessmentsManagePermission.id,
        questionsManagePermission.id,
        itemsManagePermission.id,
      ],
    });

    viewOnlyUserId = await createScopedUser({
      email: VIEW_ONLY_EMAIL,
      password: VIEW_ONLY_PASSWORD,
      roleId: viewOnlyRoleId,
    });
    manageOnlyUserId = await createScopedUser({
      email: MANAGE_ONLY_EMAIL,
      password: MANAGE_ONLY_PASSWORD,
      roleId: manageOnlyRoleId,
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
      const assessmentIdsForCleanup = [
        demoAssessmentId,
        tenantBAssessmentId,
        demoQuestionAssessmentId,
        tenantBQuestionAssessmentId,
      ].filter(Boolean);

      await prisma.gradeSubmissionAnswerOption.deleteMany({
        where: {
          answer: {
            assessment: {
              titleEn: { startsWith: testSuffix },
            },
          },
        },
      });
      await prisma.gradeSubmissionAnswer.deleteMany({
        where: {
          assessment: {
            titleEn: { startsWith: testSuffix },
          },
        },
      });
      await prisma.gradeSubmission.deleteMany({
        where: {
          assessment: {
            titleEn: { startsWith: testSuffix },
          },
        },
      });
      await prisma.gradeAssessmentQuestionOption.deleteMany({
        where: {
          OR: [
            { assessmentId: { in: assessmentIdsForCleanup } },
            { assessment: { titleEn: { startsWith: testSuffix } } },
          ],
        },
      });
      await prisma.gradeAssessmentQuestion.deleteMany({
        where: {
          OR: [
            { assessmentId: { in: assessmentIdsForCleanup } },
            { assessment: { titleEn: { startsWith: testSuffix } } },
          ],
        },
      });
      await prisma.gradeItem.deleteMany({
        where: {
          OR: [
            {
              assessmentId: {
                in: assessmentIdsForCleanup,
              },
            },
            {
              studentId: {
                in: [demoStudentId, demoStudentTwoId, tenantBStudentId].filter(
                  Boolean,
                ),
              },
            },
            {
              assessment: {
                titleEn: { startsWith: testSuffix },
              },
            },
          ],
        },
      });
      await prisma.gradeAssessment.deleteMany({
        where: {
          OR: [
            {
              id: {
                in: assessmentIdsForCleanup,
              },
            },
            { titleEn: { startsWith: testSuffix } },
          ],
        },
      });
      await prisma.gradeRule.deleteMany({
        where: {
          id: {
            in: [
              demoSchoolRuleId,
              demoGradeRuleId,
              tenantBSchoolRuleId,
              tenantBGradeRuleId,
            ].filter(Boolean),
          },
        },
      });
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            {
              resourceId: {
                in: [
                  demoSchoolRuleId,
                  demoGradeRuleId,
                  tenantBSchoolRuleId,
                  tenantBGradeRuleId,
                  demoAssessmentId,
                  tenantBAssessmentId,
                  demoQuestionAssessmentId,
                  tenantBQuestionAssessmentId,
                  demoQuestionOneId,
                  demoQuestionTwoId,
                  tenantBQuestionId,
                ].filter(Boolean),
              },
            },
            {
              resourceType: 'grade_assessment',
              action: {
                in: [
                  'grades.assessment.create',
                  'grades.assessment.update',
                  'grades.assessment.delete',
                  'grades.assessment.publish',
                  'grades.assessment.approve',
                  'grades.assessment.lock',
                  'grades.items.bulk_update',
                  'grades.question.reorder',
                  'grades.question.points.bulk_update',
                ],
              },
            },
            {
              resourceType: 'grade_assessment_question',
              action: {
                in: [
                  'grades.question.create',
                  'grades.question.update',
                  'grades.question.delete',
                ],
              },
            },
            {
              resourceType: 'grade_item',
              action: 'grades.item.update',
            },
          ],
        },
      });
      await prisma.subject.deleteMany({
        where: {
          id: { in: [demoSubjectId, tenantBSubjectId].filter(Boolean) },
        },
      });
      await prisma.enrollment.deleteMany({
        where: {
          studentId: {
            in: [demoStudentId, demoStudentTwoId, tenantBStudentId].filter(
              Boolean,
            ),
          },
        },
      });
      await prisma.student.deleteMany({
        where: {
          id: {
            in: [demoStudentId, demoStudentTwoId, tenantBStudentId].filter(
              Boolean,
            ),
          },
        },
      });
      await prisma.classroom.deleteMany({
        where: {
          id: { in: [demoClassroomId, tenantBClassroomId].filter(Boolean) },
        },
      });
      await prisma.section.deleteMany({
        where: {
          id: { in: [demoSectionId, tenantBSectionId].filter(Boolean) },
        },
      });
      await prisma.grade.deleteMany({
        where: { id: { in: [demoGradeId, tenantBGradeId].filter(Boolean) } },
      });
      await prisma.stage.deleteMany({
        where: { id: { in: [demoStageId, tenantBStageId].filter(Boolean) } },
      });
      await prisma.term.deleteMany({
        where: {
          id: {
            in: [demoTermId, demoClosedTermId, tenantBTermId].filter(Boolean),
          },
        },
      });
      await prisma.academicYear.deleteMany({
        where: { id: { in: [demoYearId, tenantBYearId].filter(Boolean) } },
      });
      await prisma.session.deleteMany({
        where: {
          userId: { in: [viewOnlyUserId, manageOnlyUserId].filter(Boolean) },
        },
      });
      await prisma.membership.deleteMany({
        where: {
          userId: { in: [viewOnlyUserId, manageOnlyUserId].filter(Boolean) },
        },
      });
      await prisma.user.deleteMany({
        where: {
          id: { in: [viewOnlyUserId, manageOnlyUserId].filter(Boolean) },
        },
      });
      await prisma.rolePermission.deleteMany({
        where: {
          roleId: { in: [viewOnlyRoleId, manageOnlyRoleId].filter(Boolean) },
        },
      });
      await prisma.role.deleteMany({
        where: {
          id: { in: [viewOnlyRoleId, manageOnlyRoleId].filter(Boolean) },
        },
      });
      await prisma.school.deleteMany({ where: { id: tenantBSchoolId } });
      await prisma.organization.deleteMany({
        where: { id: tenantBOrganizationId },
      });
      await prisma.$disconnect();
    }
  });

  async function createPermissionRole(params: {
    key: string;
    name: string;
    permissionIds: string[];
  }): Promise<string> {
    const existing = await prisma.role.findFirst({
      where: { schoolId: demoSchoolId, key: params.key },
      select: { id: true },
    });

    const role = existing
      ? await prisma.role.update({
          where: { id: existing.id },
          data: {
            name: params.name,
            description: params.name,
            isSystem: false,
          },
          select: { id: true },
        })
      : await prisma.role.create({
          data: {
            schoolId: demoSchoolId,
            key: params.key,
            name: params.name,
            description: params.name,
            isSystem: false,
          },
          select: { id: true },
        });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: params.permissionIds.map((permissionId) => ({
        roleId: role.id,
        permissionId,
      })),
      skipDuplicates: true,
    });

    return role.id;
  }

  async function createScopedUser(params: {
    email: string;
    password: string;
    roleId: string;
  }): Promise<string> {
    const passwordHash = await argon2.hash(params.password, ARGON2_OPTIONS);
    const user = await prisma.user.upsert({
      where: { email: params.email },
      update: {
        firstName: 'Grades',
        lastName: 'Rules',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash,
      },
      create: {
        email: params.email,
        firstName: 'Grades',
        lastName: 'Rules',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash,
      },
      select: { id: true },
    });

    const existingMembership = await prisma.membership.findFirst({
      where: {
        userId: user.id,
        organizationId: demoOrganizationId,
        schoolId: demoSchoolId,
      },
      select: { id: true },
    });

    if (existingMembership) {
      await prisma.membership.update({
        where: { id: existingMembership.id },
        data: {
          roleId: params.roleId,
          userType: UserType.SCHOOL_USER,
          status: MembershipStatus.ACTIVE,
          endedAt: null,
        },
      });
    } else {
      await prisma.membership.create({
        data: {
          userId: user.id,
          organizationId: demoOrganizationId,
          schoolId: demoSchoolId,
          roleId: params.roleId,
          userType: UserType.SCHOOL_USER,
          status: MembershipStatus.ACTIVE,
        },
      });
    }

    return user.id;
  }

  async function login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password })
      .expect(200);

    return { accessToken: response.body.accessToken };
  }

  function assessmentPayload(overrides?: Record<string, unknown>) {
    return {
      yearId: demoYearId,
      termId: demoTermId,
      subjectId: demoSubjectId,
      scopeType: 'grade',
      gradeId: demoGradeId,
      titleEn: `${testSuffix}-created-assessment`,
      titleAr: `${testSuffix}-created-assessment-ar`,
      type: 'QUIZ',
      deliveryMode: 'SCORE_ONLY',
      date: '2026-09-20',
      weight: 10,
      maxScore: 20,
      expectedTimeMinutes: 30,
      ...overrides,
    };
  }

  async function createDemoWorkflowAssessment(overrides?: {
    approvalStatus?: GradeAssessmentApprovalStatus;
    termId?: string;
    date?: Date;
    lockedAt?: Date | null;
    titleSuffix?: string;
    weight?: number;
  }): Promise<string> {
    const approvalStatus =
      overrides?.approvalStatus ?? GradeAssessmentApprovalStatus.DRAFT;
    const publishedAt =
      approvalStatus === GradeAssessmentApprovalStatus.DRAFT
        ? null
        : new Date('2026-09-16T08:00:00.000Z');
    const approvedAt =
      approvalStatus === GradeAssessmentApprovalStatus.APPROVED
        ? new Date('2026-09-17T08:00:00.000Z')
        : null;

    const assessment = await prisma.gradeAssessment.create({
      data: {
        schoolId: demoSchoolId,
        academicYearId: demoYearId,
        termId: overrides?.termId ?? demoTermId,
        subjectId: demoSubjectId,
        scopeType: GradeScopeType.GRADE,
        scopeKey: demoGradeId,
        stageId: demoStageId,
        gradeId: demoGradeId,
        titleEn: `${testSuffix}-workflow-${overrides?.titleSuffix ?? Date.now()}`,
        titleAr: `${testSuffix}-workflow-ar-${overrides?.titleSuffix ?? Date.now()}`,
        type: GradeAssessmentType.QUIZ,
        deliveryMode: GradeAssessmentDeliveryMode.SCORE_ONLY,
        date:
          overrides?.date ??
          (overrides?.termId === demoClosedTermId
            ? new Date('2027-01-15T00:00:00.000Z')
            : new Date('2026-09-25T00:00:00.000Z')),
        weight: overrides?.weight ?? 1,
        maxScore: 20,
        expectedTimeMinutes: 30,
        approvalStatus,
        publishedAt,
        publishedById: publishedAt ? viewOnlyUserId : null,
        approvedAt,
        approvedById: approvedAt ? viewOnlyUserId : null,
        lockedAt: overrides?.lockedAt ?? null,
        lockedById: overrides?.lockedAt ? viewOnlyUserId : null,
      },
      select: { id: true },
    });

    return assessment.id;
  }

  async function createTenantBWorkflowAssessment(overrides?: {
    approvalStatus?: GradeAssessmentApprovalStatus;
    lockedAt?: Date | null;
    titleSuffix?: string;
  }): Promise<string> {
    const approvalStatus =
      overrides?.approvalStatus ?? GradeAssessmentApprovalStatus.PUBLISHED;
    const publishedAt =
      approvalStatus === GradeAssessmentApprovalStatus.DRAFT
        ? null
        : new Date('2026-09-16T08:00:00.000Z');
    const approvedAt =
      approvalStatus === GradeAssessmentApprovalStatus.APPROVED
        ? new Date('2026-09-17T08:00:00.000Z')
        : null;

    const assessment = await prisma.gradeAssessment.create({
      data: {
        schoolId: tenantBSchoolId,
        academicYearId: tenantBYearId,
        termId: tenantBTermId,
        subjectId: tenantBSubjectId,
        scopeType: GradeScopeType.GRADE,
        scopeKey: tenantBGradeId,
        stageId: tenantBStageId,
        gradeId: tenantBGradeId,
        titleEn: `${testSuffix}-tenant-b-read-${overrides?.titleSuffix ?? Date.now()}`,
        titleAr: `${testSuffix}-tenant-b-read-ar-${overrides?.titleSuffix ?? Date.now()}`,
        type: GradeAssessmentType.QUIZ,
        deliveryMode: GradeAssessmentDeliveryMode.SCORE_ONLY,
        date: new Date('2026-09-25T00:00:00.000Z'),
        weight: 0.01,
        maxScore: 20,
        expectedTimeMinutes: 30,
        approvalStatus,
        publishedAt,
        publishedById: publishedAt ? viewOnlyUserId : null,
        approvedAt,
        approvedById: approvedAt ? viewOnlyUserId : null,
        lockedAt: overrides?.lockedAt ?? null,
        lockedById: overrides?.lockedAt ? viewOnlyUserId : null,
      },
      select: { id: true },
    });

    return assessment.id;
  }

  function questionPayload(overrides?: Record<string, unknown>) {
    return {
      type: 'MCQ_SINGLE',
      prompt: `${testSuffix}-question-created`,
      points: 5,
      options: [
        { label: 'A', value: 'a', isCorrect: true },
        { label: 'B', value: 'b', isCorrect: false },
      ],
      ...overrides,
    };
  }

  async function createDemoQuestionAssessment(overrides?: {
    approvalStatus?: GradeAssessmentApprovalStatus;
    lockedAt?: Date | null;
    termId?: string;
    titleSuffix?: string;
  }): Promise<string> {
    const approvalStatus =
      overrides?.approvalStatus ?? GradeAssessmentApprovalStatus.DRAFT;
    const publishedAt =
      approvalStatus === GradeAssessmentApprovalStatus.DRAFT
        ? null
        : new Date('2026-09-16T08:00:00.000Z');
    const approvedAt =
      approvalStatus === GradeAssessmentApprovalStatus.APPROVED
        ? new Date('2026-09-17T08:00:00.000Z')
        : null;

    const assessment = await prisma.gradeAssessment.create({
      data: {
        schoolId: demoSchoolId,
        academicYearId: demoYearId,
        termId: overrides?.termId ?? demoTermId,
        subjectId: demoSubjectId,
        scopeType: GradeScopeType.GRADE,
        scopeKey: demoGradeId,
        stageId: demoStageId,
        gradeId: demoGradeId,
        titleEn: `${testSuffix}-question-workflow-${overrides?.titleSuffix ?? Date.now()}`,
        titleAr: `${testSuffix}-question-workflow-ar-${overrides?.titleSuffix ?? Date.now()}`,
        type: GradeAssessmentType.QUIZ,
        deliveryMode: GradeAssessmentDeliveryMode.QUESTION_BASED,
        date:
          overrides?.termId === demoClosedTermId
            ? new Date('2027-01-15T00:00:00.000Z')
            : new Date('2026-09-26T00:00:00.000Z'),
        weight: 0.01,
        maxScore: 10,
        expectedTimeMinutes: 30,
        approvalStatus,
        publishedAt,
        publishedById: publishedAt ? viewOnlyUserId : null,
        approvedAt,
        approvedById: approvedAt ? viewOnlyUserId : null,
        lockedAt: overrides?.lockedAt ?? null,
        lockedById: overrides?.lockedAt ? viewOnlyUserId : null,
      },
      select: { id: true },
    });

    return assessment.id;
  }

  async function createQuestionForAssessment(params: {
    assessmentId: string;
    sortOrder: number;
    points?: number;
  }): Promise<string> {
    const question = await prisma.gradeAssessmentQuestion.create({
      data: {
        schoolId: demoSchoolId,
        assessmentId: params.assessmentId,
        type: GradeQuestionType.SHORT_ANSWER,
        prompt: `${testSuffix}-helper-question-${params.sortOrder}`,
        points: params.points ?? 5,
        sortOrder: params.sortOrder,
        required: true,
      },
      select: { id: true },
    });

    return question.id;
  }

  it('school A gradebook does not include school B students, assessments, or items', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const demoReadAssessmentId = await createDemoWorkflowAssessment({
      approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
      titleSuffix: 'read-gradebook-a',
      weight: 0.01,
    });
    const tenantBReadAssessmentId = await createTenantBWorkflowAssessment({
      approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
      titleSuffix: 'read-gradebook-b',
    });

    await prisma.gradeItem.create({
      data: {
        schoolId: demoSchoolId,
        termId: demoTermId,
        assessmentId: demoReadAssessmentId,
        studentId: demoStudentId,
        score: 18,
        status: GradeItemStatus.ENTERED,
      },
    });
    const tenantBItem = await prisma.gradeItem.create({
      data: {
        schoolId: tenantBSchoolId,
        termId: tenantBTermId,
        assessmentId: tenantBReadAssessmentId,
        studentId: tenantBStudentId,
        score: 19,
        status: GradeItemStatus.ENTERED,
      },
      select: { id: true },
    });

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/gradebook`)
      .query({
        yearId: demoYearId,
        termId: demoTermId,
        scopeType: 'grade',
        gradeId: demoGradeId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const studentIds = response.body.rows.map(
      (row: { studentId: string }) => row.studentId,
    );
    const assessmentIds = response.body.columns.map(
      (column: { assessmentId: string }) => column.assessmentId,
    );
    const itemIds = response.body.rows.flatMap(
      (row: { cells: Array<{ itemId: string | null }> }) =>
        row.cells.map((cell) => cell.itemId),
    );

    expect(studentIds).toEqual(
      expect.arrayContaining([demoStudentId, demoStudentTwoId]),
    );
    expect(studentIds).not.toContain(tenantBStudentId);
    expect(assessmentIds).toContain(demoReadAssessmentId);
    expect(assessmentIds).not.toContain(tenantBReadAssessmentId);
    expect(itemIds).not.toContain(tenantBItem.id);
  });

  it('school A gradebook for school B scope returns 404', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/gradebook`)
      .query({
        yearId: demoYearId,
        termId: demoTermId,
        scopeType: 'grade',
        gradeId: tenantBGradeId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('school A analytics does not include school B data', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    await createTenantBWorkflowAssessment({
      approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
      titleSuffix: 'read-analytics-b',
    });

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/analytics/summary`)
      .query({
        yearId: demoYearId,
        termId: demoTermId,
        scopeType: 'grade',
        gradeId: demoGradeId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.studentCount).toBe(2);
  });

  it('school A analytics for school B scope returns 404', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/analytics/summary`)
      .query({
        yearId: demoYearId,
        termId: demoTermId,
        scopeType: 'grade',
        gradeId: tenantBGradeId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('school A cannot fetch school B student snapshot', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/students/${tenantBStudentId}/snapshot`)
      .query({ yearId: demoYearId, termId: demoTermId })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 403 when the same-school actor lacks grades.gradebook.view', async () => {
    const { accessToken } = await login(
      MANAGE_ONLY_EMAIL,
      MANAGE_ONLY_PASSWORD,
    );

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/gradebook`)
      .query({
        yearId: demoYearId,
        termId: demoTermId,
        scopeType: 'grade',
        gradeId: demoGradeId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('returns 403 when the same-school actor lacks grades.analytics.view', async () => {
    const { accessToken } = await login(
      MANAGE_ONLY_EMAIL,
      MANAGE_ONLY_PASSWORD,
    );

    const summaryResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/analytics/summary`)
      .query({
        yearId: demoYearId,
        termId: demoTermId,
        scopeType: 'grade',
        gradeId: demoGradeId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
    expect(summaryResponse.body?.error?.code).toBe('auth.scope.missing');

    const distributionResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/analytics/distribution`)
      .query({
        yearId: demoYearId,
        termId: demoTermId,
        scopeType: 'grade',
        gradeId: demoGradeId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
    expect(distributionResponse.body?.error?.code).toBe('auth.scope.missing');
  });

  it('returns 403 when the same-school actor lacks grades.snapshots.view', async () => {
    const { accessToken } = await login(
      MANAGE_ONLY_EMAIL,
      MANAGE_ONLY_PASSWORD,
    );

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/students/${demoStudentId}/snapshot`)
      .query({ yearId: demoYearId, termId: demoTermId })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('school admin can read gradebook, analytics, distribution, and snapshot', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const query = {
      yearId: demoYearId,
      termId: demoTermId,
      scopeType: 'grade',
      gradeId: demoGradeId,
    };

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/gradebook`)
      .query(query)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/analytics/summary`)
      .query(query)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/analytics/distribution`)
      .query(query)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/students/${demoStudentId}/snapshot`)
      .query({ yearId: demoYearId, termId: demoTermId })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('gradebook and analytics do not include DRAFT assessments', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const gradebookResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/gradebook`)
      .query({
        yearId: demoYearId,
        termId: demoTermId,
        scopeType: 'grade',
        gradeId: demoGradeId,
        assessmentStatus: 'DRAFT',
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(gradebookResponse.body.columns).toHaveLength(0);

    const analyticsResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/analytics/summary`)
      .query({
        yearId: demoYearId,
        termId: demoTermId,
        scopeType: 'grade',
        gradeId: demoGradeId,
        assessmentStatus: 'DRAFT',
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(analyticsResponse.body.assessmentCount).toBe(0);
  });

  it('gradebook and analytics include locked approved assessments as readable', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const lockedAssessmentId = await createDemoWorkflowAssessment({
      approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
      lockedAt: new Date('2026-09-20T08:00:00.000Z'),
      titleSuffix: 'read-locked-approved',
      weight: 0.01,
    });

    const gradebookResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/gradebook`)
      .query({
        yearId: demoYearId,
        termId: demoTermId,
        scopeType: 'grade',
        gradeId: demoGradeId,
        assessmentStatus: 'APPROVED',
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(
      gradebookResponse.body.columns.map(
        (column: { assessmentId: string }) => column.assessmentId,
      ),
    ).toContain(lockedAssessmentId);

    const analyticsResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/analytics/summary`)
      .query({
        yearId: demoYearId,
        termId: demoTermId,
        scopeType: 'grade',
        gradeId: demoGradeId,
        assessmentStatus: 'APPROVED',
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(analyticsResponse.body.assessmentCount).toBeGreaterThan(0);
  });

  it('school A list does not include school B grade rules', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/rules`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const ids = response.body.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(demoSchoolRuleId);
    expect(ids).toContain(demoGradeRuleId);
    expect(ids).not.toContain(tenantBSchoolRuleId);
    expect(ids).not.toContain(tenantBGradeRuleId);
  });

  it('school A list does not include school B assessments', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/assessments`)
      .query({ yearId: demoYearId, termId: demoTermId })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const ids = response.body.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(demoAssessmentId);
    expect(ids).not.toContain(tenantBAssessmentId);
  });

  it('returns 404 when school A reads a school B assessment', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/assessments/${tenantBAssessmentId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A updates a school B grade rule', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/grades/rules/${tenantBGradeRuleId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ passMark: 62 })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A creates a rule using a school B grade id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/grades/rules`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        yearId: demoYearId,
        termId: demoTermId,
        scopeType: 'grade',
        gradeId: tenantBGradeId,
        passMark: 54,
      })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it.each([
    ['academic year', () => ({ yearId: tenantBYearId })],
    ['term', () => ({ termId: tenantBTermId })],
    ['subject', () => ({ subjectId: tenantBSubjectId })],
    ['grade scope', () => ({ gradeId: tenantBGradeId })],
  ])(
    'returns 404 when school A creates an assessment using school B %s',
    async (_label, resolveOverrides) => {
      const { accessToken } = await login(
        DEMO_ADMIN_EMAIL,
        DEMO_ADMIN_PASSWORD,
      );

      const response = await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/grades/assessments`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(
          assessmentPayload({
            titleEn: `${testSuffix}-cross-school-create-${_label}`,
            ...resolveOverrides(),
          }),
        )
        .expect(404);

      expect(response.body?.error?.code).toBe('not_found');
    },
  );

  it('returns 404 when school A updates a school B assessment', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/grades/assessments/${tenantBAssessmentId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ titleEn: `${testSuffix}-should-not-update` })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A deletes a school B assessment', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/grades/assessments/${tenantBAssessmentId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it.each([
    ['publish', 'publish'],
    ['approve', 'approve'],
    ['lock', 'lock'],
  ])(
    'returns 404 when school A attempts to %s a school B assessment',
    async (_label, workflowAction) => {
      const { accessToken } = await login(
        DEMO_ADMIN_EMAIL,
        DEMO_ADMIN_PASSWORD,
      );

      const response = await request(app.getHttpServer())
        .post(
          `${GLOBAL_PREFIX}/grades/assessments/${tenantBAssessmentId}/${workflowAction}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      expect(response.body?.error?.code).toBe('not_found');
    },
  );

  it.each([
    ['grade', 'gradeId', () => tenantBGradeId],
    ['section', 'sectionId', () => tenantBSectionId],
    ['classroom', 'classroomId', () => tenantBClassroomId],
  ])(
    'returns 404 when school A resolves effective rule for school B %s',
    async (scopeType, idField, resolveId) => {
      const { accessToken } = await login(
        DEMO_ADMIN_EMAIL,
        DEMO_ADMIN_PASSWORD,
      );

      const response = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/grades/rules/effective`)
        .query({
          yearId: demoYearId,
          termId: demoTermId,
          scopeType,
          [idField]: resolveId(),
        })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      expect(response.body?.error?.code).toBe('not_found');
    },
  );

  it('returns 403 when the same-school actor lacks grades.rules.view', async () => {
    const { accessToken } = await login(
      MANAGE_ONLY_EMAIL,
      MANAGE_ONLY_PASSWORD,
    );

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/rules`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/rules/effective`)
      .query({
        yearId: demoYearId,
        termId: demoTermId,
        scopeType: 'grade',
        gradeId: demoGradeId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('returns 403 when the same-school actor lacks grades.assessments.view', async () => {
    const { accessToken } = await login(
      MANAGE_ONLY_EMAIL,
      MANAGE_ONLY_PASSWORD,
    );

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/assessments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/assessments/${demoAssessmentId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('returns 403 when the same-school actor lacks grades.rules.manage', async () => {
    const { accessToken } = await login(VIEW_ONLY_EMAIL, VIEW_ONLY_PASSWORD);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/grades/rules`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        yearId: demoYearId,
        termId: demoTermId,
        scopeType: 'school',
        passMark: 53,
      })
      .expect(403);

    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/grades/rules/${demoSchoolRuleId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ passMark: 53 })
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('returns 403 when the same-school actor lacks grades.assessments.manage', async () => {
    const { accessToken } = await login(VIEW_ONLY_EMAIL, VIEW_ONLY_PASSWORD);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/grades/assessments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        assessmentPayload({
          titleEn: `${testSuffix}-forbidden-create-assessment`,
        }),
      )
      .expect(403);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/grades/assessments/${demoAssessmentId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ titleEn: `${testSuffix}-forbidden-update-assessment` })
      .expect(403);

    const response = await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/grades/assessments/${demoAssessmentId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it.each([
    ['grades.assessments.publish', 'publish'],
    ['grades.assessments.approve', 'approve'],
    ['grades.assessments.lock', 'lock'],
  ])(
    'returns 403 when the same-school actor lacks %s',
    async (_permission, workflowAction) => {
      const { accessToken } = await login(
        MANAGE_ONLY_EMAIL,
        MANAGE_ONLY_PASSWORD,
      );

      const response = await request(app.getHttpServer())
        .post(
          `${GLOBAL_PREFIX}/grades/assessments/${demoAssessmentId}/${workflowAction}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);

      expect(response.body?.error?.code).toBe('auth.scope.missing');
    },
  );

  it('school A cannot list questions for a school B assessment', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/grades/assessments/${tenantBQuestionAssessmentId}/questions`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('school A cannot create a question for a school B assessment', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/grades/assessments/${tenantBQuestionAssessmentId}/questions`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send(questionPayload())
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('school A cannot update or delete a school B question', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const updateResponse = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/grades/questions/${tenantBQuestionId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ prompt: `${testSuffix}-forbidden-question-update` })
      .expect(404);
    expect(updateResponse.body?.error?.code).toBe('not_found');

    const deleteResponse = await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/grades/questions/${tenantBQuestionId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    expect(deleteResponse.body?.error?.code).toBe('not_found');
  });

  it('school A cannot reorder questions using a school B question id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/grades/assessments/${demoQuestionAssessmentId}/questions/reorder`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ questionIds: [demoQuestionOneId, tenantBQuestionId] })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('school A cannot bulk update points using a school B question id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/grades/assessments/${demoQuestionAssessmentId}/questions/points/bulk`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        items: [
          { questionId: demoQuestionOneId, points: 4 },
          { questionId: tenantBQuestionId, points: 6 },
        ],
      })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 403 when the same-school actor lacks grades.questions.view', async () => {
    const { accessToken } = await login(
      MANAGE_ONLY_EMAIL,
      MANAGE_ONLY_PASSWORD,
    );

    const response = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/grades/assessments/${demoQuestionAssessmentId}/questions`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('returns 403 when the same-school actor lacks grades.questions.manage', async () => {
    const { accessToken } = await login(VIEW_ONLY_EMAIL, VIEW_ONLY_PASSWORD);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/grades/assessments/${demoQuestionAssessmentId}/questions`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        questionPayload({ prompt: `${testSuffix}-forbidden-create-question` }),
      )
      .expect(403);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/grades/questions/${demoQuestionOneId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ prompt: `${testSuffix}-forbidden-update-question` })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/grades/questions/${demoQuestionOneId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/grades/assessments/${demoQuestionAssessmentId}/questions/reorder`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ questionIds: [demoQuestionTwoId, demoQuestionOneId] })
      .expect(403);

    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/grades/assessments/${demoQuestionAssessmentId}/questions/points/bulk`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        items: [
          { questionId: demoQuestionOneId, points: 5 },
          { questionId: demoQuestionTwoId, points: 5 },
        ],
      })
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('lists active questions sorted and excludes soft-deleted questions and options', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const deletedQuestion = await prisma.gradeAssessmentQuestion.create({
      data: {
        schoolId: demoSchoolId,
        assessmentId: demoQuestionAssessmentId,
        type: GradeQuestionType.SHORT_ANSWER,
        prompt: `${testSuffix}-deleted-question`,
        points: 1,
        sortOrder: 90,
        required: true,
        deletedAt: new Date('2026-09-17T08:00:00.000Z'),
      },
      select: { id: true },
    });

    await prisma.gradeAssessmentQuestionOption.create({
      data: {
        schoolId: demoSchoolId,
        assessmentId: demoQuestionAssessmentId,
        questionId: demoQuestionOneId,
        label: `${testSuffix}-deleted-option`,
        value: 'deleted',
        isCorrect: false,
        sortOrder: 90,
        deletedAt: new Date('2026-09-17T08:05:00.000Z'),
      },
    });

    const response = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/grades/assessments/${demoQuestionAssessmentId}/questions`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const questionIds = response.body.questions.map(
      (q: { id: string }) => q.id,
    );
    expect(questionIds).toEqual([demoQuestionOneId, demoQuestionTwoId]);
    expect(questionIds).not.toContain(deletedQuestion.id);

    const firstQuestion = response.body.questions.find(
      (q: { id: string }) => q.id === demoQuestionOneId,
    );
    expect(firstQuestion.options).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ label: `${testSuffix}-deleted-option` }),
      ]),
    );
  });

  it('school admin can manage question CRUD, reorder, and bulk points', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const createResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/grades/assessments/${demoQuestionAssessmentId}/questions`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        questionPayload({
          prompt: `${testSuffix}-admin-created-question`,
          points: 2,
        }),
      )
      .expect(201);

    const createdQuestionId = createResponse.body.id;
    expect(createResponse.body).toMatchObject({
      assessmentId: demoQuestionAssessmentId,
      type: 'mcq_single',
      points: 2,
      options: expect.arrayContaining([
        expect.objectContaining({ isCorrect: true }),
      ]),
    });

    const listResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/grades/assessments/${demoQuestionAssessmentId}/questions`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(
      listResponse.body.questions.map((q: { id: string }) => q.id),
    ).toEqual(
      expect.arrayContaining([
        demoQuestionOneId,
        demoQuestionTwoId,
        createdQuestionId,
      ]),
    );

    const updateResponse = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/grades/questions/${createdQuestionId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        prompt: `${testSuffix}-admin-updated-question`,
        options: [
          { label: 'Updated A', value: 'a', isCorrect: false },
          { label: 'Updated B', value: 'b', isCorrect: true },
        ],
      })
      .expect(200);

    expect(updateResponse.body).toMatchObject({
      id: createdQuestionId,
      prompt: `${testSuffix}-admin-updated-question`,
      options: [
        expect.objectContaining({ label: 'Updated A', isCorrect: false }),
        expect.objectContaining({ label: 'Updated B', isCorrect: true }),
      ],
    });

    const activeQuestionIds = listResponse.body.questions.map(
      (q: { id: string }) => q.id,
    );
    const reorderResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/grades/assessments/${demoQuestionAssessmentId}/questions/reorder`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ questionIds: [...activeQuestionIds].reverse() })
      .expect(201);

    expect(reorderResponse.body.questions[0].id).toBe(createdQuestionId);

    const bulkResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/grades/assessments/${demoQuestionAssessmentId}/questions/points/bulk`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        items: activeQuestionIds.map((questionId: string, index: number) => ({
          questionId,
          points: index + 1,
        })),
      })
      .expect(201);

    expect(bulkResponse.body.totalPoints).toBe(6);
    expect(bulkResponse.body.pointsMatchMaxScore).toBe(false);

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/grades/questions/${createdQuestionId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ ok: true });
      });
  });

  it('rejects SCORE_ONLY assessment question management', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/grades/assessments/${demoAssessmentId}/questions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(questionPayload())
      .expect(400);

    expect(response.body?.error?.code).toBe('validation.failed');
  });

  it('rejects question mutations on published, approved, and locked assessments', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const publishedAssessmentId = await createDemoQuestionAssessment({
      approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
      titleSuffix: 'published-question-mutation',
    });
    const approvedAssessmentId = await createDemoQuestionAssessment({
      approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
      titleSuffix: 'approved-question-mutation',
    });
    const lockedAssessmentId = await createDemoQuestionAssessment({
      approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
      lockedAt: new Date('2026-09-18T08:00:00.000Z'),
      titleSuffix: 'locked-question-mutation',
    });

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/grades/assessments/${publishedAssessmentId}/questions`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send(questionPayload())
      .expect(409)
      .expect(({ body }) => {
        expect(body?.error?.code).toBe(
          'grades.assessment.invalid_status_transition',
        );
      });

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/grades/assessments/${approvedAssessmentId}/questions`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send(questionPayload())
      .expect(409)
      .expect(({ body }) => {
        expect(body?.error?.code).toBe(
          'grades.assessment.invalid_status_transition',
        );
      });

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/grades/assessments/${lockedAssessmentId}/questions`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send(questionPayload())
      .expect(409)
      .expect(({ body }) => {
        expect(body?.error?.code).toBe('grades.assessment.locked');
      });
  });

  it('rejects question mutations when submissions already exist', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const assessmentId = await createDemoQuestionAssessment({
      titleSuffix: 'submission-question-mutation',
    });
    await createQuestionForAssessment({ assessmentId, sortOrder: 1 });
    await prisma.gradeSubmission.create({
      data: {
        schoolId: demoSchoolId,
        assessmentId,
        termId: demoTermId,
        studentId: demoStudentId,
        enrollmentId: demoEnrollmentId,
        status: GradeSubmissionStatus.IN_PROGRESS,
      },
    });

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/grades/assessments/${assessmentId}/questions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(questionPayload({ prompt: `${testSuffix}-blocked-by-submission` }))
      .expect(409);

    expect(response.body?.error?.code).toBe('grades.question.structure_locked');
  });

  it('school A cannot list items for a school B assessment', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/assessments/${tenantBAssessmentId}/items`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('school A cannot upsert an item for a school B assessment', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/grades/assessments/${tenantBAssessmentId}/items/${demoStudentId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'entered', score: 15 })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('school A cannot upsert an item using a school B student id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const assessmentId = await createDemoWorkflowAssessment({
      approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
      titleSuffix: 'items-cross-school-student',
    });

    const response = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/grades/assessments/${assessmentId}/items/${tenantBStudentId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'entered', score: 15 })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('school A cannot bulk upsert if any item uses a school B student id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const assessmentId = await createDemoWorkflowAssessment({
      approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
      titleSuffix: 'items-cross-school-bulk',
    });

    const response = await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/grades/assessments/${assessmentId}/items`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        items: [
          { studentId: demoStudentId, status: 'entered', score: 16 },
          { studentId: tenantBStudentId, status: 'entered', score: 17 },
        ],
      })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');

    const writtenItems = await prisma.gradeItem.count({
      where: { assessmentId },
    });
    expect(writtenItems).toBe(0);
  });

  it('returns 403 when the same-school actor lacks grades.items.view', async () => {
    const { accessToken } = await login(
      MANAGE_ONLY_EMAIL,
      MANAGE_ONLY_PASSWORD,
    );

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/assessments/${demoAssessmentId}/items`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('returns 403 when the same-school actor lacks grades.items.manage for single upsert', async () => {
    const { accessToken } = await login(VIEW_ONLY_EMAIL, VIEW_ONLY_PASSWORD);

    const response = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/grades/assessments/${demoAssessmentId}/items/${demoStudentId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'entered', score: 15 })
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('returns 403 when the same-school actor lacks grades.items.manage for bulk upsert', async () => {
    const { accessToken } = await login(VIEW_ONLY_EMAIL, VIEW_ONLY_PASSWORD);

    const response = await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/grades/assessments/${demoAssessmentId}/items`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        items: [{ studentId: demoStudentId, status: 'entered', score: 15 }],
      })
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('rejects item mutation on locked assessments', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const assessmentId = await createDemoWorkflowAssessment({
      approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
      lockedAt: new Date('2026-09-20T08:00:00.000Z'),
      titleSuffix: 'items-locked',
    });

    const response = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/grades/assessments/${assessmentId}/items/${demoStudentId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'entered', score: 15 })
      .expect(409);

    expect(response.body?.error?.code).toBe('grades.assessment.locked');
  });

  it('rejects item mutation on DRAFT assessments', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/grades/assessments/${demoAssessmentId}/items/${demoStudentId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'entered', score: 15 })
      .expect(409);

    expect(response.body?.error?.code).toBe('grades.assessment.not_published');
  });

  it('rejects item mutation in a closed or inactive term', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const assessmentId = await createDemoWorkflowAssessment({
      approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
      termId: demoClosedTermId,
      titleSuffix: 'items-closed-term',
    });

    const response = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/grades/assessments/${assessmentId}/items/${demoStudentId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'entered', score: 15 })
      .expect(409);

    expect(response.body?.error?.code).toBe('grades.term.closed');
  });

  it('returns grades.term.closed when mutating an assessment in a closed term', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/grades/assessments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        assessmentPayload({
          termId: demoClosedTermId,
          date: '2027-01-15',
          titleEn: `${testSuffix}-closed-term-assessment`,
        }),
      )
      .expect(409);

    expect(response.body?.error?.code).toBe('grades.term.closed');
  });

  it('returns grades.term.closed when publishing an assessment in a closed term', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const assessmentId = await createDemoWorkflowAssessment({
      termId: demoClosedTermId,
      titleSuffix: 'closed-term-publish',
    });

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/grades/assessments/${assessmentId}/publish`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(409);

    expect(response.body?.error?.code).toBe('grades.term.closed');
  });

  it('does not count school B assessments in school A weight budget', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/grades/assessments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        assessmentPayload({
          titleEn: `${testSuffix}-budget-school-a`,
          weight: 70,
        }),
      )
      .expect(201);

    expect(response.body).toMatchObject({
      subjectId: demoSubjectId,
      scopeType: 'grade',
      scopeKey: demoGradeId,
      weight: 70,
      approvalStatus: 'draft',
    });
  });

  it('school admin can create, read, update, and delete a score-only assessment', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const createResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/grades/assessments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        assessmentPayload({
          titleEn: `${testSuffix}-crud-assessment`,
          weight: 5,
        }),
      )
      .expect(201);

    const assessmentId = createResponse.body.id;
    expect(createResponse.body).toMatchObject({
      deliveryMode: 'SCORE_ONLY',
      approvalStatus: 'draft',
      isLocked: false,
    });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/assessments/${assessmentId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const patchResponse = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/grades/assessments/${assessmentId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ titleEn: `${testSuffix}-crud-assessment-updated`, weight: 6 })
      .expect(200);

    expect(patchResponse.body).toMatchObject({
      id: assessmentId,
      titleEn: `${testSuffix}-crud-assessment-updated`,
      weight: 6,
    });

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/grades/assessments/${assessmentId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ ok: true });
      });

    const detailAfterDelete = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/assessments/${assessmentId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(detailAfterDelete.body?.error?.code).toBe('not_found');
  });

  it('school admin can publish, approve, and lock a score-only assessment', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const assessmentId = await createDemoWorkflowAssessment({
      titleSuffix: 'admin-workflow',
    });
    const gradeItemsBefore = await prisma.gradeItem.count({
      where: { assessmentId },
    });

    const publishResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/grades/assessments/${assessmentId}/publish`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(publishResponse.body).toMatchObject({
      id: assessmentId,
      approvalStatus: 'published',
      publishedById: expect.any(String),
      isLocked: false,
    });
    expect(publishResponse.body.publishedAt).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/grades/assessments/${assessmentId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ titleEn: `${testSuffix}-published-update-blocked` })
      .expect(409)
      .expect(({ body }) => {
        expect(body?.error?.code).toBe(
          'grades.assessment.invalid_status_transition',
        );
      });

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/grades/assessments/${assessmentId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(409)
      .expect(({ body }) => {
        expect(body?.error?.code).toBe(
          'grades.assessment.invalid_status_transition',
        );
      });

    const approveResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/grades/assessments/${assessmentId}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(approveResponse.body).toMatchObject({
      id: assessmentId,
      approvalStatus: 'approved',
      approvedById: expect.any(String),
      isLocked: false,
    });
    expect(approveResponse.body.approvedAt).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/grades/assessments/${assessmentId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ titleEn: `${testSuffix}-approved-update-blocked` })
      .expect(409)
      .expect(({ body }) => {
        expect(body?.error?.code).toBe(
          'grades.assessment.invalid_status_transition',
        );
      });

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/grades/assessments/${assessmentId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(409)
      .expect(({ body }) => {
        expect(body?.error?.code).toBe(
          'grades.assessment.invalid_status_transition',
        );
      });

    const lockResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/grades/assessments/${assessmentId}/lock`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(lockResponse.body).toMatchObject({
      id: assessmentId,
      approvalStatus: 'approved',
      lockedById: expect.any(String),
      isLocked: true,
    });
    expect(lockResponse.body.lockedAt).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/grades/assessments/${assessmentId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ titleEn: `${testSuffix}-locked-update-blocked` })
      .expect(409)
      .expect(({ body }) => {
        expect(body?.error?.code).toBe('grades.assessment.locked');
      });

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/grades/assessments/${assessmentId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(409)
      .expect(({ body }) => {
        expect(body?.error?.code).toBe('grades.assessment.locked');
      });

    const gradeItemsAfter = await prisma.gradeItem.count({
      where: { assessmentId },
    });
    expect(gradeItemsAfter).toBe(gradeItemsBefore);
  });

  it('school admin can list, single upsert, and bulk upsert grade items', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const assessmentId = await createDemoWorkflowAssessment({
      approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
      titleSuffix: 'items-happy-path',
    });

    const listBefore = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/assessments/${assessmentId}/items`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const virtualStudentIds = listBefore.body.items
      .filter((item: { isVirtualMissing: boolean }) => item.isVirtualMissing)
      .map((item: { studentId: string }) => item.studentId);
    expect(virtualStudentIds).toEqual(
      expect.arrayContaining([demoStudentId, demoStudentTwoId]),
    );

    const singleResponse = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/grades/assessments/${assessmentId}/items/${demoStudentId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'entered', score: 18, comment: 'Strong work' })
      .expect(200);

    expect(singleResponse.body).toMatchObject({
      assessmentId,
      studentId: demoStudentId,
      score: 18,
      status: 'entered',
      comment: 'Strong work',
      isVirtualMissing: false,
    });

    const bulkResponse = await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/grades/assessments/${assessmentId}/items`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        items: [
          { studentId: demoStudentId, status: 'entered', score: 19 },
          { studentId: demoStudentTwoId, status: 'absent' },
        ],
      })
      .expect(200);

    expect(bulkResponse.body).toMatchObject({
      assessmentId,
      updatedCount: 2,
      items: expect.arrayContaining([
        expect.objectContaining({
          studentId: demoStudentId,
          score: 19,
          status: 'entered',
        }),
        expect.objectContaining({
          studentId: demoStudentTwoId,
          score: null,
          status: 'absent',
        }),
      ]),
    });

    const persistedItems = await prisma.gradeItem.findMany({
      where: { assessmentId },
      select: { studentId: true, status: true, score: true },
    });
    expect(persistedItems).toHaveLength(2);
    expect(
      persistedItems.find((item) => item.studentId === demoStudentTwoId),
    ).toMatchObject({
      status: GradeItemStatus.ABSENT,
      score: null,
    });
  });

  it('school admin can list, upsert, update, and resolve allowed rules', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/rules`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const upsertResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/grades/rules`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        yearId: demoYearId,
        termId: demoTermId,
        scopeType: 'school',
        passMark: 57,
      })
      .expect(201);

    expect(upsertResponse.body).toMatchObject({
      id: demoSchoolRuleId,
      scopeType: 'school',
      scopeKey: demoSchoolId,
      passMark: 57,
    });

    const patchResponse = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/grades/rules/${demoSchoolRuleId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        passMark: 58,
        rounding: 'decimal_1',
      })
      .expect(200);

    expect(patchResponse.body).toMatchObject({
      id: demoSchoolRuleId,
      passMark: 58,
      rounding: 'decimal_1',
    });

    const effectiveResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/rules/effective`)
      .query({
        yearId: demoYearId,
        termId: demoTermId,
        scopeType: 'classroom',
        classroomId: demoClassroomId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(effectiveResponse.body).toMatchObject({
      source: 'GRADE',
      ruleId: demoGradeRuleId,
      scopeType: 'grade',
      gradeId: demoGradeId,
    });
  });
});
