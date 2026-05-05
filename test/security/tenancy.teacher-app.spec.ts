import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  GradeAnswerCorrectionStatus,
  MembershipStatus,
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeQuestionType,
  GradeAssessmentType,
  GradeItemStatus,
  GradeScopeType,
  GradeSubmissionStatus,
  OrganizationStatus,
  FileVisibility,
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

jest.setTimeout(45000);

describe('Teacher App tenancy isolation (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationAId: string;
  let organizationBId: string;
  let schoolAId: string;
  let schoolBId: string;
  let teacherAEmail: string;
  let teacherBEmail: string;
  let teacherCrossSchoolEmail: string;
  let adminEmail: string;
  let parentEmail: string;
  let studentEmail: string;
  let teacherAId: string;
  let teacherBId: string;
  let teacherCrossSchoolId: string;
  let ownAllocationId: string;
  let otherTeacherAllocationId: string;
  let crossSchoolAllocationId: string;
  let ownAssessmentId: string;
  let ownAssignmentId: string;
  let ownAssignmentSubmissionId: string;
  let ownAssignmentAnswerId: string;
  let otherAssignmentSubmissionId: string;
  let otherAssignmentAnswerId: string;
  let outsideStudentSubmissionId: string;
  let outsideStudentAnswerId: string;
  let crossSchoolSubmissionId: string;
  let crossSchoolAnswerId: string;
  let otherClassroomAssignmentId: string;
  let otherSubjectAssignmentId: string;
  let otherTermAssignmentId: string;
  let otherTeacherAssessmentId: string;
  let crossSchoolAssessmentId: string;
  let ownTaskId: string;
  let otherTeacherTaskId: string;
  let crossSchoolTaskId: string;
  let ownStudentIds: string[] = [];
  let otherTeacherStudentIds: string[] = [];
  let crossSchoolStudentIds: string[] = [];

  const testSuffix = `teacher-app-security-${Date.now()}`;
  const createdUserIds: string[] = [];
  const createdStudentIds: string[] = [];
  const createdGuardianIds: string[] = [];
  const createdStudentGuardianIds: string[] = [];
  const createdMedicalProfileStudentIds: string[] = [];
  const createdEnrollmentIds: string[] = [];
  const createdGradeItemIds: string[] = [];
  const createdGradeSubmissionAnswerIds: string[] = [];
  const createdGradeSubmissionIds: string[] = [];
  const createdGradeQuestionIds: string[] = [];
  const createdGradeAssessmentIds: string[] = [];
  const createdReinforcementSubmissionIds: string[] = [];
  const createdReinforcementStageIds: string[] = [];
  const createdReinforcementAssignmentIds: string[] = [];
  const createdReinforcementTargetIds: string[] = [];
  const createdReinforcementTaskIds: string[] = [];
  const createdFileIds: string[] = [];
  const createdAllocationIds: string[] = [];
  const createdSubjectIds: string[] = [];
  const createdClassroomIds: string[] = [];
  const createdSectionIds: string[] = [];
  const createdGradeIds: string[] = [];
  const createdStageIds: string[] = [];
  const createdTermIds: string[] = [];
  const createdYearIds: string[] = [];

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
        slug: `${testSuffix}-org-a`,
        name: `${testSuffix} Org A`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    organizationAId = orgA.id;

    const orgB = await prisma.organization.create({
      data: {
        slug: `${testSuffix}-org-b`,
        name: `${testSuffix} Org B`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    organizationBId = orgB.id;

    const schoolA = await prisma.school.create({
      data: {
        organizationId: organizationAId,
        slug: `${testSuffix}-school-a`,
        name: `${testSuffix} School A`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    schoolAId = schoolA.id;

    const schoolB = await prisma.school.create({
      data: {
        organizationId: organizationBId,
        slug: `${testSuffix}-school-b`,
        name: `${testSuffix} School B`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    schoolBId = schoolB.id;

    await prisma.schoolProfile.create({
      data: {
        schoolId: schoolAId,
        schoolName: `${testSuffix} Academy`,
        logoUrl: 'raw-storage-logo-should-not-be-returned',
      },
    });

    teacherAEmail = `${testSuffix}-teacher-a@security.moazez.local`;
    teacherBEmail = `${testSuffix}-teacher-b@security.moazez.local`;
    teacherCrossSchoolEmail = `${testSuffix}-teacher-cross@security.moazez.local`;
    adminEmail = `${testSuffix}-admin@security.moazez.local`;
    parentEmail = `${testSuffix}-parent@security.moazez.local`;
    studentEmail = `${testSuffix}-student@security.moazez.local`;

    teacherAId = await createUserWithMembership({
      email: teacherAEmail,
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    teacherBId = await createUserWithMembership({
      email: teacherBEmail,
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    teacherCrossSchoolId = await createUserWithMembership({
      email: teacherCrossSchoolEmail,
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId: organizationBId,
      schoolId: schoolBId,
    });
    await createUserWithMembership({
      email: adminEmail,
      userType: UserType.SCHOOL_USER,
      roleId: schoolAdminRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    await createUserWithMembership({
      email: parentEmail,
      userType: UserType.PARENT,
      roleId: parentRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    await createUserWithMembership({
      email: studentEmail,
      userType: UserType.STUDENT,
      roleId: studentRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });

    const ownFixture = await createAcademicFixture({
      organizationId: organizationAId,
      schoolId: schoolAId,
      teacherUserId: teacherAId,
      marker: 'own',
      studentCount: 2,
    });
    ownAllocationId = ownFixture.allocationId;
    ownStudentIds = ownFixture.studentIds;

    const otherTeacherFixture = await createAcademicFixture({
      organizationId: organizationAId,
      schoolId: schoolAId,
      teacherUserId: teacherBId,
      marker: 'other-teacher',
      studentCount: 1,
    });
    otherTeacherAllocationId = otherTeacherFixture.allocationId;
    otherTeacherStudentIds = otherTeacherFixture.studentIds;

    const crossSchoolFixture = await createAcademicFixture({
      organizationId: organizationBId,
      schoolId: schoolBId,
      teacherUserId: teacherCrossSchoolId,
      marker: 'cross-school',
      studentCount: 1,
    });
    crossSchoolAllocationId = crossSchoolFixture.allocationId;
    crossSchoolStudentIds = crossSchoolFixture.studentIds;

    await createPrivateStudentData({
      organizationId: organizationAId,
      schoolId: schoolAId,
      studentId: ownStudentIds[0],
    });

    ownAssessmentId = await createGradeAssessmentFixture({
      schoolId: schoolAId,
      fixture: ownFixture,
      title: `${testSuffix} Own Quiz`,
      type: GradeAssessmentType.QUIZ,
      approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
      maxScore: 20,
      weight: 10,
    });
    ownAssignmentId = await createGradeAssessmentFixture({
      schoolId: schoolAId,
      fixture: ownFixture,
      title: `${testSuffix} Grade-backed Assignment`,
      type: GradeAssessmentType.ASSIGNMENT,
      approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
      deliveryMode: GradeAssessmentDeliveryMode.QUESTION_BASED,
      maxScore: 10,
      weight: 5,
    });
    const ownAssignmentQuestionId = await createGradeQuestionFixture({
      schoolId: schoolAId,
      assessmentId: ownAssignmentId,
      prompt: `${testSuffix} Safe assignment prompt`,
      points: 10,
    });
    ownAssignmentSubmissionId = await createGradeSubmissionFixture({
      schoolId: schoolAId,
      assessmentId: ownAssignmentId,
      termId: ownFixture.termId,
      studentId: ownFixture.studentIds[0],
      enrollmentId: ownFixture.enrollmentIds[0],
      status: GradeSubmissionStatus.SUBMITTED,
      submittedAt: new Date('2026-09-15T10:00:00.000Z'),
      maxScore: 10,
    });
    ownAssignmentAnswerId = await createGradeSubmissionAnswerFixture({
      schoolId: schoolAId,
      submissionId: ownAssignmentSubmissionId,
      assessmentId: ownAssignmentId,
      questionId: ownAssignmentQuestionId,
      studentId: ownFixture.studentIds[0],
      answerText: `${testSuffix} student-visible-answer`,
      correctionStatus: GradeAnswerCorrectionStatus.PENDING,
      maxPoints: 10,
    });
    otherTeacherAssessmentId = await createGradeAssessmentFixture({
      schoolId: schoolAId,
      fixture: otherTeacherFixture,
      title: `${testSuffix} Other Teacher Quiz`,
      type: GradeAssessmentType.QUIZ,
      approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
      maxScore: 20,
      weight: 10,
    });
    const otherOwnedAssignmentId = await createGradeAssessmentFixture({
      schoolId: schoolAId,
      fixture: ownFixture,
      title: `${testSuffix} Other Owned Assignment`,
      type: GradeAssessmentType.ASSIGNMENT,
      approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
      deliveryMode: GradeAssessmentDeliveryMode.QUESTION_BASED,
      maxScore: 10,
      weight: 5,
    });
    const otherOwnedQuestionId = await createGradeQuestionFixture({
      schoolId: schoolAId,
      assessmentId: otherOwnedAssignmentId,
      prompt: `${testSuffix} Other owned prompt`,
      points: 10,
    });
    otherAssignmentSubmissionId = await createGradeSubmissionFixture({
      schoolId: schoolAId,
      assessmentId: otherOwnedAssignmentId,
      termId: ownFixture.termId,
      studentId: ownFixture.studentIds[1],
      enrollmentId: ownFixture.enrollmentIds[1],
      status: GradeSubmissionStatus.SUBMITTED,
      submittedAt: new Date('2026-09-15T11:00:00.000Z'),
      maxScore: 10,
    });
    otherAssignmentAnswerId = await createGradeSubmissionAnswerFixture({
      schoolId: schoolAId,
      submissionId: otherAssignmentSubmissionId,
      assessmentId: otherOwnedAssignmentId,
      questionId: otherOwnedQuestionId,
      studentId: ownFixture.studentIds[1],
      answerText: `${testSuffix} other-assignment-answer`,
      correctionStatus: GradeAnswerCorrectionStatus.PENDING,
      maxPoints: 10,
    });
    outsideStudentSubmissionId = await createGradeSubmissionFixture({
      schoolId: schoolAId,
      assessmentId: ownAssignmentId,
      termId: ownFixture.termId,
      studentId: otherTeacherFixture.studentIds[0],
      enrollmentId: otherTeacherFixture.enrollmentIds[0],
      status: GradeSubmissionStatus.SUBMITTED,
      submittedAt: new Date('2026-09-15T12:00:00.000Z'),
      maxScore: 10,
    });
    outsideStudentAnswerId = await createGradeSubmissionAnswerFixture({
      schoolId: schoolAId,
      submissionId: outsideStudentSubmissionId,
      assessmentId: ownAssignmentId,
      questionId: ownAssignmentQuestionId,
      studentId: otherTeacherFixture.studentIds[0],
      answerText: `${testSuffix} outside-student-answer`,
      correctionStatus: GradeAnswerCorrectionStatus.PENDING,
      maxPoints: 10,
    });
    otherClassroomAssignmentId = await createGradeAssessmentFixture({
      schoolId: schoolAId,
      fixture: {
        academicYearId: ownFixture.academicYearId,
        termId: ownFixture.termId,
        classroomId: otherTeacherFixture.classroomId,
        subjectId: ownFixture.subjectId,
      },
      title: `${testSuffix} Other Classroom Assignment`,
      type: GradeAssessmentType.ASSIGNMENT,
      approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
      maxScore: 10,
      weight: 5,
    });
    otherSubjectAssignmentId = await createGradeAssessmentFixture({
      schoolId: schoolAId,
      fixture: {
        academicYearId: ownFixture.academicYearId,
        termId: ownFixture.termId,
        classroomId: ownFixture.classroomId,
        subjectId: otherTeacherFixture.subjectId,
      },
      title: `${testSuffix} Other Subject Assignment`,
      type: GradeAssessmentType.ASSIGNMENT,
      approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
      maxScore: 10,
      weight: 5,
    });
    otherTermAssignmentId = await createGradeAssessmentFixture({
      schoolId: schoolAId,
      fixture: {
        academicYearId: otherTeacherFixture.academicYearId,
        termId: otherTeacherFixture.termId,
        classroomId: ownFixture.classroomId,
        subjectId: ownFixture.subjectId,
      },
      title: `${testSuffix} Other Term Assignment`,
      type: GradeAssessmentType.ASSIGNMENT,
      approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
      maxScore: 10,
      weight: 5,
    });
    crossSchoolAssessmentId = await createGradeAssessmentFixture({
      schoolId: schoolBId,
      fixture: crossSchoolFixture,
      title: `${testSuffix} Cross School Quiz`,
      type: GradeAssessmentType.QUIZ,
      approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
      maxScore: 20,
      weight: 10,
    });
    crossSchoolSubmissionId = await createGradeSubmissionFixture({
      schoolId: schoolBId,
      assessmentId: crossSchoolAssessmentId,
      termId: crossSchoolFixture.termId,
      studentId: crossSchoolFixture.studentIds[0],
      enrollmentId: crossSchoolFixture.enrollmentIds[0],
      status: GradeSubmissionStatus.SUBMITTED,
      submittedAt: new Date('2026-09-15T13:00:00.000Z'),
      maxScore: 20,
    });
    const crossSchoolQuestionId = await createGradeQuestionFixture({
      schoolId: schoolBId,
      assessmentId: crossSchoolAssessmentId,
      prompt: `${testSuffix} Cross School Prompt`,
      points: 20,
    });
    crossSchoolAnswerId = await createGradeSubmissionAnswerFixture({
      schoolId: schoolBId,
      submissionId: crossSchoolSubmissionId,
      assessmentId: crossSchoolAssessmentId,
      questionId: crossSchoolQuestionId,
      studentId: crossSchoolFixture.studentIds[0],
      answerText: `${testSuffix} cross-school-answer`,
      correctionStatus: GradeAnswerCorrectionStatus.PENDING,
      maxPoints: 20,
    });

    const ownGradeItem = await prisma.gradeItem.create({
      data: {
        schoolId: schoolAId,
        termId: ownFixture.termId,
        assessmentId: ownAssessmentId,
        studentId: ownFixture.studentIds[0],
        enrollmentId: ownFixture.enrollmentIds[0],
        score: 18,
        status: GradeItemStatus.ENTERED,
        enteredById: teacherAId,
        enteredAt: new Date('2026-09-15T09:00:00.000Z'),
      },
      select: { id: true },
    });
    createdGradeItemIds.push(ownGradeItem.id);

    ownTaskId = await createTaskFixture({
      schoolId: schoolAId,
      fixture: ownFixture,
      teacherUserId: teacherAId,
      marker: 'own-task',
      status: ReinforcementTaskStatus.UNDER_REVIEW,
      withProofFile: true,
    });
    otherTeacherTaskId = await createTaskFixture({
      schoolId: schoolAId,
      fixture: otherTeacherFixture,
      teacherUserId: teacherBId,
      marker: 'other-teacher-task',
      status: ReinforcementTaskStatus.NOT_COMPLETED,
      withProofFile: false,
    });
    crossSchoolTaskId = await createTaskFixture({
      schoolId: schoolBId,
      fixture: crossSchoolFixture,
      teacherUserId: teacherCrossSchoolId,
      marker: 'cross-school-task',
      status: ReinforcementTaskStatus.NOT_COMPLETED,
      withProofFile: false,
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
  });

  afterAll(async () => {
    try {
      await prisma.session.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.studentGuardian.deleteMany({
        where: { id: { in: createdStudentGuardianIds } },
      });
      await prisma.studentMedicalProfile.deleteMany({
        where: { studentId: { in: createdMedicalProfileStudentIds } },
      });
      await prisma.gradeSubmissionAnswer.deleteMany({
        where: { id: { in: createdGradeSubmissionAnswerIds } },
      });
      await prisma.gradeSubmission.deleteMany({
        where: { id: { in: createdGradeSubmissionIds } },
      });
      await prisma.gradeAssessmentQuestion.deleteMany({
        where: { id: { in: createdGradeQuestionIds } },
      });
      await prisma.gradeItem.deleteMany({
        where: { id: { in: createdGradeItemIds } },
      });
      await prisma.gradeAssessment.deleteMany({
        where: { id: { in: createdGradeAssessmentIds } },
      });
      await prisma.attendanceEntry.deleteMany({
        where: { schoolId: { in: [schoolAId, schoolBId].filter(Boolean) } },
      });
      await prisma.attendanceSession.deleteMany({
        where: { schoolId: { in: [schoolAId, schoolBId].filter(Boolean) } },
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
      await prisma.guardian.deleteMany({
        where: { id: { in: createdGuardianIds } },
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
        where: { id: { in: createdYearIds } },
      });
      await prisma.schoolProfile.deleteMany({
        where: { schoolId: { in: [schoolAId, schoolBId].filter(Boolean) } },
      });
      await prisma.membership.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      await prisma.school.deleteMany({
        where: { id: { in: [schoolAId, schoolBId].filter(Boolean) } },
      });
      await prisma.organization.deleteMany({
        where: {
          id: { in: [organizationAId, organizationBId].filter(Boolean) },
        },
      });
    } finally {
      if (app) await app.close();
      if (prisma) await prisma.$disconnect();
    }
  });

  it('teacher can access own Teacher Home without schoolId or raw logo exposure', async () => {
    const { accessToken } = await login(teacherAEmail);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/home`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const json = JSON.stringify(response.body);

    expect(response.body.teacher).toMatchObject({
      id: teacherAId,
      userType: 'teacher',
    });
    expect(response.body.summary.classesCount).toBe(1);
    expect(response.body.summary.studentsCount).toBe(2);
    expect(response.body.schedule).toEqual({
      available: false,
      reason: 'timetable_not_available',
      items: [],
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('scheduleId');
    expect(json).not.toContain('raw-storage-logo-should-not-be-returned');
  });

  it('teacher can list only own allocation-backed classes', async () => {
    const { accessToken } = await login(teacherAEmail);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/my-classes`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const json = JSON.stringify(response.body);

    expect(json).toContain(ownAllocationId);
    expect(json).not.toContain(otherTeacherAllocationId);
    expect(json).not.toContain(crossSchoolAllocationId);
    expect(response.body.classes[0]).toMatchObject({
      id: ownAllocationId,
      classId: ownAllocationId,
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('scheduleId');
  });

  it('teacher can access own class detail', async () => {
    const { accessToken } = await login(teacherAEmail);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/my-classes/${ownAllocationId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const json = JSON.stringify(response.body);

    expect(response.body.class).toMatchObject({
      id: ownAllocationId,
      classId: ownAllocationId,
      studentsCount: 2,
    });
    expect(response.body.rosterPreview).toEqual([]);
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('guardian');
    expect(json).not.toContain('medical');
    expect(json).not.toContain('scheduleId');
  });

  it('teacher can access owned classroom detail without schoolId or scheduleId', async () => {
    const { accessToken } = await login(teacherAEmail);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const json = JSON.stringify(response.body);

    expect(response.body).toMatchObject({
      classId: ownAllocationId,
      classroom: {
        code: null,
      },
      summary: {
        studentsCount: 2,
        presentTodayCount: null,
        absentTodayCount: null,
        pendingAssignmentsCount: null,
        averageGrade: null,
        behaviorAlertsCount: null,
      },
      schedule: {
        available: false,
        reason: 'timetable_not_available',
      },
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('scheduleId');
  });

  it('teacher can access owned classroom roster only', async () => {
    const { accessToken } = await login(teacherAEmail);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/roster`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const json = JSON.stringify(response.body);

    expect(response.body.classId).toBe(ownAllocationId);
    expect(response.body.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 2,
    });
    expect(
      response.body.students.map((student: { id: string }) => student.id),
    ).toEqual(ownStudentIds);
    expect(json).not.toContain(otherTeacherAllocationId);
    expect(json).not.toContain(crossSchoolAllocationId);
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('scheduleId');
  });

  it('classroom roster does not expose guardian, medical, document, or private data', async () => {
    const { accessToken } = await login(teacherAEmail);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/roster`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const json = JSON.stringify(response.body);

    expect(json).not.toContain('guardian');
    expect(json).not.toContain('medical');
    expect(json).not.toContain('document');
    expect(json).not.toContain('private-phone-sentinel');
    expect(json).not.toContain('private-guardian-sentinel');
    expect(json).not.toContain('private-allergy-sentinel');
    expect(json).not.toContain('private-condition-sentinel');
  });

  it('teacher can get attendance roster for owned class without creating a session', async () => {
    const { accessToken } = await login(teacherAEmail);

    const response = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/attendance/roster`,
      )
      .query({ date: '2026-09-10' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const json = JSON.stringify(response.body);

    expect(response.body).toMatchObject({
      classId: ownAllocationId,
      date: '2026-09-10',
      session: null,
      pagination: {
        page: 1,
        limit: 20,
        total: 2,
      },
    });
    expect(
      response.body.students.map((student: { id: string }) => student.id),
    ).toEqual(ownStudentIds);
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('scheduleId');
    expect(json).not.toContain('period');
    expect(json).not.toContain('timetable');
  });

  it('teacher can resolve, update, and submit owned classroom attendance', async () => {
    const { accessToken } = await login(teacherAEmail);

    const resolved = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/attendance/session/resolve`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ date: '2026-09-10' })
      .expect(201);
    const sessionId = resolved.body.session.id;

    expect(resolved.body).toMatchObject({
      classId: ownAllocationId,
      date: '2026-09-10',
      session: {
        id: sessionId,
        status: 'draft',
        submittedAt: null,
      },
      entries: [],
    });
    expect(JSON.stringify(resolved.body)).not.toContain('schoolId');
    expect(JSON.stringify(resolved.body)).not.toContain('scheduleId');

    const updated = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/attendance/sessions/${sessionId}/entries`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        entries: [
          { studentId: ownStudentIds[0], status: 'present', note: 'Arrived' },
          { studentId: ownStudentIds[1], status: 'absent' },
        ],
      })
      .expect(200);

    expect(updated.body.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studentId: ownStudentIds[0],
          attendanceStatus: 'present',
          note: 'Arrived',
        }),
        expect.objectContaining({
          studentId: ownStudentIds[1],
          attendanceStatus: 'absent',
          note: null,
        }),
      ]),
    );
    expect(JSON.stringify(updated.body)).not.toContain('schoolId');
    expect(JSON.stringify(updated.body)).not.toContain('scheduleId');

    const detail = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/attendance/sessions/${sessionId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(detail.body.entries).toHaveLength(2);

    const submitted = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/attendance/sessions/${sessionId}/submit`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(submitted.body.session).toMatchObject({
      id: sessionId,
      status: 'submitted',
    });
    expect(submitted.body.session.submittedAt).toEqual(expect.any(String));
    expect(JSON.stringify(submitted.body)).not.toContain('schoolId');
    expect(JSON.stringify(submitted.body)).not.toContain('scheduleId');
  });

  it('teacher cannot update attendance for students outside the owned classroom', async () => {
    const { accessToken } = await login(teacherAEmail);

    const resolved = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/attendance/session/resolve`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ date: '2026-09-11' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/attendance/sessions/${resolved.body.session.id}/entries`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        entries: [{ studentId: otherTeacherStudentIds[0], status: 'present' }],
      })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('teacher can read owned classroom grades and assignment-like views', async () => {
    const { accessToken } = await login(teacherAEmail);

    const assessments = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/grades/assessments`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const assessmentsJson = JSON.stringify(assessments.body);

    expect(assessments.body.classId).toBe(ownAllocationId);
    expect(assessmentsJson).toContain(ownAssessmentId);
    expect(assessmentsJson).toContain(ownAssignmentId);
    expect(assessmentsJson).not.toContain(otherTeacherAssessmentId);
    expect(assessmentsJson).not.toContain(crossSchoolAssessmentId);
    expect(assessmentsJson).not.toContain('schoolId');
    expect(assessmentsJson).not.toContain('scheduleId');

    const detail = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/grades/assessments/${ownAssessmentId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const detailJson = JSON.stringify(detail.body);

    expect(detail.body).toMatchObject({
      classId: ownAllocationId,
      assessment: {
        assessmentId: ownAssessmentId,
        status: 'published',
        maxScore: 20,
      },
      itemsSummary: {
        itemsCount: 1,
        enteredCount: 1,
      },
    });
    expect(detailJson).not.toContain('schoolId');
    expect(detailJson).not.toContain('scheduleId');
    expect(detailJson).not.toContain('answerKey');
    expect(detailJson).not.toContain('metadata');

    const gradebook = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/grades/gradebook`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const gradebookJson = JSON.stringify(gradebook.body);

    expect(gradebook.body.classId).toBe(ownAllocationId);
    expect(
      gradebook.body.students.map(
        (student: { studentId: string }) => student.studentId,
      ),
    ).toEqual(ownStudentIds);
    expect(gradebookJson).toContain(ownAssessmentId);
    expect(gradebookJson).not.toContain(otherTeacherStudentIds[0]);
    expect(gradebookJson).not.toContain(otherTeacherAssessmentId);
    expect(gradebookJson).not.toContain('schoolId');
    expect(gradebookJson).not.toContain('scheduleId');
    expect(gradebookJson).not.toContain('guardian');
    expect(gradebookJson).not.toContain('medical');

    const assignments = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/assignments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const assignmentsJson = JSON.stringify(assignments.body);

    expect(assignments.body).toMatchObject({
      classId: ownAllocationId,
      assignments: expect.arrayContaining([
        expect.objectContaining({
          assignmentId: ownAssignmentId,
          source: 'grades_assessment',
          type: 'assignment',
          dueAt: null,
        }),
      ]),
    });
    expect(assignmentsJson).not.toContain('homeworkId');
    expect(assignmentsJson).not.toContain('schoolId');
    expect(assignmentsJson).not.toContain('scheduleId');

    const assignmentDetail = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/assignments/${ownAssignmentId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const assignmentDetailJson = JSON.stringify(assignmentDetail.body);

    expect(assignmentDetail.body).toMatchObject({
      classId: ownAllocationId,
      assignment: {
        assignmentId: ownAssignmentId,
        source: 'grades_assessment',
        type: 'assignment',
        dueAt: null,
        questionSummary: {
          available: true,
          questionsCount: 1,
        },
      },
    });
    expect(assignmentDetailJson).not.toContain('schoolId');
    expect(assignmentDetailJson).not.toContain('scheduleId');
    expect(assignmentDetailJson).not.toContain('answer-key-sentinel');
    expect(assignmentDetailJson).not.toContain('question-metadata-sentinel');
    expect(assignmentDetailJson).not.toContain('submission-metadata-sentinel');

    const submissions = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/assignments/${ownAssignmentId}/submissions`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const submissionsJson = JSON.stringify(submissions.body);

    expect(submissions.body).toMatchObject({
      classId: ownAllocationId,
      assignmentId: ownAssignmentId,
      source: 'grades_assessment',
    });
    expect(submissions.body.submissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          submissionId: ownAssignmentSubmissionId,
          status: 'submitted',
          student: expect.objectContaining({
            studentId: ownStudentIds[0],
          }),
          answersCount: 1,
          reviewedAnswersCount: 0,
        }),
      ]),
    );
    expect(submissionsJson).toContain(ownAssignmentSubmissionId);
    expect(submissionsJson).not.toContain(outsideStudentSubmissionId);
    expect(submissionsJson).not.toContain(otherTeacherStudentIds[0]);
    expect(submissionsJson).not.toContain('student-visible-answer');
    expect(submissionsJson).not.toContain('schoolId');
    expect(submissionsJson).not.toContain('scheduleId');

    const submissionDetail = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/assignments/${ownAssignmentId}/submissions/${ownAssignmentSubmissionId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const submissionDetailJson = JSON.stringify(submissionDetail.body);

    expect(submissionDetail.body).toMatchObject({
      classId: ownAllocationId,
      assignmentId: ownAssignmentId,
      source: 'grades_assessment',
      submission: {
        submissionId: ownAssignmentSubmissionId,
        student: {
          studentId: ownStudentIds[0],
        },
        answers: [
          expect.objectContaining({
            questionId: expect.any(String),
            prompt: `${testSuffix} Safe assignment prompt`,
            studentAnswer: {
              text: `${testSuffix} student-visible-answer`,
              json: null,
              selectedOptions: [],
            },
          }),
        ],
      },
    });
    expect(submissionDetailJson).toContain(
      `${testSuffix} student-visible-answer`,
    );
    expect(submissionDetailJson).not.toContain('answer-key-sentinel');
    expect(submissionDetailJson).not.toContain('correctAnswer');
    expect(submissionDetailJson).not.toContain('isCorrect');
    expect(submissionDetailJson).not.toContain('metadata');
    expect(submissionDetailJson).not.toContain('schoolId');
    expect(submissionDetailJson).not.toContain('scheduleId');
  });

  it('teacher can read owned task dashboard, list, detail, and selectors safely', async () => {
    const { accessToken } = await login(teacherAEmail);

    const dashboard = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/tasks/dashboard`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const dashboardJson = JSON.stringify(dashboard.body);

    expect(dashboard.body.summary).toMatchObject({
      totalTasks: 1,
      underReviewTasks: 1,
    });
    expect(dashboard.body.byClass).toEqual([
      expect.objectContaining({
        classId: ownAllocationId,
        studentsCount: 2,
        activeTasksCount: 1,
      }),
    ]);
    expect(dashboardJson).toContain(ownTaskId);
    expect(dashboardJson).not.toContain(otherTeacherTaskId);
    expect(dashboardJson).not.toContain(crossSchoolTaskId);
    expectSafeTeacherTaskPayload(dashboard.body);

    const list = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/tasks`)
      .query({ classId: ownAllocationId, status: 'underReview' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const listJson = JSON.stringify(list.body);

    expect(list.body.tasks).toEqual([
      expect.objectContaining({
        taskId: ownTaskId,
        status: 'underReview',
        source: 'teacher',
        target: expect.objectContaining({
          classId: ownAllocationId,
          studentId: ownStudentIds[0],
        }),
      }),
    ]);
    expect(listJson).not.toContain(otherTeacherTaskId);
    expect(listJson).not.toContain(crossSchoolTaskId);
    expectSafeTeacherTaskPayload(list.body);

    const studentList = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/tasks`)
      .query({ studentId: ownStudentIds[0] })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(studentList.body.tasks.map((task: { taskId: string }) => task.taskId))
      .toEqual([ownTaskId]);

    const detail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/tasks/${ownTaskId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const detailJson = JSON.stringify(detail.body);

    expect(detail.body.task).toMatchObject({
      taskId: ownTaskId,
      status: 'underReview',
      target: {
        classId: ownAllocationId,
        studentId: ownStudentIds[0],
      },
      submissions: [
        expect.objectContaining({
          studentId: ownStudentIds[0],
          proofFile: expect.objectContaining({
            id: expect.any(String),
            downloadPath: expect.stringContaining('/api/v1/files/'),
          }),
        }),
      ],
    });
    expect(detailJson).toContain(`${testSuffix}-proof-text`);
    expectSafeTeacherTaskPayload(detail.body);

    const selectors = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/tasks/selectors`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const selectorsJson = JSON.stringify(selectors.body);

    expect(selectors.body.classes).toEqual([
      expect.objectContaining({
        classId: ownAllocationId,
        studentsCount: 2,
      }),
    ]);
    expect(
      selectors.body.students.map(
        (student: { studentId: string }) => student.studentId,
      ),
    ).toEqual(ownStudentIds);
    expect(selectorsJson).not.toContain(otherTeacherAllocationId);
    expect(selectorsJson).not.toContain(otherTeacherStudentIds[0]);
    expectSafeTeacherTaskPayload(selectors.body);
  });

  it('teacher cannot read same-school other-teacher or cross-school task data', async () => {
    const { accessToken } = await login(teacherAEmail);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/tasks`)
      .query({ classId: otherTeacherAllocationId })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/tasks`)
      .query({ studentId: otherTeacherStudentIds[0] })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/tasks/${otherTeacherTaskId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/tasks`)
      .query({ classId: crossSchoolAllocationId })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/tasks`)
      .query({ studentId: crossSchoolStudentIds[0] })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/tasks/${crossSchoolTaskId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('teacher can review, bulk-review, finalize, and sync an owned submission safely', async () => {
    const { accessToken } = await login(teacherAEmail);

    const reviewed = await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/assignments/${ownAssignmentId}/submissions/${ownAssignmentSubmissionId}/answers/${ownAssignmentAnswerId}/review`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        awardedPoints: 8,
        reviewerComment: 'Good reasoning',
      })
      .expect(200);
    const reviewedJson = JSON.stringify(reviewed.body);

    expect(reviewed.body).toMatchObject({
      classId: ownAllocationId,
      assignmentId: ownAssignmentId,
      submissionId: ownAssignmentSubmissionId,
      source: 'grades_assessment',
      answer: {
        answerId: ownAssignmentAnswerId,
        questionId: expect.any(String),
        correctionStatus: 'corrected',
        score: 8,
        maxScore: 10,
        feedback: 'Good reasoning',
      },
    });
    expect(reviewedJson).toContain(`${testSuffix} student-visible-answer`);
    expect(reviewedJson).not.toContain('schoolId');
    expect(reviewedJson).not.toContain('scheduleId');
    expect(reviewedJson).not.toContain('answer-key-sentinel');
    expect(reviewedJson).not.toContain('correctAnswer');
    expect(reviewedJson).not.toContain('isCorrect');
    expect(reviewedJson).not.toContain('reviewedById');

    const bulkReviewed = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/assignments/${ownAssignmentId}/submissions/${ownAssignmentSubmissionId}/answers/review`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        reviews: [
          {
            answerId: ownAssignmentAnswerId,
            awardedPoints: 9,
            reviewerComment: 'Updated after rubric pass',
          },
        ],
      })
      .expect(200);
    const bulkReviewedJson = JSON.stringify(bulkReviewed.body);

    expect(bulkReviewed.body).toMatchObject({
      classId: ownAllocationId,
      assignmentId: ownAssignmentId,
      submissionId: ownAssignmentSubmissionId,
      reviewedCount: 1,
      answers: [
        expect.objectContaining({
          answerId: ownAssignmentAnswerId,
          score: 9,
          feedback: 'Updated after rubric pass',
        }),
      ],
    });
    expect(bulkReviewedJson).not.toContain('schoolId');
    expect(bulkReviewedJson).not.toContain('scheduleId');
    expect(bulkReviewedJson).not.toContain('answer-key-sentinel');

    const finalized = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/assignments/${ownAssignmentId}/submissions/${ownAssignmentSubmissionId}/review/finalize`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    const finalizedJson = JSON.stringify(finalized.body);

    expect(finalized.body).toMatchObject({
      classId: ownAllocationId,
      assignmentId: ownAssignmentId,
      source: 'grades_assessment',
      submission: {
        submissionId: ownAssignmentSubmissionId,
        status: 'corrected',
        score: 9,
        maxScore: 10,
        finalizedAt: expect.any(String),
      },
    });
    expect(finalizedJson).not.toContain('schoolId');
    expect(finalizedJson).not.toContain('scheduleId');
    expect(finalizedJson).not.toContain('answer-key-sentinel');
    expect(finalizedJson).not.toContain('submission-metadata-sentinel');
    expect(finalizedJson).not.toContain('reviewedById');

    const synced = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/assignments/${ownAssignmentId}/submissions/${ownAssignmentSubmissionId}/sync-grade-item`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    const syncedJson = JSON.stringify(synced.body);
    createdGradeItemIds.push(synced.body.gradeItem.gradeItemId);

    expect(synced.body).toMatchObject({
      classId: ownAllocationId,
      assignmentId: ownAssignmentId,
      submissionId: ownAssignmentSubmissionId,
      source: 'grades_assessment',
      synced: true,
      submission: {
        submissionId: ownAssignmentSubmissionId,
        assignmentId: ownAssignmentId,
        studentId: ownStudentIds[0],
        status: 'corrected',
        totalScore: 9,
        maxScore: 10,
      },
      gradeItem: {
        assignmentId: ownAssignmentId,
        studentId: ownStudentIds[0],
        status: 'entered',
        score: 9,
      },
    });
    expect(syncedJson).not.toContain('schoolId');
    expect(syncedJson).not.toContain('scheduleId');
    expect(syncedJson).not.toContain('enteredById');
  });

  it('teacher cannot mutate submission review outside owned classroom, subject, term, submission, or answer boundaries', async () => {
    const { accessToken } = await login(teacherAEmail);

    for (const classId of [otherTeacherAllocationId, crossSchoolAllocationId]) {
      const response = await request(app.getHttpServer())
        .patch(
          `${GLOBAL_PREFIX}/teacher/classroom/${classId}/assignments/${ownAssignmentId}/submissions/${ownAssignmentSubmissionId}/answers/${ownAssignmentAnswerId}/review`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ awardedPoints: 1 })
        .expect(404);
      expect(response.body?.error?.code).toBe(
        'teacher_app.allocation.not_found',
      );
    }

    for (const assignmentId of [
      otherClassroomAssignmentId,
      otherSubjectAssignmentId,
      otherTermAssignmentId,
      crossSchoolAssessmentId,
    ]) {
      const response = await request(app.getHttpServer())
        .patch(
          `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/assignments/${assignmentId}/submissions/${ownAssignmentSubmissionId}/answers/${ownAssignmentAnswerId}/review`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ awardedPoints: 1 })
        .expect(404);
      expect(response.body?.error?.code).toBe('not_found');
    }

    for (const route of [
      `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/assignments/${ownAssignmentId}/submissions/${otherAssignmentSubmissionId}/review/finalize`,
      `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/assignments/${ownAssignmentId}/submissions/${outsideStudentSubmissionId}/review/finalize`,
      `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/assignments/${ownAssignmentId}/submissions/${crossSchoolSubmissionId}/review/finalize`,
    ]) {
      const response = await request(app.getHttpServer())
        .post(route)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
      expect(response.body?.error?.code).toBe('not_found');
    }

    for (const answerId of [
      otherAssignmentAnswerId,
      outsideStudentAnswerId,
      crossSchoolAnswerId,
    ]) {
      const response = await request(app.getHttpServer())
        .patch(
          `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/assignments/${ownAssignmentId}/submissions/${ownAssignmentSubmissionId}/answers/${answerId}/review`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ awardedPoints: 1 })
        .expect(404);
      expect(response.body?.error?.code).toBe('not_found');
    }
  });

  it('teacher cannot access grade reads outside the owned classroom/subject/term', async () => {
    const { accessToken } = await login(teacherAEmail);

    const sameSchoolDetail = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/grades/assessments/${otherTeacherAssessmentId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    expect(sameSchoolDetail.body?.error?.code).toBe('not_found');

    const crossSchoolDetail = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/grades/assessments/${crossSchoolAssessmentId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    expect(crossSchoolDetail.body?.error?.code).toBe('not_found');

    const filteredGradebook = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/grades/gradebook`,
      )
      .query({ assessmentId: otherTeacherAssessmentId })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    expect(filteredGradebook.body?.error?.code).toBe('not_found');

    for (const assignmentId of [
      otherClassroomAssignmentId,
      otherSubjectAssignmentId,
      otherTermAssignmentId,
      crossSchoolAssessmentId,
    ]) {
      const assignmentResponse = await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/assignments/${assignmentId}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
      expect(assignmentResponse.body?.error?.code).toBe('not_found');
    }

    const otherAssignmentSubmissionResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/assignments/${ownAssignmentId}/submissions/${otherAssignmentSubmissionId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    expect(otherAssignmentSubmissionResponse.body?.error?.code).toBe(
      'not_found',
    );

    const outsideStudentSubmissionResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/assignments/${ownAssignmentId}/submissions/${outsideStudentSubmissionId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    expect(outsideStudentSubmissionResponse.body?.error?.code).toBe(
      'not_found',
    );

    const crossSchoolSubmissionResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/assignments/${ownAssignmentId}/submissions/${crossSchoolSubmissionId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    expect(crossSchoolSubmissionResponse.body?.error?.code).toBe('not_found');
  });

  it('teacher cannot access another teacher class in the same school', async () => {
    const { accessToken } = await login(teacherAEmail);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/my-classes/${otherTeacherAllocationId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('teacher_app.allocation.not_found');

    const classroomDetailResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/classroom/${otherTeacherAllocationId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    const classroomRosterResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${otherTeacherAllocationId}/roster`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    expect(classroomDetailResponse.body?.error?.code).toBe(
      'teacher_app.allocation.not_found',
    );
    expect(classroomRosterResponse.body?.error?.code).toBe(
      'teacher_app.allocation.not_found',
    );

    const attendanceRosterResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${otherTeacherAllocationId}/attendance/roster`,
      )
      .query({ date: '2026-09-10' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    const attendanceResolveResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/classroom/${otherTeacherAllocationId}/attendance/session/resolve`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ date: '2026-09-10' })
      .expect(404);
    expect(attendanceRosterResponse.body?.error?.code).toBe(
      'teacher_app.allocation.not_found',
    );
    expect(attendanceResolveResponse.body?.error?.code).toBe(
      'teacher_app.allocation.not_found',
    );

    for (const route of [
      `/teacher/classroom/${otherTeacherAllocationId}/grades/assessments`,
      `/teacher/classroom/${otherTeacherAllocationId}/grades/assessments/${otherTeacherAssessmentId}`,
      `/teacher/classroom/${otherTeacherAllocationId}/grades/gradebook`,
      `/teacher/classroom/${otherTeacherAllocationId}/assignments`,
      `/teacher/classroom/${otherTeacherAllocationId}/assignments/${ownAssignmentId}`,
      `/teacher/classroom/${otherTeacherAllocationId}/assignments/${ownAssignmentId}/submissions`,
      `/teacher/classroom/${otherTeacherAllocationId}/assignments/${ownAssignmentId}/submissions/${ownAssignmentSubmissionId}`,
    ]) {
      const gradesResponse = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}${route}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
      expect(gradesResponse.body?.error?.code).toBe(
        'teacher_app.allocation.not_found',
      );
    }
  });

  it('teacher cannot access a cross-school class id', async () => {
    const { accessToken } = await login(teacherAEmail);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/my-classes/${crossSchoolAllocationId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('teacher_app.allocation.not_found');

    const classroomDetailResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/classroom/${crossSchoolAllocationId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    const classroomRosterResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${crossSchoolAllocationId}/roster`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    expect(classroomDetailResponse.body?.error?.code).toBe(
      'teacher_app.allocation.not_found',
    );
    expect(classroomRosterResponse.body?.error?.code).toBe(
      'teacher_app.allocation.not_found',
    );

    const attendanceRosterResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${crossSchoolAllocationId}/attendance/roster`,
      )
      .query({ date: '2026-09-10' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    expect(attendanceRosterResponse.body?.error?.code).toBe(
      'teacher_app.allocation.not_found',
    );

    for (const route of [
      `/teacher/classroom/${crossSchoolAllocationId}/grades/assessments`,
      `/teacher/classroom/${crossSchoolAllocationId}/grades/assessments/${crossSchoolAssessmentId}`,
      `/teacher/classroom/${crossSchoolAllocationId}/grades/gradebook`,
      `/teacher/classroom/${crossSchoolAllocationId}/assignments`,
      `/teacher/classroom/${crossSchoolAllocationId}/assignments/${ownAssignmentId}`,
      `/teacher/classroom/${crossSchoolAllocationId}/assignments/${ownAssignmentId}/submissions`,
      `/teacher/classroom/${crossSchoolAllocationId}/assignments/${ownAssignmentId}/submissions/${ownAssignmentSubmissionId}`,
    ]) {
      const gradesResponse = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}${route}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
      expect(gradesResponse.body?.error?.code).toBe(
        'teacher_app.allocation.not_found',
      );
    }
  });

  it('teacher cannot read a cross-school guessed attendance session', async () => {
    const crossSchoolTeacher = await login(teacherCrossSchoolEmail);
    const crossSchoolResolved = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/classroom/${crossSchoolAllocationId}/attendance/session/resolve`,
      )
      .set('Authorization', `Bearer ${crossSchoolTeacher.accessToken}`)
      .send({ date: '2026-09-10' })
      .expect(201);

    const teacherA = await login(teacherAEmail);
    const response = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/attendance/sessions/${crossSchoolResolved.body.session.id}`,
      )
      .set('Authorization', `Bearer ${teacherA.accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('school admin, parent, and student actors are denied Teacher App routes', async () => {
    const teacherA = await login(teacherAEmail);
    const deniedSession = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/attendance/session/resolve`,
      )
      .set('Authorization', `Bearer ${teacherA.accessToken}`)
      .send({ date: '2026-09-12' })
      .expect(201);

    for (const email of [adminEmail, parentEmail, studentEmail]) {
      const { accessToken } = await login(email);

      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/teacher/home`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/teacher/my-classes`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/teacher/my-classes/${ownAllocationId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/roster`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/attendance/roster`,
        )
        .query({ date: '2026-09-10' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .post(
          `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/attendance/session/resolve`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ date: '2026-09-10' })
        .expect(403);
      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/attendance/sessions/${deniedSession.body.session.id}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .put(
          `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/attendance/sessions/${deniedSession.body.session.id}/entries`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          entries: [{ studentId: ownStudentIds[0], status: 'present' }],
        })
        .expect(403);
      await request(app.getHttpServer())
        .post(
          `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/attendance/sessions/${deniedSession.body.session.id}/submit`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/grades/assessments`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/grades/assessments/${ownAssessmentId}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/grades/gradebook`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/assignments`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/assignments/${ownAssignmentId}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/assignments/${ownAssignmentId}/submissions`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/assignments/${ownAssignmentId}/submissions/${ownAssignmentSubmissionId}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .patch(
          `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/assignments/${ownAssignmentId}/submissions/${ownAssignmentSubmissionId}/answers/${ownAssignmentAnswerId}/review`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ awardedPoints: 1 })
        .expect(403);
      await request(app.getHttpServer())
        .put(
          `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/assignments/${ownAssignmentId}/submissions/${ownAssignmentSubmissionId}/answers/review`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ reviews: [{ answerId: ownAssignmentAnswerId, awardedPoints: 1 }] })
        .expect(403);
      await request(app.getHttpServer())
        .post(
          `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/assignments/${ownAssignmentId}/submissions/${ownAssignmentSubmissionId}/review/finalize`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .post(
          `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/assignments/${ownAssignmentId}/submissions/${ownAssignmentSubmissionId}/sync-grade-item`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/teacher/tasks/dashboard`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/teacher/tasks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/teacher/tasks/selectors`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/teacher/tasks/${ownTaskId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    }
  });

  it('does not register Teacher App grade or assignment mutation endpoints', async () => {
    const { accessToken } = await login(teacherAEmail);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/grades/assessments`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/grades/assessments/${ownAssessmentId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/grades/gradebook`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/assignments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .delete(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/assignments/${ownAssignmentId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/assignments/${ownAssignmentId}/submissions`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/assignments/${ownAssignmentId}/submissions/${ownAssignmentSubmissionId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/assignments/${ownAssignmentId}/submissions/${ownAssignmentSubmissionId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/teacher/classroom/${ownAllocationId}/assignments/${ownAssignmentId}/submissions/${ownAssignmentSubmissionId}/review`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(404);
  });

  it('does not register Teacher Tasks mutation or XP mutation endpoints', async () => {
    const { accessToken } = await login(teacherAEmail);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/teacher/tasks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/teacher/tasks/${ownTaskId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/teacher/tasks/${ownTaskId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/teacher/tasks/${ownTaskId}/cancel`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/teacher/tasks/${ownTaskId}/stages/stage-1/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/teacher/xp/bonus`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(404);
  });

  it('does not register deferred Teacher App routes', async () => {
    const { accessToken } = await login(teacherAEmail);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/schedule`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/classes`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/classrooms/${ownAllocationId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
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
    userType: UserType;
    roleId: string;
    organizationId: string;
    schoolId: string;
  }): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: params.email,
        firstName: 'TeacherApp',
        lastName: params.userType.toLowerCase(),
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

  async function createAcademicFixture(params: {
    organizationId: string;
    schoolId: string;
    teacherUserId: string;
    marker: string;
    studentCount: number;
  }): Promise<{
    allocationId: string;
    academicYearId: string;
    termId: string;
    classroomId: string;
    subjectId: string;
    studentIds: string[];
    enrollmentIds: string[];
  }> {
    const isAttendanceWritable = params.marker !== 'other-teacher';
    const year = await prisma.academicYear.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${testSuffix}-${params.marker}-year-ar`,
        nameEn: `${testSuffix}-${params.marker}-year`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: isAttendanceWritable,
      },
      select: { id: true },
    });
    createdYearIds.push(year.id);

    const term = await prisma.term.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: year.id,
        nameAr: `${testSuffix}-${params.marker}-term-ar`,
        nameEn: `${testSuffix}-${params.marker}-term`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: isAttendanceWritable,
      },
      select: { id: true },
    });
    createdTermIds.push(term.id);

    const stage = await prisma.stage.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${testSuffix}-${params.marker}-stage-ar`,
        nameEn: `${testSuffix}-${params.marker}-stage`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdStageIds.push(stage.id);

    const grade = await prisma.grade.create({
      data: {
        schoolId: params.schoolId,
        stageId: stage.id,
        nameAr: `${testSuffix}-${params.marker}-grade-ar`,
        nameEn: `${testSuffix}-${params.marker}-grade`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdGradeIds.push(grade.id);

    const section = await prisma.section.create({
      data: {
        schoolId: params.schoolId,
        gradeId: grade.id,
        nameAr: `${testSuffix}-${params.marker}-section-ar`,
        nameEn: `${testSuffix}-${params.marker}-section`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdSectionIds.push(section.id);

    const classroom = await prisma.classroom.create({
      data: {
        schoolId: params.schoolId,
        sectionId: section.id,
        nameAr: `${testSuffix}-${params.marker}-classroom-ar`,
        nameEn: `${testSuffix}-${params.marker}-classroom`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdClassroomIds.push(classroom.id);

    const subject = await prisma.subject.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${testSuffix}-${params.marker}-subject-ar`,
        nameEn: `${testSuffix}-${params.marker}-subject`,
        code: `${params.marker.toUpperCase()}-SUBJECT`,
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
        termId: term.id,
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
          firstName: `${params.marker} Student`,
          lastName: `${index + 1}`,
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
          academicYearId: year.id,
          termId: term.id,
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
      allocationId: allocation.id,
      academicYearId: year.id,
      termId: term.id,
      classroomId: classroom.id,
      subjectId: subject.id,
      studentIds,
      enrollmentIds,
    };
  }

  async function createGradeAssessmentFixture(params: {
    schoolId: string;
    fixture: {
      academicYearId: string;
      termId: string;
      classroomId: string;
      subjectId: string;
    };
    title: string;
    type: GradeAssessmentType;
    approvalStatus: GradeAssessmentApprovalStatus;
    deliveryMode?: GradeAssessmentDeliveryMode;
    maxScore: number;
    weight: number;
  }): Promise<string> {
    const assessment = await prisma.gradeAssessment.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.fixture.academicYearId,
        termId: params.fixture.termId,
        subjectId: params.fixture.subjectId,
        scopeType: GradeScopeType.CLASSROOM,
        scopeKey: params.fixture.classroomId,
        classroomId: params.fixture.classroomId,
        titleEn: params.title,
        type: params.type,
        deliveryMode:
          params.deliveryMode ?? GradeAssessmentDeliveryMode.SCORE_ONLY,
        date: new Date('2026-09-15T00:00:00.000Z'),
        weight: params.weight,
        maxScore: params.maxScore,
        approvalStatus: params.approvalStatus,
        publishedAt:
          params.approvalStatus === GradeAssessmentApprovalStatus.DRAFT
            ? null
            : new Date('2026-09-14T08:00:00.000Z'),
        approvedAt:
          params.approvalStatus === GradeAssessmentApprovalStatus.APPROVED
            ? new Date('2026-09-14T09:00:00.000Z')
            : null,
      },
      select: { id: true },
    });
    createdGradeAssessmentIds.push(assessment.id);

    return assessment.id;
  }

  async function createGradeQuestionFixture(params: {
    schoolId: string;
    assessmentId: string;
    prompt: string;
    points: number;
  }): Promise<string> {
    const question = await prisma.gradeAssessmentQuestion.create({
      data: {
        schoolId: params.schoolId,
        assessmentId: params.assessmentId,
        type: GradeQuestionType.SHORT_ANSWER,
        prompt: params.prompt,
        points: params.points,
        sortOrder: 1,
        required: true,
        answerKey: { private: 'answer-key-sentinel' },
        metadata: { private: 'question-metadata-sentinel' },
      },
      select: { id: true },
    });
    createdGradeQuestionIds.push(question.id);

    return question.id;
  }

  async function createGradeSubmissionFixture(params: {
    schoolId: string;
    assessmentId: string;
    termId: string;
    studentId: string;
    enrollmentId: string;
    status: GradeSubmissionStatus;
    submittedAt: Date | null;
    maxScore: number;
  }): Promise<string> {
    const submission = await prisma.gradeSubmission.create({
      data: {
        schoolId: params.schoolId,
        assessmentId: params.assessmentId,
        termId: params.termId,
        studentId: params.studentId,
        enrollmentId: params.enrollmentId,
        status: params.status,
        submittedAt: params.submittedAt,
        correctedAt:
          params.status === GradeSubmissionStatus.CORRECTED
            ? new Date('2026-09-15T14:00:00.000Z')
            : null,
        totalScore:
          params.status === GradeSubmissionStatus.CORRECTED
            ? params.maxScore
            : null,
        maxScore: params.maxScore,
        metadata: { private: 'submission-metadata-sentinel' },
      },
      select: { id: true },
    });
    createdGradeSubmissionIds.push(submission.id);

    return submission.id;
  }

  async function createGradeSubmissionAnswerFixture(params: {
    schoolId: string;
    submissionId: string;
    assessmentId: string;
    questionId: string;
    studentId: string;
    answerText: string;
    correctionStatus: GradeAnswerCorrectionStatus;
    maxPoints: number;
  }): Promise<string> {
    const answer = await prisma.gradeSubmissionAnswer.create({
      data: {
        schoolId: params.schoolId,
        submissionId: params.submissionId,
        assessmentId: params.assessmentId,
        questionId: params.questionId,
        studentId: params.studentId,
        answerText: params.answerText,
        correctionStatus: params.correctionStatus,
        awardedPoints:
          params.correctionStatus === GradeAnswerCorrectionStatus.CORRECTED
            ? params.maxPoints
            : null,
        maxPoints: params.maxPoints,
        reviewerComment: 'safe teacher feedback',
        reviewedAt:
          params.correctionStatus === GradeAnswerCorrectionStatus.CORRECTED
            ? new Date('2026-09-15T14:00:00.000Z')
            : null,
      },
      select: { id: true },
    });
    createdGradeSubmissionAnswerIds.push(answer.id);

    return answer.id;
  }

  async function createPrivateStudentData(params: {
    organizationId: string;
    schoolId: string;
    studentId: string;
  }): Promise<void> {
    const guardian = await prisma.guardian.create({
      data: {
        schoolId: params.schoolId,
        organizationId: params.organizationId,
        firstName: 'Private',
        lastName: 'Guardian',
        phone: 'private-phone-sentinel',
        email: 'private-guardian-sentinel@security.moazez.local',
        relation: 'guardian',
        isPrimary: true,
      },
      select: { id: true },
    });
    createdGuardianIds.push(guardian.id);

    const link = await prisma.studentGuardian.create({
      data: {
        schoolId: params.schoolId,
        studentId: params.studentId,
        guardianId: guardian.id,
        isPrimary: true,
      },
      select: { id: true },
    });
    createdStudentGuardianIds.push(link.id);

    await prisma.studentMedicalProfile.create({
      data: {
        schoolId: params.schoolId,
        studentId: params.studentId,
        allergies: 'private-allergy-sentinel',
        conditions: ['private-condition-sentinel'],
        medications: ['private-medication-sentinel'],
        emergencyNotes: 'private-emergency-note-sentinel',
      },
    });
    createdMedicalProfileStudentIds.push(params.studentId);
  }

  async function createTaskFixture(params: {
    schoolId: string;
    fixture: {
      academicYearId: string;
      termId: string;
      classroomId: string;
      subjectId: string;
      studentIds: string[];
      enrollmentIds: string[];
    };
    teacherUserId: string;
    marker: string;
    status: ReinforcementTaskStatus;
    withProofFile: boolean;
  }): Promise<string> {
    const task = await prisma.reinforcementTask.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.fixture.academicYearId,
        termId: params.fixture.termId,
        subjectId: params.fixture.subjectId,
        titleEn: `${testSuffix}-${params.marker}`,
        descriptionEn: `${testSuffix}-${params.marker}-description`,
        source: ReinforcementSource.TEACHER,
        status: params.status,
        rewardType: ReinforcementRewardType.MORAL,
        rewardLabelEn: `${testSuffix}-${params.marker}-reward`,
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
        scopeKey: params.fixture.studentIds[0],
        classroomId: params.fixture.classroomId,
        studentId: params.fixture.studentIds[0],
      },
      select: { id: true },
    });
    createdReinforcementTargetIds.push(target.id);

    const stage = await prisma.reinforcementTaskStage.create({
      data: {
        schoolId: params.schoolId,
        taskId: task.id,
        sortOrder: 1,
        titleEn: `${testSuffix}-${params.marker}-stage`,
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
        studentId: params.fixture.studentIds[0],
        enrollmentId: params.fixture.enrollmentIds[0],
        status: params.status,
        progress:
          params.status === ReinforcementTaskStatus.COMPLETED ? 100 : 50,
      },
      select: { id: true },
    });
    createdReinforcementAssignmentIds.push(assignment.id);

    if (params.withProofFile) {
      const file = await prisma.file.create({
        data: {
          schoolId: params.schoolId,
          uploaderId: params.teacherUserId,
          bucket: `${testSuffix}-private-bucket`,
          objectKey: `${testSuffix}-raw-storage-key`,
          originalName: `${params.marker}-proof.png`,
          mimeType: 'image/png',
          sizeBytes: BigInt(1234),
          visibility: FileVisibility.PRIVATE,
        },
        select: { id: true },
      });
      createdFileIds.push(file.id);

      const submission = await prisma.reinforcementSubmission.create({
        data: {
          schoolId: params.schoolId,
          assignmentId: assignment.id,
          taskId: task.id,
          stageId: stage.id,
          studentId: params.fixture.studentIds[0],
          enrollmentId: params.fixture.enrollmentIds[0],
          status: ReinforcementSubmissionStatus.SUBMITTED,
          proofFileId: file.id,
          proofText: `${testSuffix}-proof-text`,
          submittedById: params.teacherUserId,
          submittedAt: new Date('2026-09-16T10:00:00.000Z'),
        },
        select: { id: true },
      });
      createdReinforcementSubmissionIds.push(submission.id);
    }

    return task.id;
  }

  function expectSafeTeacherTaskPayload(value: unknown): void {
    const json = JSON.stringify(value);

    for (const forbidden of [
      'schoolId',
      'scheduleId',
      'bucket',
      'objectKey',
      'raw-storage-key',
      'private-bucket',
      'BehaviorPointLedger',
      'behaviorPoint',
    ]) {
      expect(json).not.toContain(forbidden);
    }
  }

  async function login(email: string): Promise<{ accessToken: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    return { accessToken: response.body.accessToken };
  }
});
