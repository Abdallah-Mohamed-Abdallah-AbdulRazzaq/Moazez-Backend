import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AttendanceMode,
  AttendanceScopeType,
  AttendanceSessionStatus,
  AttendanceStatus,
  BehaviorPointLedgerEntryType,
  BehaviorRecordStatus,
  BehaviorRecordType,
  CommunicationAnnouncementAudienceType,
  CommunicationAnnouncementPriority,
  CommunicationAnnouncementStatus,
  CommunicationConversationStatus,
  CommunicationConversationType,
  CommunicationMessageKind,
  CommunicationMessageStatus,
  CommunicationParticipantRole,
  CommunicationParticipantStatus,
  FileVisibility,
  GradeAnswerCorrectionStatus,
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeAssessmentType,
  GradeItemStatus,
  GradeQuestionType,
  GradeScopeType,
  GradeSubmissionStatus,
  HeroMissionObjectiveType,
  HeroMissionProgressStatus,
  HeroMissionStatus,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  ReinforcementProofType,
  ReinforcementSource,
  ReinforcementSubmissionStatus,
  ReinforcementTaskStatus,
  RewardCatalogItemStatus,
  RewardCatalogItemType,
  RewardRedemptionRequestSource,
  RewardRedemptionStatus,
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
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../src/common/context/request-context';
import { AppModule } from '../../src/app.module';
import { StudentAppAccessService } from '../../src/modules/student-app/access/student-app-access.service';
import { StudentAppStudentReadAdapter } from '../../src/modules/student-app/access/student-app-student-read.adapter';
import type {
  StudentAppEnrollmentRecord,
  StudentAppStudentRecord,
} from '../../src/modules/student-app/shared/student-app.types';

type ExpressLayer = {
  route?: {
    path?: string | string[];
    methods?: Record<string, boolean>;
  };
  handle?: {
    stack?: ExpressLayer[];
  };
};

const STUDENT_USER_ID = 'student-user-1';
const STUDENT_ID = 'student-1';
const ENROLLMENT_ID = 'enrollment-1';
const CLASSROOM_ID = 'classroom-1';
const SCHOOL_ID = 'school-1';
const ORGANIZATION_ID = 'org-1';
const GLOBAL_PREFIX = '/api/v1';
const E2E_PASSWORD = 'StudentApp123!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(120000);

describe('Sprint 8F Student App final closeout access foundation', () => {
  it('does not allow a linked student identity to access another same-school student', async () => {
    const { service, adapter } = createValidService();
    adapter.findOwnedStudentById.mockResolvedValue(null);

    await expect(
      withStudentRequestContext(() =>
        service.assertStudentOwnsStudent('same-school-other-student'),
      ),
    ).rejects.toMatchObject({
      code: 'student_app.student.not_found',
    });
    expect(adapter.findOwnedStudentById).toHaveBeenCalledWith({
      studentId: 'same-school-other-student',
      studentUserId: STUDENT_USER_ID,
    });
  });

  it('hides cross-school guessed student, enrollment, and classroom ids', async () => {
    const { service, adapter } = createValidService();
    adapter.findOwnedStudentById.mockResolvedValue(null);
    adapter.findOwnedEnrollmentById.mockResolvedValue(null);
    adapter.findOwnedClassroomEnrollment.mockResolvedValue(null);

    await expect(
      withStudentRequestContext(() =>
        service.assertStudentOwnsStudent('cross-school-student'),
      ),
    ).rejects.toMatchObject({
      code: 'student_app.student.not_found',
    });
    await expect(
      withStudentRequestContext(() =>
        service.assertStudentOwnsEnrollment('cross-school-enrollment'),
      ),
    ).rejects.toMatchObject({
      code: 'student_app.enrollment.not_found',
    });
    await expect(
      withStudentRequestContext(() =>
        service.assertStudentOwnsClassroom('cross-school-classroom'),
      ),
    ).rejects.toMatchObject({
      code: 'student_app.classroom.not_found',
    });
  });

  it('requires the authenticated actor to be a student with an active school membership', async () => {
    const { service } = createValidService();

    await expect(
      withStudentRequestContext(() => service.getStudentAppContext(), {
        userType: UserType.TEACHER,
      }),
    ).rejects.toMatchObject({
      code: 'student_app.actor.required_student',
    });

    await expect(
      runWithRequestContext(createRequestContext(), async () => {
        setActor({ id: STUDENT_USER_ID, userType: UserType.STUDENT });
        return service.getStudentAppContext();
      }),
    ).rejects.toMatchObject({
      code: 'student_app.actor.required_student',
    });
  });
});

async function withStudentRequestContext<T>(
  fn: () => T | Promise<T>,
  options?: { userType?: UserType },
): Promise<T> {
  return runWithRequestContext(createRequestContext(), async () => {
    setActor({
      id: STUDENT_USER_ID,
      userType: options?.userType ?? UserType.STUDENT,
    });
    setActiveMembership({
      membershipId: 'membership-1',
      organizationId: ORGANIZATION_ID,
      schoolId: SCHOOL_ID,
      roleId: 'role-1',
      permissions: ['students.records.view'],
    });

    return fn();
  });
}

function createValidService(): {
  service: StudentAppAccessService;
  adapter: jest.Mocked<StudentAppStudentReadAdapter>;
} {
  const adapter = {
    findLinkedStudentByUserId: jest.fn().mockResolvedValue(studentFixture()),
    findActiveEnrollmentForStudent: jest
      .fn()
      .mockResolvedValue(enrollmentFixture()),
    findOwnedStudentById: jest.fn(),
    findOwnedEnrollmentById: jest.fn(),
    findOwnedClassroomEnrollment: jest.fn(),
  } as unknown as jest.Mocked<StudentAppStudentReadAdapter>;

  return {
    service: new StudentAppAccessService(adapter),
    adapter,
  };
}

function studentFixture(): StudentAppStudentRecord {
  return {
    id: STUDENT_ID,
    schoolId: SCHOOL_ID,
    organizationId: ORGANIZATION_ID,
    userId: STUDENT_USER_ID,
    status: StudentStatus.ACTIVE,
    deletedAt: null,
    user: {
      id: STUDENT_USER_ID,
      userType: UserType.STUDENT,
      status: UserStatus.ACTIVE,
      deletedAt: null,
    },
  };
}

function enrollmentFixture(): StudentAppEnrollmentRecord {
  return {
    id: ENROLLMENT_ID,
    schoolId: SCHOOL_ID,
    studentId: STUDENT_ID,
    academicYearId: 'year-1',
    termId: null,
    classroomId: CLASSROOM_ID,
    status: StudentEnrollmentStatus.ACTIVE,
    deletedAt: null,
  };
}

describe('Sprint 8F Student App final closeout flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationId: string;
  let schoolId: string;
  let academicYearId: string;
  let termId: string;
  let stageId: string;
  let classroomId: string;
  let subjectId: string;
  let ownAssessmentId: string;
  let ownDraftAssessmentId: string;
  let ownNoSubmissionAssessmentId: string;
  let ownSubmissionId: string;
  let ownPositiveBehaviorRecordId: string;
  let ownNegativeBehaviorRecordId: string;
  let ownDraftBehaviorRecordId: string;
  let otherStudentBehaviorRecordId: string;
  let tenantBBehaviorRecordId: string;
  let heroMissionId: string;
  let heroProgressId: string;
  let otherHeroProgressId: string;
  let heroBadgeId: string;
  let tenantBHeroMissionId: string;
  let ownTaskId: string;
  let ownTaskSubmissionId: string;
  let sameSchoolOtherTaskId: string;
  let sameSchoolOtherTaskSubmissionId: string;
  let tenantBTaskId: string;
  let tenantBTaskSubmissionId: string;
  let ownConversationId: string;
  let sameSchoolOtherConversationId: string;
  let tenantBConversationId: string;
  let ownAnnouncementId: string;
  let customAnnouncementId: string;
  let outOfAudienceAnnouncementId: string;
  let tenantBAnnouncementId: string;
  let otherClassroomSubjectId: string;
  let otherClassroomAssessmentId: string;
  let tenantBSubjectId: string;
  let tenantBAssessmentId: string;
  let linkedStudentUserId: string;
  let linkedStudentId: string;
  let linkedEnrollmentId: string;
  let sameSchoolOtherStudentUserId: string;
  let sameSchoolOtherStudentId: string;
  let sameSchoolOtherEnrollmentId: string;
  let linkedStudentEmail: string;
  let sameSchoolOtherStudentEmail: string;
  let unlinkedStudentEmail: string;
  let noEnrollmentStudentEmail: string;
  let adminEmail: string;
  let teacherEmail: string;
  let parentEmail: string;

  const testSuffix = `student-app-closeout-${Date.now()}`;
  const createdUserIds: string[] = [];
  const createdStudentIds: string[] = [];
  const createdEnrollmentIds: string[] = [];
  const createdAttendanceSessionIds: string[] = [];
  const createdAttendanceEntryIds: string[] = [];
  const createdBehaviorCategoryIds: string[] = [];
  const createdBehaviorRecordIds: string[] = [];
  const createdBehaviorPointLedgerIds: string[] = [];
  const createdHeroBadgeIds: string[] = [];
  const createdHeroMissionIds: string[] = [];
  const createdHeroMissionObjectiveIds: string[] = [];
  const createdHeroMissionProgressIds: string[] = [];
  const createdHeroMissionObjectiveProgressIds: string[] = [];
  const createdHeroStudentBadgeIds: string[] = [];
  const createdRewardCatalogItemIds: string[] = [];
  const createdRewardRedemptionIds: string[] = [];
  const createdXpLedgerIds: string[] = [];
  const createdFileIds: string[] = [];
  const createdAssignmentIds: string[] = [];
  const createdTaskStageIds: string[] = [];
  const createdTaskSubmissionIds: string[] = [];
  const createdConversationIds: string[] = [];
  const createdConversationParticipantIds: string[] = [];
  const createdMessageIds: string[] = [];
  const createdMessageReadIds: string[] = [];
  const createdAnnouncementIds: string[] = [];
  const createdAnnouncementAudienceIds: string[] = [];
  const createdAnnouncementReadIds: string[] = [];
  const createdAnnouncementAttachmentIds: string[] = [];
  const createdGradeAssessmentIds: string[] = [];
  const createdGradeItemIds: string[] = [];
  const createdGradeQuestionIds: string[] = [];
  const createdGradeQuestionOptionIds: string[] = [];
  const createdGradeSubmissionIds: string[] = [];
  const createdGradeSubmissionAnswerIds: string[] = [];
  const createdTaskIds: string[] = [];
  const createdAllocationIds: string[] = [];
  const createdSubjectIds: string[] = [];
  const createdClassroomIds: string[] = [];
  const createdSectionIds: string[] = [];
  const createdGradeIds: string[] = [];
  const createdStageIds: string[] = [];
  const createdTermIds: string[] = [];
  const createdYearIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdOrganizationIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [studentRole, schoolAdminRole, teacherRole, parentRole] =
      await Promise.all([
        findSystemRole('student'),
        findSystemRole('school_admin'),
        findSystemRole('teacher'),
        findSystemRole('parent'),
      ]);

    const organization = await prisma.organization.create({
      data: {
        slug: `${testSuffix}-org`,
        name: `${testSuffix} Org`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    organizationId = organization.id;

    const school = await prisma.school.create({
      data: {
        organizationId,
        slug: `${testSuffix}-school`,
        name: `${testSuffix} School`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    schoolId = school.id;
    createdSchoolIds.push(school.id);
    createdOrganizationIds.push(organization.id);

    await prisma.schoolProfile.create({
      data: {
        schoolId,
        schoolName: `${testSuffix} Profile School`,
        shortName: `${testSuffix} PS`,
      },
    });

    adminEmail = `${testSuffix}-admin@example.test`;
    teacherEmail = `${testSuffix}-teacher@example.test`;
    parentEmail = `${testSuffix}-parent@example.test`;
    linkedStudentEmail = `${testSuffix}-linked-student@example.test`;
    sameSchoolOtherStudentEmail = `${testSuffix}-other-student@example.test`;
    unlinkedStudentEmail = `${testSuffix}-unlinked-student@example.test`;
    noEnrollmentStudentEmail = `${testSuffix}-no-enrollment@example.test`;

    await createUserWithMembership({
      email: adminEmail,
      userType: UserType.SCHOOL_USER,
      roleId: schoolAdminRole.id,
    });
    const teacherUserId = await createUserWithMembership({
      email: teacherEmail,
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
    });
    await createUserWithMembership({
      email: parentEmail,
      userType: UserType.PARENT,
      roleId: parentRole.id,
    });
    linkedStudentUserId = await createUserWithMembership({
      email: linkedStudentEmail,
      userType: UserType.STUDENT,
      roleId: studentRole.id,
    });
    sameSchoolOtherStudentUserId = await createUserWithMembership({
      email: sameSchoolOtherStudentEmail,
      userType: UserType.STUDENT,
      roleId: studentRole.id,
    });
    await createUserWithMembership({
      email: unlinkedStudentEmail,
      userType: UserType.STUDENT,
      roleId: studentRole.id,
    });
    const noEnrollmentStudentUserId = await createUserWithMembership({
      email: noEnrollmentStudentEmail,
      userType: UserType.STUDENT,
      roleId: studentRole.id,
    });

    const academic = await createAcademicFixture(teacherUserId);
    academicYearId = academic.academicYearId;
    termId = academic.termId;
    stageId = academic.stageId;
    classroomId = academic.classroomId;
    subjectId = academic.subjectId;

    const linkedStudent = await prisma.student.create({
      data: {
        schoolId,
        organizationId,
        userId: linkedStudentUserId,
        firstName: 'Linked',
        lastName: 'Student',
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    linkedStudentId = linkedStudent.id;
    createdStudentIds.push(linkedStudent.id);

    const noEnrollmentStudent = await prisma.student.create({
      data: {
        schoolId,
        organizationId,
        userId: noEnrollmentStudentUserId,
        firstName: 'NoEnrollment',
        lastName: 'Student',
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdStudentIds.push(noEnrollmentStudent.id);

    const enrollment = await prisma.enrollment.create({
      data: {
        schoolId,
        studentId: linkedStudentId,
        academicYearId,
        termId,
        classroomId,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      select: { id: true },
    });
    linkedEnrollmentId = enrollment.id;
    createdEnrollmentIds.push(enrollment.id);

    const otherStudentFixture = await createOtherStudentFixture({
      userId: sameSchoolOtherStudentUserId,
    });
    sameSchoolOtherStudentId = otherStudentFixture.studentId;
    sameSchoolOtherEnrollmentId = otherStudentFixture.enrollmentId;

    const behaviorFixture = await createStudentBehaviorFixture({
      otherStudentId: otherStudentFixture.studentId,
      otherEnrollmentId: otherStudentFixture.enrollmentId,
    });
    ownPositiveBehaviorRecordId = behaviorFixture.positiveRecordId;
    ownNegativeBehaviorRecordId = behaviorFixture.negativeRecordId;
    ownDraftBehaviorRecordId = behaviorFixture.draftRecordId;
    otherStudentBehaviorRecordId = behaviorFixture.otherStudentRecordId;

    const heroFixture = await createStudentHeroFixture({
      otherStudentId: otherStudentFixture.studentId,
      otherEnrollmentId: otherStudentFixture.enrollmentId,
    });
    heroMissionId = heroFixture.missionId;
    heroProgressId = heroFixture.progressId;
    otherHeroProgressId = heroFixture.otherProgressId;
    heroBadgeId = heroFixture.badgeId;

    const assessmentFixture = await createAssessmentFixture();
    ownAssessmentId = assessmentFixture.assessmentId;
    ownDraftAssessmentId = assessmentFixture.draftAssessmentId;
    ownNoSubmissionAssessmentId = assessmentFixture.noSubmissionAssessmentId;
    ownSubmissionId = assessmentFixture.submissionId;

    const otherClassroomFixture = await createOtherClassroomAssessmentFixture(
      teacherUserId,
      academic.sectionId,
    );
    otherClassroomSubjectId = otherClassroomFixture.subjectId;
    otherClassroomAssessmentId = otherClassroomFixture.assessmentId;

    const tenantBFixture = await createTenantBAssessmentFixture(teacherUserId);
    tenantBSubjectId = tenantBFixture.subjectId;
    tenantBAssessmentId = tenantBFixture.assessmentId;
    tenantBBehaviorRecordId = tenantBFixture.behaviorRecordId;
    tenantBHeroMissionId = tenantBFixture.heroMissionId;
    tenantBTaskId = tenantBFixture.taskId;
    tenantBTaskSubmissionId = tenantBFixture.taskSubmissionId;

    const taskFixture = await createStudentTaskFixture({
      teacherUserId,
      otherStudentId: sameSchoolOtherStudentId,
      otherEnrollmentId: sameSchoolOtherEnrollmentId,
      otherStudentUserId: sameSchoolOtherStudentUserId,
    });
    ownTaskId = taskFixture.taskId;
    ownTaskSubmissionId = taskFixture.submissionId;
    sameSchoolOtherTaskId = taskFixture.otherTaskId;
    sameSchoolOtherTaskSubmissionId = taskFixture.otherSubmissionId;

    const communicationFixture = await createStudentCommunicationFixture({
      teacherUserId,
      otherStudentUserId: sameSchoolOtherStudentUserId,
      tenantBConversationId: tenantBFixture.conversationId,
      tenantBAnnouncementId: tenantBFixture.announcementId,
    });
    ownConversationId = communicationFixture.conversationId;
    sameSchoolOtherConversationId =
      communicationFixture.otherConversationId;
    tenantBConversationId = communicationFixture.tenantBConversationId;
    ownAnnouncementId = communicationFixture.schoolAnnouncementId;
    customAnnouncementId = communicationFixture.customAnnouncementId;
    outOfAudienceAnnouncementId =
      communicationFixture.outOfAudienceAnnouncementId;
    tenantBAnnouncementId = communicationFixture.tenantBAnnouncementId;

    const xpLedger = await prisma.xpLedger.create({
      data: {
        schoolId,
        academicYearId,
        termId,
        studentId: linkedStudentId,
        enrollmentId: linkedEnrollmentId,
        sourceType: XpSourceType.SYSTEM,
        sourceId: `${testSuffix}-xp-source`,
        amount: 25,
        reason: 'Student App security fixture',
      },
      select: { id: true },
    });
    createdXpLedgerIds.push(xpLedger.id);

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
      await prisma.rewardRedemption.deleteMany({
        where: { id: { in: createdRewardRedemptionIds } },
      });
      await prisma.heroStudentBadge.deleteMany({
        where: { id: { in: createdHeroStudentBadgeIds } },
      });
      await prisma.heroMissionObjectiveProgress.deleteMany({
        where: { id: { in: createdHeroMissionObjectiveProgressIds } },
      });
      await prisma.heroMissionProgress.deleteMany({
        where: { id: { in: createdHeroMissionProgressIds } },
      });
      await prisma.heroMissionObjective.deleteMany({
        where: { id: { in: createdHeroMissionObjectiveIds } },
      });
      await prisma.heroMission.deleteMany({
        where: { id: { in: createdHeroMissionIds } },
      });
      await prisma.heroBadge.deleteMany({
        where: { id: { in: createdHeroBadgeIds } },
      });
      await prisma.rewardCatalogItem.deleteMany({
        where: { id: { in: createdRewardCatalogItemIds } },
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
      await prisma.attendanceEntry.deleteMany({
        where: { id: { in: createdAttendanceEntryIds } },
      });
      await prisma.attendanceSession.deleteMany({
        where: { id: { in: createdAttendanceSessionIds } },
      });
      await prisma.xpLedger.deleteMany({
        where: { id: { in: createdXpLedgerIds } },
      });
      await prisma.communicationAnnouncementRead.deleteMany({
        where: { announcementId: { in: createdAnnouncementIds } },
      });
      await prisma.communicationAnnouncementAttachment.deleteMany({
        where: { id: { in: createdAnnouncementAttachmentIds } },
      });
      await prisma.communicationAnnouncementAudience.deleteMany({
        where: { id: { in: createdAnnouncementAudienceIds } },
      });
      await prisma.communicationAnnouncement.deleteMany({
        where: { id: { in: createdAnnouncementIds } },
      });
      await prisma.communicationMessageRead.deleteMany({
        where: { conversationId: { in: createdConversationIds } },
      });
      await prisma.communicationConversationParticipant.deleteMany({
        where: { id: { in: createdConversationParticipantIds } },
      });
      await prisma.communicationMessage.deleteMany({
        where: { conversationId: { in: createdConversationIds } },
      });
      await prisma.communicationConversation.deleteMany({
        where: { id: { in: createdConversationIds } },
      });
      await prisma.gradeSubmissionAnswerOption.deleteMany({
        where: { answerId: { in: createdGradeSubmissionAnswerIds } },
      });
      await prisma.gradeSubmissionAnswer.deleteMany({
        where: { id: { in: createdGradeSubmissionAnswerIds } },
      });
      await prisma.gradeSubmission.deleteMany({
        where: { id: { in: createdGradeSubmissionIds } },
      });
      await prisma.gradeItem.deleteMany({
        where: { id: { in: createdGradeItemIds } },
      });
      await prisma.gradeAssessmentQuestionOption.deleteMany({
        where: { id: { in: createdGradeQuestionOptionIds } },
      });
      await prisma.gradeAssessmentQuestion.deleteMany({
        where: { id: { in: createdGradeQuestionIds } },
      });
      await prisma.gradeAssessment.deleteMany({
        where: { id: { in: createdGradeAssessmentIds } },
      });
      await prisma.reinforcementSubmission.deleteMany({
        where: { id: { in: createdTaskSubmissionIds } },
      });
      await prisma.reinforcementTaskStage.deleteMany({
        where: { id: { in: createdTaskStageIds } },
      });
      await prisma.reinforcementAssignment.deleteMany({
        where: { id: { in: createdAssignmentIds } },
      });
      await prisma.reinforcementTask.deleteMany({
        where: { id: { in: createdTaskIds } },
      });
      await prisma.file.deleteMany({
        where: { id: { in: createdFileIds } },
      });
      await prisma.teacherSubjectAllocation.deleteMany({
        where: { id: { in: createdAllocationIds } },
      });
      await prisma.enrollment.deleteMany({
        where: { id: { in: createdEnrollmentIds } },
      });
      await prisma.student.deleteMany({
        where: { id: { in: createdStudentIds } },
      });
      await prisma.membership.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
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
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.school.deleteMany({
        where: { id: { in: createdSchoolIds } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: createdOrganizationIds } },
      });
    } finally {
      if (app) await app.close();
      await prisma.$disconnect();
    }
  });

  it('registers the Sprint 8F Student App route set and keeps deferred routes absent', async () => {
    const routes = listRegisteredStudentRoutes();

    expect(routes).toEqual([
      'GET /api/v1/student/announcements',
      'GET /api/v1/student/announcements/:announcementId',
      'GET /api/v1/student/announcements/:announcementId/attachments',
      'GET /api/v1/student/behavior',
      'GET /api/v1/student/behavior/:recordId',
      'GET /api/v1/student/behavior/summary',
      'GET /api/v1/student/exams',
      'GET /api/v1/student/exams/:assessmentId',
      'GET /api/v1/student/exams/:assessmentId/submission',
      'GET /api/v1/student/grades',
      'GET /api/v1/student/grades/assessments/:assessmentId',
      'GET /api/v1/student/grades/summary',
      'GET /api/v1/student/hero',
      'GET /api/v1/student/hero/badges',
      'GET /api/v1/student/hero/missions',
      'GET /api/v1/student/hero/missions/:missionId',
      'GET /api/v1/student/hero/progress',
      'GET /api/v1/student/home',
      'GET /api/v1/student/messages/conversations',
      'GET /api/v1/student/messages/conversations/:conversationId',
      'GET /api/v1/student/messages/conversations/:conversationId/messages',
      'GET /api/v1/student/profile',
      'GET /api/v1/student/progress',
      'GET /api/v1/student/progress/academic',
      'GET /api/v1/student/progress/behavior',
      'GET /api/v1/student/progress/xp',
      'GET /api/v1/student/subjects',
      'GET /api/v1/student/subjects/:subjectId',
      'GET /api/v1/student/tasks',
      'GET /api/v1/student/tasks/:taskId',
      'GET /api/v1/student/tasks/:taskId/submissions',
      'GET /api/v1/student/tasks/:taskId/submissions/:submissionId',
      'GET /api/v1/student/tasks/summary',
      'POST /api/v1/student/announcements/:announcementId/read',
      'POST /api/v1/student/messages/conversations/:conversationId/messages',
      'POST /api/v1/student/messages/conversations/:conversationId/read',
    ]);

    for (const absentRoute of [
      'GET /api/v1/student/schedule',
      'GET /api/v1/student/schedule/week',
      'GET /api/v1/student/timetable',
      'GET /api/v1/student/homeworks',
      'GET /api/v1/student/homework',
      'GET /api/v1/student/pickup',
      'GET /api/v1/student/notifications',
      'GET /api/v1/student/messages/contacts',
      'POST /api/v1/student/messages/conversations',
      'POST /api/v1/student/messages/conversations/:conversationId/attachments',
      'POST /api/v1/student/messages/conversations/:conversationId/audio',
      'POST /api/v1/student/tasks/:taskId/stages/:stageId/submit',
      'POST /api/v1/student/xp/grants/manual',
      'POST /api/v1/student/hero/missions/:missionId/start',
      'POST /api/v1/student/hero/missions/:missionId/complete',
      'POST /api/v1/student/hero/rewards/redeem',
      'POST /api/v1/student/announcements',
      'POST /api/v1/student/announcements/:announcementId/publish',
      'PATCH /api/v1/student/profile',
      'POST /api/v1/student/profile/avatar',
    ]) {
      expect(routes).not.toContain(absentRoute);
    }
  });

  it('allows a linked student to read own home and profile', async () => {
    const { accessToken } = await login(linkedStudentEmail);

    const home = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/home`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(home.body.student).toMatchObject({
      studentId: linkedStudentId,
      displayName: 'Linked Student',
      avatarUrl: null,
    });
    expect(home.body.enrollment).toMatchObject({
      enrollmentId: linkedEnrollmentId,
      academicYearId,
      termId,
      classroom: { id: classroomId },
    });
    expect(home.body.today.schedule).toEqual({
      available: false,
      reason: 'timetable_not_available',
    });
    expect(home.body.summaries).toMatchObject({
      subjectsCount: 1,
      pendingTasksCount: 1,
      totalXp: 25,
      behaviorPoints: null,
    });
    assertNoForbiddenStudentAppFields(home.body);

    const profile = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/profile`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(profile.body.student).toMatchObject({
      studentId: linkedStudentId,
      userId: linkedStudentUserId,
      displayName: 'Linked Student',
      email: linkedStudentEmail,
      avatarUrl: null,
      studentNumber: null,
      status: 'active',
    });
    expect(profile.body.unsupported).toEqual({
      avatarUpload: true,
      preferences: true,
      seatNumber: true,
    });
    assertNoForbiddenStudentAppFields(profile.body);
  });

  it('allows a linked student to read own subjects, grades, and exams', async () => {
    const { accessToken } = await login(linkedStudentEmail);

    const subjects = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/subjects`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(subjects.body.subjects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subjectId,
          id: subjectId,
          code: expect.any(String),
          stats: expect.objectContaining({
            assessmentsCount: 2,
            gradedCount: 1,
            missingCount: 1,
            earnedScore: 8,
            maxScore: 20,
          }),
        }),
      ]),
    );
    expect(JSON.stringify(subjects.body)).not.toContain(
      otherClassroomSubjectId,
    );
    assertNoForbiddenStudentAppFields(subjects.body);

    const subjectDetail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/subjects/${subjectId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(subjectDetail.body.subject).toMatchObject({
      subjectId,
      resources: {
        attachmentsCount: 0,
        unsupportedReason: 'safe_subject_resource_links_not_available',
      },
    });
    expect(subjectDetail.body.lessons).toEqual([]);
    expect(subjectDetail.body.assignments).toEqual([]);
    expect(subjectDetail.body.attachments).toEqual([]);
    assertNoForbiddenStudentAppFields(subjectDetail.body);

    const grades = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/grades`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(grades.body.assessments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assessmentId: ownAssessmentId,
          subjectId,
          score: 8,
          maxScore: 10,
          itemStatus: 'entered',
        }),
      ]),
    );
    expect(JSON.stringify(grades.body)).not.toContain(ownDraftAssessmentId);
    expect(JSON.stringify(grades.body)).not.toContain(
      otherClassroomAssessmentId,
    );
    assertNoForbiddenStudentAppFields(grades.body);

    const gradeSummary = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/grades/summary`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(gradeSummary.body.summary).toMatchObject({
      totalEarned: 8,
      totalMax: 20,
      total_earned: 8,
      total_max: 20,
    });
    assertNoForbiddenStudentAppFields(gradeSummary.body);

    const assessmentGrade = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/grades/assessments/${ownAssessmentId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(assessmentGrade.body).toMatchObject({
      assessment: {
        assessmentId: ownAssessmentId,
        status: 'published',
      },
      grade: {
        score: 8,
        maxScore: 10,
        isVirtualMissing: false,
      },
      submission: {
        submissionId: ownSubmissionId,
        status: 'submitted',
      },
    });
    assertNoForbiddenStudentAppFields(assessmentGrade.body);

    const exams = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/exams`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(exams.body.mapping).toEqual({
      source: 'GradeAssessment.type',
      examTypes: ['QUIZ', 'MONTH_EXAM', 'MIDTERM', 'TERM_EXAM', 'FINAL'],
    });
    expect(JSON.stringify(exams.body)).toContain(ownAssessmentId);
    expect(JSON.stringify(exams.body)).not.toContain(ownDraftAssessmentId);
    assertNoForbiddenStudentAppFields(exams.body);

    const examDetail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/exams/${ownAssessmentId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(examDetail.body).toMatchObject({
      assessmentId: ownAssessmentId,
      status: 'completed',
      question_count: 1,
      stages: [
        expect.objectContaining({
          question_count: 1,
          questions: [
            expect.objectContaining({
              type: 'multiple_choice',
              answer: null,
              options: expect.arrayContaining([
                expect.objectContaining({
                  label: 'Correct visible label',
                }),
              ]),
            }),
          ],
        }),
      ],
    });
    assertNoForbiddenStudentAppFields(examDetail.body);
    assertNoAnswerKeysOrCorrectAnswers(examDetail.body);

    const examSubmission = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/exams/${ownAssessmentId}/submission`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(examSubmission.body).toMatchObject({
      assessmentId: ownAssessmentId,
      status: 'completed',
      submission: {
        submissionId: ownSubmissionId,
        status: 'submitted',
        answers: [
          expect.objectContaining({
            answerText: 'A',
            score: 8,
            selectedOptions: expect.arrayContaining([
              expect.objectContaining({
                label: 'Correct visible label',
              }),
            ]),
          }),
        ],
      },
    });
    assertNoForbiddenStudentAppFields(examSubmission.body);
    assertNoAnswerKeysOrCorrectAnswers(examSubmission.body);
  });

  it('returns safe empty exam submission state without creating a submission', async () => {
    const { accessToken } = await login(linkedStudentEmail);
    const beforeCount = await prisma.gradeSubmission.count({
      where: { assessmentId: ownNoSubmissionAssessmentId },
    });

    const response = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/student/exams/${ownNoSubmissionAssessmentId}/submission`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body).toEqual({
      assessmentId: ownNoSubmissionAssessmentId,
      status: 'not_started',
      submission: null,
    });

    const afterCount = await prisma.gradeSubmission.count({
      where: { assessmentId: ownNoSubmissionAssessmentId },
    });
    expect(afterCount).toBe(beforeCount);
  });

  it('allows a linked student to read own behavior, progress, and hero journey', async () => {
    const { accessToken } = await login(linkedStudentEmail);

    const behavior = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/behavior`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(behavior.body.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: ownPositiveBehaviorRecordId,
          type: 'positive',
          points: 5,
          status: 'approved',
        }),
        expect.objectContaining({
          id: ownNegativeBehaviorRecordId,
          type: 'negative',
          points: -2,
          status: 'approved',
        }),
      ]),
    );
    expect(behavior.body.summary).toMatchObject({
      attendanceCount: 1,
      absenceCount: 1,
      latenessCount: 1,
      positiveCount: 1,
      negativeCount: 1,
      positivePoints: 5,
      negativePoints: -2,
      totalBehaviorPoints: 3,
    });
    expect(JSON.stringify(behavior.body)).not.toContain(
      ownDraftBehaviorRecordId,
    );
    expect(JSON.stringify(behavior.body)).not.toContain(
      otherStudentBehaviorRecordId,
    );
    expect(JSON.stringify(behavior.body)).not.toContain(
      tenantBBehaviorRecordId,
    );
    expect(JSON.stringify(behavior.body)).not.toContain('reviewedById');
    expect(JSON.stringify(behavior.body)).not.toContain('reviewNote');
    expect(JSON.stringify(behavior.body)).not.toContain('xp');
    assertNoForbiddenStudentAppFields(behavior.body);

    const behaviorSummary = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/behavior/summary`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(behaviorSummary.body.summary).toMatchObject({
      positive_points: 5,
      negative_points: -2,
      total_behavior_points: 3,
    });
    assertNoForbiddenStudentAppFields(behaviorSummary.body);

    const behaviorDetail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/behavior/${ownPositiveBehaviorRecordId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(behaviorDetail.body).toMatchObject({
      id: ownPositiveBehaviorRecordId,
      type: 'positive',
      points: 5,
      status: 'approved',
    });
    assertNoForbiddenStudentAppFields(behaviorDetail.body);

    const progress = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/progress`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(progress.body.grades_summary).toMatchObject({
      totalEarned: 8,
      totalMax: 20,
    });
    expect(progress.body.behavior_summary).toMatchObject({
      totalBehaviorPoints: 3,
      positivePoints: 5,
      negativePoints: -2,
    });
    expect(progress.body.xp).toMatchObject({
      totalXp: 25,
      currentLevel: null,
      nextLevelXp: null,
      rank: null,
      tier: null,
    });
    expect(progress.body.xp.totalXp).not.toBe(
      25 + progress.body.behavior_summary.totalBehaviorPoints,
    );
    assertNoForbiddenStudentAppFields(progress.body);

    for (const path of [
      'progress/academic',
      'progress/behavior',
      'progress/xp',
    ]) {
      const response = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/student/${path}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      assertNoForbiddenStudentAppFields(response.body);
    }

    const hero = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/hero`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(hero.body.stats).toMatchObject({
      currentXp: 25,
      requiredXp: null,
      level: null,
      badgesCollected: 1,
      streakDays: null,
    });
    expect(hero.body.levels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          missionId: heroMissionId,
          status: 'completed',
        }),
      ]),
    );
    expect(hero.body.rewardsSummary).toMatchObject({
      totalHeroXp: 0,
      completedMissions: 1,
      rewardRedemptions: {
        requested: 1,
        approved: 0,
        fulfilled: 0,
      },
    });
    expect(JSON.stringify(hero.body)).not.toContain(otherHeroProgressId);
    assertNoForbiddenStudentAppFields(hero.body);

    const heroProgress = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/hero/progress`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(heroProgress.body.summary).toMatchObject({
      total: 1,
      completed: 1,
    });
    expect(JSON.stringify(heroProgress.body)).toContain(heroProgressId);
    expect(JSON.stringify(heroProgress.body)).not.toContain(
      otherHeroProgressId,
    );
    assertNoForbiddenStudentAppFields(heroProgress.body);

    const heroBadges = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/hero/badges`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(heroBadges.body.summary.collected).toBe(1);
    expect(heroBadges.body.badges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          badgeId: heroBadgeId,
          missionId: heroMissionId,
          imageUrl: null,
        }),
      ]),
    );
    assertNoForbiddenStudentAppFields(heroBadges.body);

    const heroMissions = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/hero/missions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(heroMissions.body.visibility).toEqual({
      missionStatus: 'published',
      reason: 'published_stage_term_missions_only',
    });
    expect(heroMissions.body.missions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          missionId: heroMissionId,
          progressId: heroProgressId,
          status: 'completed',
          rewardXp: 10,
        }),
      ]),
    );
    assertNoForbiddenStudentAppFields(heroMissions.body);

    const heroMission = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/hero/missions/${heroMissionId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(heroMission.body).toMatchObject({
      missionId: heroMissionId,
      progressStatus: 'completed',
      rewards: {
        xp: 10,
        next_rank_title: null,
        badge: {
          badgeId: heroBadgeId,
          imageUrl: null,
        },
      },
      progress: {
        progressId: heroProgressId,
        progressPercent: 100,
      },
    });
    assertNoForbiddenStudentAppFields(heroMission.body);
  });

  it('allows a linked student to read own tasks and submissions only', async () => {
    const { accessToken } = await login(linkedStudentEmail);

    const list = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/tasks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(list.body.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taskId: ownTaskId,
          status: 'under_review',
          subject_name: expect.any(String),
        }),
      ]),
    );
    expect(JSON.stringify(list.body)).not.toContain(sameSchoolOtherTaskId);
    expect(JSON.stringify(list.body)).not.toContain(tenantBTaskId);
    assertNoForbiddenStudentAppFields(list.body);

    const summary = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/tasks/summary`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(summary.body.summary.total).toBeGreaterThanOrEqual(1);
    assertNoForbiddenStudentAppFields(summary.body);

    const detail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/tasks/${ownTaskId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(detail.body.task).toMatchObject({
      taskId: ownTaskId,
      status: 'under_review',
      progress: 0.5,
    });
    expect(detail.body.task.submissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          submissionId: ownTaskSubmissionId,
          proofFile: expect.objectContaining({
            fileId: expect.any(String),
            filename: 'student-task-proof.png',
            mimeType: 'image/png',
            size: '123',
          }),
        }),
      ]),
    );
    assertNoForbiddenStudentAppFields(detail.body);

    const submissions = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/tasks/${ownTaskId}/submissions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(submissions.body.submissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ submissionId: ownTaskSubmissionId }),
      ]),
    );
    assertNoForbiddenStudentAppFields(submissions.body);

    const submission = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/student/tasks/${ownTaskId}/submissions/${ownTaskSubmissionId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(submission.body.submission).toMatchObject({
      submissionId: ownTaskSubmissionId,
      status: 'submitted',
    });
    assertNoForbiddenStudentAppFields(submission.body);

    for (const path of [
      `student/tasks/${sameSchoolOtherTaskId}`,
      `student/tasks/${sameSchoolOtherTaskId}/submissions`,
      `student/tasks/${sameSchoolOtherTaskId}/submissions/${sameSchoolOtherTaskSubmissionId}`,
      `student/tasks/${tenantBTaskId}`,
      `student/tasks/${tenantBTaskId}/submissions`,
      `student/tasks/${tenantBTaskId}/submissions/${tenantBTaskSubmissionId}`,
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/${path}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    }

    const { accessToken: otherStudentToken } = await login(
      sameSchoolOtherStudentEmail,
    );
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/tasks/${ownTaskId}`)
      .set('Authorization', `Bearer ${otherStudentToken}`)
      .expect(404);
  });

  it('allows a linked student to use participant conversations only', async () => {
    const { accessToken } = await login(linkedStudentEmail);

    const conversations = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/messages/conversations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(conversations.body.conversations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conversationId: ownConversationId,
          unreadCount: expect.any(Number),
        }),
      ]),
    );
    expect(JSON.stringify(conversations.body)).not.toContain(
      sameSchoolOtherConversationId,
    );
    expect(JSON.stringify(conversations.body)).not.toContain(
      tenantBConversationId,
    );
    assertNoForbiddenStudentAppFields(conversations.body);

    const conversation = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/messages/conversations/${ownConversationId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(conversation.body.conversation).toMatchObject({
      conversationId: ownConversationId,
      status: 'active',
    });
    assertNoForbiddenStudentAppFields(conversation.body);

    const messages = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/student/messages/conversations/${ownConversationId}/messages`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const serializedMessages = JSON.stringify(messages.body);

    expect(serializedMessages).toContain('Visible teacher message');
    expect(serializedMessages).not.toContain('hidden raw student body');
    expect(serializedMessages).not.toContain('deleted raw student body');
    assertNoForbiddenStudentAppFields(messages.body);

    const send = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/student/messages/conversations/${ownConversationId}/messages`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ body: 'Student text reply' })
      .expect(201);

    expect(send.body.message).toMatchObject({
      senderType: 'me',
      type: 'text',
      body: 'Student text reply',
    });
    assertNoForbiddenStudentAppFields(send.body);

    const read = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/student/messages/conversations/${ownConversationId}/read`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);

    expect(read.body).toMatchObject({
      conversationId: ownConversationId,
      markedCount: expect.any(Number),
    });
    assertNoForbiddenStudentAppFields(read.body);

    for (const path of [
      `student/messages/conversations/${sameSchoolOtherConversationId}`,
      `student/messages/conversations/${sameSchoolOtherConversationId}/messages`,
      `student/messages/conversations/${tenantBConversationId}`,
      `student/messages/conversations/${tenantBConversationId}/messages`,
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/${path}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    }

    for (const path of [
      `student/messages/conversations/${sameSchoolOtherConversationId}/messages`,
      `student/messages/conversations/${sameSchoolOtherConversationId}/read`,
      `student/messages/conversations/${tenantBConversationId}/messages`,
      `student/messages/conversations/${tenantBConversationId}/read`,
    ]) {
      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/${path}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ body: 'blocked' })
        .expect(404);
    }

    const { accessToken: otherStudentToken } = await login(
      sameSchoolOtherStudentEmail,
    );
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/messages/conversations/${ownConversationId}`)
      .set('Authorization', `Bearer ${otherStudentToken}`)
      .expect(404);
  });

  it('allows a linked student to read audience-matched announcements only', async () => {
    const { accessToken } = await login(linkedStudentEmail);

    const list = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/announcements`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const serializedList = JSON.stringify(list.body);

    expect(serializedList).toContain(ownAnnouncementId);
    expect(serializedList).toContain(customAnnouncementId);
    expect(serializedList).not.toContain(outOfAudienceAnnouncementId);
    expect(serializedList).not.toContain(tenantBAnnouncementId);
    assertNoForbiddenStudentAppFields(list.body);

    const detail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/announcements/${ownAnnouncementId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(detail.body.announcement).toMatchObject({
      announcementId: ownAnnouncementId,
      title: expect.any(String),
      image: null,
    });
    assertNoForbiddenStudentAppFields(detail.body);

    const read = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/announcements/${ownAnnouncementId}/read`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);

    expect(read.body).toMatchObject({
      announcementId: ownAnnouncementId,
      readAt: expect.any(String),
    });
    assertNoForbiddenStudentAppFields(read.body);

    const attachments = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/student/announcements/${ownAnnouncementId}/attachments`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(attachments.body.attachments).toEqual([
      expect.objectContaining({
        fileId: expect.any(String),
        filename: 'announcement.pdf',
        mimeType: 'application/pdf',
        size: '456',
      }),
    ]);
    assertNoForbiddenStudentAppFields(attachments.body);

    for (const path of [
      `student/announcements/${outOfAudienceAnnouncementId}`,
      `student/announcements/${outOfAudienceAnnouncementId}/attachments`,
      `student/announcements/${tenantBAnnouncementId}`,
      `student/announcements/${tenantBAnnouncementId}/attachments`,
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/${path}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    }

    for (const path of [
      `student/announcements/${outOfAudienceAnnouncementId}/read`,
      `student/announcements/${tenantBAnnouncementId}/read`,
    ]) {
      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/${path}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(404);
    }
  });

  it('hides same-school other-classroom and cross-school guessed ids', async () => {
    const { accessToken } = await login(linkedStudentEmail);

    for (const path of [
      `student/subjects/${otherClassroomSubjectId}`,
      `student/subjects/${tenantBSubjectId}`,
      `student/grades/assessments/${otherClassroomAssessmentId}`,
      `student/grades/assessments/${tenantBAssessmentId}`,
      `student/exams/${otherClassroomAssessmentId}`,
      `student/exams/${tenantBAssessmentId}`,
      `student/exams/${otherClassroomAssessmentId}/submission`,
      `student/exams/${tenantBAssessmentId}/submission`,
      `student/behavior/${otherStudentBehaviorRecordId}`,
      `student/behavior/${tenantBBehaviorRecordId}`,
      `student/hero/missions/${tenantBHeroMissionId}`,
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/${path}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    }
  });

  it('forbids non-student actors from home and profile', async () => {
    for (const email of [adminEmail, teacherEmail, parentEmail]) {
      const { accessToken } = await login(email);

      for (const path of [
        'home',
        'profile',
        'subjects',
        `subjects/${subjectId}`,
        'grades',
        'grades/summary',
        `grades/assessments/${ownAssessmentId}`,
        'exams',
        `exams/${ownAssessmentId}`,
        `exams/${ownAssessmentId}/submission`,
        'behavior',
        'behavior/summary',
        `behavior/${ownPositiveBehaviorRecordId}`,
        'progress',
        'progress/academic',
        'progress/behavior',
        'progress/xp',
        'hero',
        'hero/progress',
        'hero/badges',
        'hero/missions',
        `hero/missions/${heroMissionId}`,
        'tasks',
        'tasks/summary',
        `tasks/${ownTaskId}`,
        `tasks/${ownTaskId}/submissions`,
        `tasks/${ownTaskId}/submissions/${ownTaskSubmissionId}`,
        'messages/conversations',
        `messages/conversations/${ownConversationId}`,
        `messages/conversations/${ownConversationId}/messages`,
        'announcements',
        `announcements/${ownAnnouncementId}`,
        `announcements/${ownAnnouncementId}/attachments`,
      ]) {
        await request(app.getHttpServer())
          .get(`${GLOBAL_PREFIX}/student/${path}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(403);
      }

      for (const path of [
        `messages/conversations/${ownConversationId}/messages`,
        `messages/conversations/${ownConversationId}/read`,
        `announcements/${ownAnnouncementId}/read`,
      ]) {
        await request(app.getHttpServer())
          .post(`${GLOBAL_PREFIX}/student/${path}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ body: 'blocked' })
          .expect(403);
      }
    }
  });

  it('rejects an unlinked student user', async () => {
    const { accessToken } = await login(unlinkedStudentEmail);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/home`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/profile`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('rejects a linked student without an active enrollment', async () => {
    const { accessToken } = await login(noEnrollmentStudentEmail);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/home`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/profile`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('does not expose mutation or avatar upload routes', async () => {
    const { accessToken } = await login(linkedStudentEmail);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/student/profile`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ firstName: 'Changed' })
      .expect(404);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/profile/avatar`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    for (const method of ['post', 'put', 'patch', 'delete'] as const) {
      for (const path of [
        'subjects',
        `subjects/${subjectId}`,
        'grades',
        'grades/summary',
        `grades/assessments/${ownAssessmentId}`,
        'exams',
        `exams/${ownAssessmentId}`,
        `exams/${ownAssessmentId}/submission`,
        'behavior',
        'behavior/summary',
        `behavior/${ownPositiveBehaviorRecordId}`,
        'progress',
        'progress/academic',
        'progress/behavior',
        'progress/xp',
        'hero',
        'hero/progress',
        'hero/badges',
        'hero/missions',
        `hero/missions/${heroMissionId}`,
        'tasks',
        'tasks/summary',
        `tasks/${ownTaskId}`,
        `tasks/${ownTaskId}/submissions`,
        `tasks/${ownTaskId}/submissions/${ownTaskSubmissionId}`,
      ]) {
        await request(app.getHttpServer())
          [method](`${GLOBAL_PREFIX}/student/${path}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({})
          .expect(404);
      }
    }

    for (const path of [
      'xp/grants/manual',
      'behavior/records',
      `behavior/records/${ownPositiveBehaviorRecordId}/submit`,
      `behavior/records/${ownPositiveBehaviorRecordId}/approve`,
      `behavior/records/${ownPositiveBehaviorRecordId}/reject`,
      `hero/missions/${heroMissionId}/start`,
      `hero/missions/${heroMissionId}/complete`,
      `hero/missions/${heroMissionId}/objectives/objective-1/complete`,
      `hero/badges/${heroBadgeId}/award`,
      'hero/rewards/redeem',
      'rewards/redemptions',
      `tasks/${ownTaskId}/stages/student-stage/submit`,
      'messages/contacts',
      'messages/conversations',
      `messages/conversations/${ownConversationId}/attachments`,
      `messages/conversations/${ownConversationId}/audio`,
      'announcements',
      `announcements/${ownAnnouncementId}/publish`,
      `announcements/${ownAnnouncementId}/archive`,
      `announcements/${ownAnnouncementId}/cancel`,
    ]) {
      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/student/${path}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(404);
    }

    for (const method of ['put', 'patch', 'delete'] as const) {
      for (const path of [
        'messages/conversations',
        `messages/conversations/${ownConversationId}`,
        `messages/conversations/${ownConversationId}/messages`,
        `messages/conversations/${ownConversationId}/read`,
        'announcements',
        `announcements/${ownAnnouncementId}`,
        `announcements/${ownAnnouncementId}/read`,
        `announcements/${ownAnnouncementId}/attachments`,
      ]) {
        await request(app.getHttpServer())
          [method](`${GLOBAL_PREFIX}/student/${path}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({})
          .expect(404);
      }
    }
  });

  it('does not expose out-of-scope Student App routes', async () => {
    const { accessToken } = await login(linkedStudentEmail);

    for (const path of [
      'schedule',
      'homework',
      'homeworks',
      'pickup',
      'notifications',
      'messages/contacts',
      'messages/new',
      `messages/conversations/${ownConversationId}/participants`,
      `messages/conversations/${ownConversationId}/invites`,
      `messages/conversations/${ownConversationId}/join-requests`,
      `messages/conversations/${ownConversationId}/attachments`,
      `messages/conversations/${ownConversationId}/audio`,
      `announcements/${ownAnnouncementId}/manage`,
      `announcements/${ownAnnouncementId}/read-summary`,
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/student/${path}`)
        .set('Authorization', `Bearer ${accessToken}`)
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
    userType: UserType;
    roleId: string;
  }): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: params.email,
        firstName: 'StudentApp',
        lastName: params.userType.toLowerCase(),
        userType: params.userType,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(E2E_PASSWORD, ARGON2_OPTIONS),
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

  async function createAcademicFixture(teacherUserId: string): Promise<{
    academicYearId: string;
    termId: string;
    stageId: string;
    classroomId: string;
    sectionId: string;
    subjectId: string;
  }> {
    const year = await prisma.academicYear.create({
      data: {
        schoolId,
        nameAr: `${testSuffix}-year-ar`,
        nameEn: `${testSuffix}-year`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    createdYearIds.push(year.id);

    const term = await prisma.term.create({
      data: {
        schoolId,
        academicYearId: year.id,
        nameAr: `${testSuffix}-term-ar`,
        nameEn: `${testSuffix}-term`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    createdTermIds.push(term.id);

    const stage = await prisma.stage.create({
      data: {
        schoolId,
        nameAr: `${testSuffix}-stage-ar`,
        nameEn: `${testSuffix}-stage`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdStageIds.push(stage.id);

    const grade = await prisma.grade.create({
      data: {
        schoolId,
        stageId: stage.id,
        nameAr: `${testSuffix}-grade-ar`,
        nameEn: `${testSuffix}-grade`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdGradeIds.push(grade.id);

    const section = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `${testSuffix}-section-ar`,
        nameEn: `${testSuffix}-section`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdSectionIds.push(section.id);

    const classroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: section.id,
        nameAr: `${testSuffix}-classroom-ar`,
        nameEn: `${testSuffix}-classroom`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdClassroomIds.push(classroom.id);

    const subject = await prisma.subject.create({
      data: {
        schoolId,
        nameAr: `${testSuffix}-subject-ar`,
        nameEn: `${testSuffix}-subject`,
        code: `${testSuffix.toUpperCase()}-SUBJECT`,
        isActive: true,
      },
      select: { id: true },
    });
    createdSubjectIds.push(subject.id);

    const allocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId,
        teacherUserId,
        subjectId: subject.id,
        classroomId: classroom.id,
        termId: term.id,
      },
      select: { id: true },
    });
    createdAllocationIds.push(allocation.id);

    return {
      academicYearId: year.id,
      termId: term.id,
      stageId: stage.id,
      classroomId: classroom.id,
      sectionId: section.id,
      subjectId: subject.id,
    };
  }

  async function createOtherStudentFixture(params?: {
    userId?: string;
  }): Promise<{
    studentId: string;
    enrollmentId: string;
  }> {
    const student = await prisma.student.create({
      data: {
        schoolId,
        organizationId,
        userId: params?.userId,
        firstName: 'Other',
        lastName: 'Student',
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdStudentIds.push(student.id);

    const enrollment = await prisma.enrollment.create({
      data: {
        schoolId,
        studentId: student.id,
        academicYearId,
        termId,
        classroomId,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      select: { id: true },
    });
    createdEnrollmentIds.push(enrollment.id);

    return { studentId: student.id, enrollmentId: enrollment.id };
  }

  async function createStudentTaskFixture(params: {
    teacherUserId: string;
    otherStudentId: string;
    otherEnrollmentId: string;
    otherStudentUserId: string;
  }): Promise<{
    taskId: string;
    submissionId: string;
    otherTaskId: string;
    otherSubmissionId: string;
  }> {
    const task = await prisma.reinforcementTask.create({
      data: {
        schoolId,
        academicYearId,
        termId,
        subjectId,
        titleEn: `${testSuffix} Student Task`,
        descriptionEn: 'Visible student app task.',
        source: ReinforcementSource.TEACHER,
        status: ReinforcementTaskStatus.UNDER_REVIEW,
        dueDate: new Date('2026-10-15T08:00:00.000Z'),
        assignedById: params.teacherUserId,
        assignedByName: 'StudentApp Teacher',
        createdById: params.teacherUserId,
      },
      select: { id: true },
    });
    createdTaskIds.push(task.id);

    const stage = await prisma.reinforcementTaskStage.create({
      data: {
        schoolId,
        taskId: task.id,
        sortOrder: 1,
        titleEn: `${testSuffix} Proof stage`,
        proofType: ReinforcementProofType.IMAGE,
        requiresApproval: true,
      },
      select: { id: true },
    });
    createdTaskStageIds.push(stage.id);

    const assignment = await prisma.reinforcementAssignment.create({
      data: {
        schoolId,
        taskId: task.id,
        academicYearId,
        termId,
        studentId: linkedStudentId,
        enrollmentId: linkedEnrollmentId,
        status: ReinforcementTaskStatus.UNDER_REVIEW,
        progress: 50,
      },
      select: { id: true },
    });
    createdAssignmentIds.push(assignment.id);

    const proofFile = await prisma.file.create({
      data: {
        organizationId,
        schoolId,
        uploaderId: linkedStudentUserId,
        bucket: `${testSuffix}-bucket`,
        objectKey: `${testSuffix}/student-task-proof.png`,
        originalName: 'student-task-proof.png',
        mimeType: 'image/png',
        sizeBytes: 123n,
        visibility: FileVisibility.PRIVATE,
      },
      select: { id: true },
    });
    createdFileIds.push(proofFile.id);

    const submission = await prisma.reinforcementSubmission.create({
      data: {
        schoolId,
        assignmentId: assignment.id,
        taskId: task.id,
        stageId: stage.id,
        studentId: linkedStudentId,
        enrollmentId: linkedEnrollmentId,
        status: ReinforcementSubmissionStatus.SUBMITTED,
        proofFileId: proofFile.id,
        proofText: 'Student proof text',
        submittedById: linkedStudentUserId,
        submittedAt: new Date('2026-10-10T08:00:00.000Z'),
      },
      select: { id: true },
    });
    createdTaskSubmissionIds.push(submission.id);

    const otherTask = await prisma.reinforcementTask.create({
      data: {
        schoolId,
        academicYearId,
        termId,
        titleEn: `${testSuffix} Other Student Task`,
        source: ReinforcementSource.TEACHER,
        status: ReinforcementTaskStatus.NOT_COMPLETED,
        assignedById: params.teacherUserId,
        createdById: params.teacherUserId,
      },
      select: { id: true },
    });
    createdTaskIds.push(otherTask.id);

    const otherStage = await prisma.reinforcementTaskStage.create({
      data: {
        schoolId,
        taskId: otherTask.id,
        sortOrder: 1,
        titleEn: `${testSuffix} Other proof stage`,
        proofType: ReinforcementProofType.NONE,
      },
      select: { id: true },
    });
    createdTaskStageIds.push(otherStage.id);

    const otherAssignment = await prisma.reinforcementAssignment.create({
      data: {
        schoolId,
        taskId: otherTask.id,
        academicYearId,
        termId,
        studentId: params.otherStudentId,
        enrollmentId: params.otherEnrollmentId,
        status: ReinforcementTaskStatus.NOT_COMPLETED,
        progress: 0,
      },
      select: { id: true },
    });
    createdAssignmentIds.push(otherAssignment.id);

    const otherSubmission = await prisma.reinforcementSubmission.create({
      data: {
        schoolId,
        assignmentId: otherAssignment.id,
        taskId: otherTask.id,
        stageId: otherStage.id,
        studentId: params.otherStudentId,
        enrollmentId: params.otherEnrollmentId,
        status: ReinforcementSubmissionStatus.PENDING,
        submittedById: params.otherStudentUserId,
      },
      select: { id: true },
    });
    createdTaskSubmissionIds.push(otherSubmission.id);

    return {
      taskId: task.id,
      submissionId: submission.id,
      otherTaskId: otherTask.id,
      otherSubmissionId: otherSubmission.id,
    };
  }

  async function createStudentCommunicationFixture(params: {
    teacherUserId: string;
    otherStudentUserId: string;
    tenantBConversationId: string;
    tenantBAnnouncementId: string;
  }): Promise<{
    conversationId: string;
    otherConversationId: string;
    tenantBConversationId: string;
    schoolAnnouncementId: string;
    customAnnouncementId: string;
    outOfAudienceAnnouncementId: string;
    tenantBAnnouncementId: string;
  }> {
    const conversation = await prisma.communicationConversation.create({
      data: {
        schoolId,
        type: CommunicationConversationType.DIRECT,
        status: CommunicationConversationStatus.ACTIVE,
        titleEn: `${testSuffix} Student Conversation`,
        lastMessageAt: new Date('2026-10-11T08:02:00.000Z'),
        createdById: params.teacherUserId,
      },
      select: { id: true },
    });
    createdConversationIds.push(conversation.id);

    for (const userId of [linkedStudentUserId, params.teacherUserId]) {
      const participant =
        await prisma.communicationConversationParticipant.create({
          data: {
            schoolId,
            conversationId: conversation.id,
            userId,
            role: CommunicationParticipantRole.MEMBER,
            status: CommunicationParticipantStatus.ACTIVE,
          },
          select: { id: true },
        });
      createdConversationParticipantIds.push(participant.id);
    }

    for (const data of [
      {
        body: 'Visible teacher message',
        status: CommunicationMessageStatus.SENT,
        hiddenAt: null,
        deletedAt: null,
      },
      {
        body: 'hidden raw student body',
        status: CommunicationMessageStatus.HIDDEN,
        hiddenAt: new Date('2026-10-11T08:03:00.000Z'),
        deletedAt: null,
      },
      {
        body: 'deleted raw student body',
        status: CommunicationMessageStatus.DELETED,
        hiddenAt: null,
        deletedAt: new Date('2026-10-11T08:04:00.000Z'),
      },
    ]) {
      const message = await prisma.communicationMessage.create({
        data: {
          schoolId,
          conversationId: conversation.id,
          senderUserId: params.teacherUserId,
          kind: CommunicationMessageKind.TEXT,
          status: data.status,
          body: data.body,
          hiddenAt: data.hiddenAt,
          deletedAt: data.deletedAt,
          sentAt: new Date('2026-10-11T08:02:00.000Z'),
        },
        select: { id: true },
      });
      createdMessageIds.push(message.id);
    }

    const otherConversation = await prisma.communicationConversation.create({
      data: {
        schoolId,
        type: CommunicationConversationType.DIRECT,
        status: CommunicationConversationStatus.ACTIVE,
        titleEn: `${testSuffix} Other Student Conversation`,
        lastMessageAt: new Date('2026-10-11T09:00:00.000Z'),
        createdById: params.teacherUserId,
      },
      select: { id: true },
    });
    createdConversationIds.push(otherConversation.id);

    for (const userId of [params.otherStudentUserId, params.teacherUserId]) {
      const participant =
        await prisma.communicationConversationParticipant.create({
          data: {
            schoolId,
            conversationId: otherConversation.id,
            userId,
            role: CommunicationParticipantRole.MEMBER,
            status: CommunicationParticipantStatus.ACTIVE,
          },
          select: { id: true },
        });
      createdConversationParticipantIds.push(participant.id);
    }

    const schoolAnnouncement = await prisma.communicationAnnouncement.create({
      data: {
        schoolId,
        title: `${testSuffix} School Announcement`,
        body: 'Published announcement for the school.',
        status: CommunicationAnnouncementStatus.PUBLISHED,
        priority: CommunicationAnnouncementPriority.NORMAL,
        audienceType: CommunicationAnnouncementAudienceType.SCHOOL,
        category: 'school',
        isPinned: true,
        actionLabel: 'Open',
        publishedAt: new Date('2026-01-09T08:00:00.000Z'),
        createdById: params.teacherUserId,
        publishedById: params.teacherUserId,
      },
      select: { id: true },
    });
    createdAnnouncementIds.push(schoolAnnouncement.id);

    const customAnnouncement = await prisma.communicationAnnouncement.create({
      data: {
        schoolId,
        title: `${testSuffix} Custom Student Announcement`,
        body: 'Published announcement for the linked student.',
        status: CommunicationAnnouncementStatus.PUBLISHED,
        priority: CommunicationAnnouncementPriority.HIGH,
        audienceType: CommunicationAnnouncementAudienceType.CUSTOM,
        category: 'student',
        publishedAt: new Date('2026-01-09T09:00:00.000Z'),
        createdById: params.teacherUserId,
        publishedById: params.teacherUserId,
      },
      select: { id: true },
    });
    createdAnnouncementIds.push(customAnnouncement.id);
    const customAudience =
      await prisma.communicationAnnouncementAudience.create({
        data: {
          schoolId,
          announcementId: customAnnouncement.id,
          audienceType: CommunicationAnnouncementAudienceType.CUSTOM,
          studentId: linkedStudentId,
          userId: linkedStudentUserId,
        },
        select: { id: true },
      });
    createdAnnouncementAudienceIds.push(customAudience.id);

    const outOfAudienceAnnouncement =
      await prisma.communicationAnnouncement.create({
        data: {
          schoolId,
          title: `${testSuffix} Other Student Announcement`,
          body: 'Hidden announcement for another student.',
          status: CommunicationAnnouncementStatus.PUBLISHED,
          priority: CommunicationAnnouncementPriority.NORMAL,
          audienceType: CommunicationAnnouncementAudienceType.CUSTOM,
          category: 'student',
          publishedAt: new Date('2026-01-09T10:00:00.000Z'),
          createdById: params.teacherUserId,
          publishedById: params.teacherUserId,
        },
        select: { id: true },
      });
    createdAnnouncementIds.push(outOfAudienceAnnouncement.id);
    const outOfAudience =
      await prisma.communicationAnnouncementAudience.create({
        data: {
          schoolId,
          announcementId: outOfAudienceAnnouncement.id,
          audienceType: CommunicationAnnouncementAudienceType.CUSTOM,
          studentId: sameSchoolOtherStudentId,
          userId: params.otherStudentUserId,
        },
        select: { id: true },
      });
    createdAnnouncementAudienceIds.push(outOfAudience.id);

    const attachmentFile = await prisma.file.create({
      data: {
        organizationId,
        schoolId,
        uploaderId: params.teacherUserId,
        bucket: `${testSuffix}-announcement-bucket`,
        objectKey: `${testSuffix}/announcement.pdf`,
        originalName: 'announcement.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 456n,
        visibility: FileVisibility.PRIVATE,
      },
      select: { id: true },
    });
    createdFileIds.push(attachmentFile.id);

    const attachment =
      await prisma.communicationAnnouncementAttachment.create({
        data: {
          schoolId,
          announcementId: schoolAnnouncement.id,
          fileId: attachmentFile.id,
          createdById: params.teacherUserId,
          sortOrder: 1,
        },
        select: { id: true },
      });
    createdAnnouncementAttachmentIds.push(attachment.id);

    return {
      conversationId: conversation.id,
      otherConversationId: otherConversation.id,
      tenantBConversationId: params.tenantBConversationId,
      schoolAnnouncementId: schoolAnnouncement.id,
      customAnnouncementId: customAnnouncement.id,
      outOfAudienceAnnouncementId: outOfAudienceAnnouncement.id,
      tenantBAnnouncementId: params.tenantBAnnouncementId,
    };
  }

  async function createStudentBehaviorFixture(params: {
    otherStudentId: string;
    otherEnrollmentId: string;
  }): Promise<{
    positiveRecordId: string;
    negativeRecordId: string;
    draftRecordId: string;
    otherStudentRecordId: string;
  }> {
    const positiveCategory = await prisma.behaviorCategory.create({
      data: {
        schoolId,
        code: `${testSuffix}-positive`,
        nameEn: `${testSuffix} Positive`,
        type: BehaviorRecordType.POSITIVE,
        defaultPoints: 5,
        isActive: true,
      },
      select: { id: true },
    });
    createdBehaviorCategoryIds.push(positiveCategory.id);

    const negativeCategory = await prisma.behaviorCategory.create({
      data: {
        schoolId,
        code: `${testSuffix}-negative`,
        nameEn: `${testSuffix} Negative`,
        type: BehaviorRecordType.NEGATIVE,
        defaultPoints: -2,
        isActive: true,
      },
      select: { id: true },
    });
    createdBehaviorCategoryIds.push(negativeCategory.id);

    const positiveRecord = await prisma.behaviorRecord.create({
      data: {
        schoolId,
        academicYearId,
        termId,
        studentId: linkedStudentId,
        enrollmentId: linkedEnrollmentId,
        categoryId: positiveCategory.id,
        type: BehaviorRecordType.POSITIVE,
        status: BehaviorRecordStatus.APPROVED,
        titleEn: `${testSuffix} Helpful`,
        noteEn: 'Visible student behavior note.',
        points: 5,
        occurredAt: new Date('2026-10-01T08:00:00.000Z'),
      },
      select: { id: true },
    });
    createdBehaviorRecordIds.push(positiveRecord.id);

    const negativeRecord = await prisma.behaviorRecord.create({
      data: {
        schoolId,
        academicYearId,
        termId,
        studentId: linkedStudentId,
        enrollmentId: linkedEnrollmentId,
        categoryId: negativeCategory.id,
        type: BehaviorRecordType.NEGATIVE,
        status: BehaviorRecordStatus.APPROVED,
        titleEn: `${testSuffix} Late`,
        noteEn: 'Visible lateness behavior note.',
        points: -2,
        occurredAt: new Date('2026-10-02T08:00:00.000Z'),
      },
      select: { id: true },
    });
    createdBehaviorRecordIds.push(negativeRecord.id);

    const draftRecord = await prisma.behaviorRecord.create({
      data: {
        schoolId,
        academicYearId,
        termId,
        studentId: linkedStudentId,
        enrollmentId: linkedEnrollmentId,
        categoryId: positiveCategory.id,
        type: BehaviorRecordType.POSITIVE,
        status: BehaviorRecordStatus.DRAFT,
        titleEn: `${testSuffix} Hidden Draft`,
        points: 9,
        occurredAt: new Date('2026-10-03T08:00:00.000Z'),
      },
      select: { id: true },
    });
    createdBehaviorRecordIds.push(draftRecord.id);

    const otherStudentRecord = await prisma.behaviorRecord.create({
      data: {
        schoolId,
        academicYearId,
        termId,
        studentId: params.otherStudentId,
        enrollmentId: params.otherEnrollmentId,
        categoryId: positiveCategory.id,
        type: BehaviorRecordType.POSITIVE,
        status: BehaviorRecordStatus.APPROVED,
        titleEn: `${testSuffix} Other Student Behavior`,
        points: 7,
        occurredAt: new Date('2026-10-04T08:00:00.000Z'),
      },
      select: { id: true },
    });
    createdBehaviorRecordIds.push(otherStudentRecord.id);

    const positiveLedger = await prisma.behaviorPointLedger.create({
      data: {
        schoolId,
        academicYearId,
        termId,
        studentId: linkedStudentId,
        enrollmentId: linkedEnrollmentId,
        recordId: positiveRecord.id,
        categoryId: positiveCategory.id,
        entryType: BehaviorPointLedgerEntryType.AWARD,
        amount: 5,
        reasonEn: 'Approved positive behavior.',
      },
      select: { id: true },
    });
    createdBehaviorPointLedgerIds.push(positiveLedger.id);

    const negativeLedger = await prisma.behaviorPointLedger.create({
      data: {
        schoolId,
        academicYearId,
        termId,
        studentId: linkedStudentId,
        enrollmentId: linkedEnrollmentId,
        recordId: negativeRecord.id,
        categoryId: negativeCategory.id,
        entryType: BehaviorPointLedgerEntryType.PENALTY,
        amount: -2,
        reasonEn: 'Approved negative behavior.',
      },
      select: { id: true },
    });
    createdBehaviorPointLedgerIds.push(negativeLedger.id);

    await createAttendanceFixture();

    return {
      positiveRecordId: positiveRecord.id,
      negativeRecordId: negativeRecord.id,
      draftRecordId: draftRecord.id,
      otherStudentRecordId: otherStudentRecord.id,
    };
  }

  async function createAttendanceFixture(): Promise<void> {
    const statuses = [
      AttendanceStatus.PRESENT,
      AttendanceStatus.ABSENT,
      AttendanceStatus.LATE,
    ];

    for (const [index, status] of statuses.entries()) {
      const session = await prisma.attendanceSession.create({
        data: {
          schoolId,
          academicYearId,
          termId,
          date: new Date(`2026-10-0${index + 1}T00:00:00.000Z`),
          scopeType: AttendanceScopeType.CLASSROOM,
          scopeKey: classroomId,
          classroomId,
          mode: AttendanceMode.DAILY,
          periodKey: `daily-${index + 1}`,
          status: AttendanceSessionStatus.SUBMITTED,
          submittedAt: new Date(`2026-10-0${index + 1}T08:00:00.000Z`),
          submittedById: linkedStudentUserId,
        },
        select: { id: true },
      });
      createdAttendanceSessionIds.push(session.id);

      const entry = await prisma.attendanceEntry.create({
        data: {
          schoolId,
          sessionId: session.id,
          studentId: linkedStudentId,
          enrollmentId: linkedEnrollmentId,
          status,
          markedAt: new Date(`2026-10-0${index + 1}T08:05:00.000Z`),
          markedById: linkedStudentUserId,
        },
        select: { id: true },
      });
      createdAttendanceEntryIds.push(entry.id);
    }
  }

  async function createStudentHeroFixture(params: {
    otherStudentId: string;
    otherEnrollmentId: string;
  }): Promise<{
    missionId: string;
    progressId: string;
    otherProgressId: string;
    badgeId: string;
  }> {
    const badge = await prisma.heroBadge.create({
      data: {
        schoolId,
        slug: `${testSuffix}-badge`,
        nameEn: `${testSuffix} Badge`,
        descriptionEn: 'Student App visible badge.',
        isActive: true,
      },
      select: { id: true },
    });
    createdHeroBadgeIds.push(badge.id);

    const mission = await prisma.heroMission.create({
      data: {
        schoolId,
        academicYearId,
        termId,
        stageId,
        subjectId,
        titleEn: `${testSuffix} Hero Mission`,
        briefEn: 'Read-only mission brief.',
        requiredLevel: 1,
        rewardXp: 10,
        badgeRewardId: badge.id,
        status: HeroMissionStatus.PUBLISHED,
        positionX: 10,
        positionY: 20,
        sortOrder: 1,
        publishedAt: new Date('2026-09-20T08:00:00.000Z'),
        publishedById: linkedStudentUserId,
        createdById: linkedStudentUserId,
      },
      select: { id: true },
    });
    createdHeroMissionIds.push(mission.id);

    const objective = await prisma.heroMissionObjective.create({
      data: {
        schoolId,
        missionId: mission.id,
        type: HeroMissionObjectiveType.QUIZ,
        titleEn: `${testSuffix} Objective`,
        subtitleEn: 'Complete the quiz.',
        sortOrder: 1,
        isRequired: true,
      },
      select: { id: true },
    });
    createdHeroMissionObjectiveIds.push(objective.id);

    const progress = await prisma.heroMissionProgress.create({
      data: {
        schoolId,
        missionId: mission.id,
        studentId: linkedStudentId,
        enrollmentId: linkedEnrollmentId,
        academicYearId,
        termId,
        status: HeroMissionProgressStatus.COMPLETED,
        progressPercent: 100,
        startedAt: new Date('2026-10-01T08:00:00.000Z'),
        completedAt: new Date('2026-10-02T08:00:00.000Z'),
        lastActivityAt: new Date('2026-10-02T08:00:00.000Z'),
      },
      select: { id: true },
    });
    createdHeroMissionProgressIds.push(progress.id);

    const objectiveProgress = await prisma.heroMissionObjectiveProgress.create({
      data: {
        schoolId,
        missionProgressId: progress.id,
        objectiveId: objective.id,
        completedAt: new Date('2026-10-02T08:00:00.000Z'),
        completedById: linkedStudentUserId,
      },
      select: { id: true },
    });
    createdHeroMissionObjectiveProgressIds.push(objectiveProgress.id);

    const otherProgress = await prisma.heroMissionProgress.create({
      data: {
        schoolId,
        missionId: mission.id,
        studentId: params.otherStudentId,
        enrollmentId: params.otherEnrollmentId,
        academicYearId,
        termId,
        status: HeroMissionProgressStatus.IN_PROGRESS,
        progressPercent: 50,
        startedAt: new Date('2026-10-01T08:00:00.000Z'),
        lastActivityAt: new Date('2026-10-01T09:00:00.000Z'),
      },
      select: { id: true },
    });
    createdHeroMissionProgressIds.push(otherProgress.id);

    const studentBadge = await prisma.heroStudentBadge.create({
      data: {
        schoolId,
        studentId: linkedStudentId,
        badgeId: badge.id,
        missionId: mission.id,
        missionProgressId: progress.id,
        earnedAt: new Date('2026-10-02T08:00:00.000Z'),
      },
      select: { id: true },
    });
    createdHeroStudentBadgeIds.push(studentBadge.id);

    const reward = await prisma.rewardCatalogItem.create({
      data: {
        schoolId,
        academicYearId,
        termId,
        titleEn: `${testSuffix} Reward`,
        type: RewardCatalogItemType.OTHER,
        status: RewardCatalogItemStatus.PUBLISHED,
        isUnlimited: true,
        publishedAt: new Date('2026-09-20T08:00:00.000Z'),
        publishedById: linkedStudentUserId,
        createdById: linkedStudentUserId,
      },
      select: { id: true },
    });
    createdRewardCatalogItemIds.push(reward.id);

    const redemption = await prisma.rewardRedemption.create({
      data: {
        schoolId,
        catalogItemId: reward.id,
        studentId: linkedStudentId,
        enrollmentId: linkedEnrollmentId,
        academicYearId,
        termId,
        status: RewardRedemptionStatus.REQUESTED,
        requestSource: RewardRedemptionRequestSource.STUDENT_APP,
        requestedById: linkedStudentUserId,
      },
      select: { id: true },
    });
    createdRewardRedemptionIds.push(redemption.id);

    return {
      missionId: mission.id,
      progressId: progress.id,
      otherProgressId: otherProgress.id,
      badgeId: badge.id,
    };
  }

  async function createAssessmentFixture(): Promise<{
    assessmentId: string;
    draftAssessmentId: string;
    noSubmissionAssessmentId: string;
    submissionId: string;
  }> {
    const assessment = await prisma.gradeAssessment.create({
      data: {
        schoolId,
        academicYearId,
        termId,
        subjectId,
        scopeType: GradeScopeType.CLASSROOM,
        scopeKey: classroomId,
        classroomId,
        titleEn: `${testSuffix} Published Quiz`,
        type: GradeAssessmentType.QUIZ,
        deliveryMode: GradeAssessmentDeliveryMode.QUESTION_BASED,
        date: new Date('2026-10-01T00:00:00.000Z'),
        weight: 10,
        maxScore: 10,
        expectedTimeMinutes: 30,
        approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
        publishedAt: new Date('2026-09-20T08:00:00.000Z'),
        publishedById: linkedStudentUserId,
        createdById: linkedStudentUserId,
      },
      select: { id: true },
    });
    createdGradeAssessmentIds.push(assessment.id);

    const draftAssessment = await prisma.gradeAssessment.create({
      data: {
        schoolId,
        academicYearId,
        termId,
        subjectId,
        scopeType: GradeScopeType.CLASSROOM,
        scopeKey: classroomId,
        classroomId,
        titleEn: `${testSuffix} Draft Quiz`,
        type: GradeAssessmentType.QUIZ,
        deliveryMode: GradeAssessmentDeliveryMode.SCORE_ONLY,
        date: new Date('2026-10-02T00:00:00.000Z'),
        weight: 5,
        maxScore: 10,
        approvalStatus: GradeAssessmentApprovalStatus.DRAFT,
        createdById: linkedStudentUserId,
      },
      select: { id: true },
    });
    createdGradeAssessmentIds.push(draftAssessment.id);

    const noSubmissionAssessment = await prisma.gradeAssessment.create({
      data: {
        schoolId,
        academicYearId,
        termId,
        subjectId,
        scopeType: GradeScopeType.CLASSROOM,
        scopeKey: classroomId,
        classroomId,
        titleEn: `${testSuffix} Future Quiz`,
        type: GradeAssessmentType.QUIZ,
        deliveryMode: GradeAssessmentDeliveryMode.QUESTION_BASED,
        date: new Date('2026-10-03T00:00:00.000Z'),
        weight: 5,
        maxScore: 10,
        expectedTimeMinutes: 20,
        approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
        publishedAt: new Date('2026-09-21T08:00:00.000Z'),
        publishedById: linkedStudentUserId,
        createdById: linkedStudentUserId,
      },
      select: { id: true },
    });
    createdGradeAssessmentIds.push(noSubmissionAssessment.id);

    const gradeItem = await prisma.gradeItem.create({
      data: {
        schoolId,
        termId,
        assessmentId: assessment.id,
        studentId: linkedStudentId,
        enrollmentId: linkedEnrollmentId,
        score: 8,
        status: GradeItemStatus.ENTERED,
        comment: 'Visible student feedback',
        enteredById: linkedStudentUserId,
        enteredAt: new Date('2026-10-04T08:00:00.000Z'),
      },
      select: { id: true },
    });
    createdGradeItemIds.push(gradeItem.id);

    const question = await prisma.gradeAssessmentQuestion.create({
      data: {
        schoolId,
        assessmentId: assessment.id,
        type: GradeQuestionType.MCQ_SINGLE,
        prompt: 'Choose the visible answer.',
        points: 10,
        sortOrder: 1,
        required: true,
        answerKey: {
          correctOption: 'hidden-option',
          storageKey: 'hidden-question-key',
        },
      },
      select: { id: true },
    });
    createdGradeQuestionIds.push(question.id);

    const correctOption = await prisma.gradeAssessmentQuestionOption.create({
      data: {
        schoolId,
        assessmentId: assessment.id,
        questionId: question.id,
        label: 'Correct visible label',
        value: 'A',
        isCorrect: true,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdGradeQuestionOptionIds.push(correctOption.id);

    const incorrectOption = await prisma.gradeAssessmentQuestionOption.create({
      data: {
        schoolId,
        assessmentId: assessment.id,
        questionId: question.id,
        label: 'Distractor visible label',
        value: 'B',
        isCorrect: false,
        sortOrder: 2,
      },
      select: { id: true },
    });
    createdGradeQuestionOptionIds.push(incorrectOption.id);

    const submission = await prisma.gradeSubmission.create({
      data: {
        schoolId,
        assessmentId: assessment.id,
        termId,
        studentId: linkedStudentId,
        enrollmentId: linkedEnrollmentId,
        status: GradeSubmissionStatus.SUBMITTED,
        startedAt: new Date('2026-10-04T08:00:00.000Z'),
        submittedAt: new Date('2026-10-04T08:30:00.000Z'),
        correctedAt: new Date('2026-10-05T08:00:00.000Z'),
        reviewedById: linkedStudentUserId,
        totalScore: 8,
        maxScore: 10,
      },
      select: { id: true },
    });
    createdGradeSubmissionIds.push(submission.id);

    const answer = await prisma.gradeSubmissionAnswer.create({
      data: {
        schoolId,
        submissionId: submission.id,
        assessmentId: assessment.id,
        questionId: question.id,
        studentId: linkedStudentId,
        answerText: 'A',
        answerJson: {
          selected: 'A',
          answerKey: 'hidden-answer-key',
          correctAnswer: 'A',
          storageKey: 'raw-storage-key',
          objectKey: 'raw-object-key',
          bucket: 'raw-bucket',
          url: 'https://raw-storage.invalid/file',
        },
        correctionStatus: GradeAnswerCorrectionStatus.CORRECTED,
        awardedPoints: 8,
        maxPoints: 10,
        reviewerComment: 'Visible review comment',
        reviewedById: linkedStudentUserId,
        reviewedAt: new Date('2026-10-05T08:00:00.000Z'),
      },
      select: { id: true },
    });
    createdGradeSubmissionAnswerIds.push(answer.id);

    await prisma.gradeSubmissionAnswerOption.create({
      data: {
        schoolId,
        answerId: answer.id,
        optionId: correctOption.id,
      },
    });

    return {
      assessmentId: assessment.id,
      draftAssessmentId: draftAssessment.id,
      noSubmissionAssessmentId: noSubmissionAssessment.id,
      submissionId: submission.id,
    };
  }

  async function createOtherClassroomAssessmentFixture(
    teacherUserId: string,
    sectionId: string,
  ): Promise<{ subjectId: string; assessmentId: string }> {
    const classroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId,
        nameAr: `${testSuffix}-other-classroom-ar`,
        nameEn: `${testSuffix}-other-classroom`,
        sortOrder: 2,
      },
      select: { id: true },
    });
    createdClassroomIds.push(classroom.id);

    const subject = await prisma.subject.create({
      data: {
        schoolId,
        nameAr: `${testSuffix}-other-subject-ar`,
        nameEn: `${testSuffix}-other-subject`,
        code: `${testSuffix.toUpperCase()}-OTHER`,
        isActive: true,
      },
      select: { id: true },
    });
    createdSubjectIds.push(subject.id);

    const allocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId,
        teacherUserId,
        subjectId: subject.id,
        classroomId: classroom.id,
        termId,
      },
      select: { id: true },
    });
    createdAllocationIds.push(allocation.id);

    const assessment = await prisma.gradeAssessment.create({
      data: {
        schoolId,
        academicYearId,
        termId,
        subjectId: subject.id,
        scopeType: GradeScopeType.CLASSROOM,
        scopeKey: classroom.id,
        classroomId: classroom.id,
        titleEn: `${testSuffix} Other Classroom Quiz`,
        type: GradeAssessmentType.QUIZ,
        deliveryMode: GradeAssessmentDeliveryMode.SCORE_ONLY,
        date: new Date('2026-10-06T00:00:00.000Z'),
        weight: 10,
        maxScore: 10,
        approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
        publishedAt: new Date('2026-09-22T08:00:00.000Z'),
        publishedById: linkedStudentUserId,
        createdById: linkedStudentUserId,
      },
      select: { id: true },
    });
    createdGradeAssessmentIds.push(assessment.id);

    return { subjectId: subject.id, assessmentId: assessment.id };
  }

  async function createTenantBAssessmentFixture(
    teacherUserId: string,
  ): Promise<{
    subjectId: string;
    assessmentId: string;
    behaviorRecordId: string;
    heroMissionId: string;
    taskId: string;
    taskSubmissionId: string;
    conversationId: string;
    announcementId: string;
  }> {
    const organization = await prisma.organization.create({
      data: {
        slug: `${testSuffix}-org-b`,
        name: `${testSuffix} Org B`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `${testSuffix}-school-b`,
        name: `${testSuffix} School B`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);

    const year = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        nameAr: `${testSuffix}-year-b-ar`,
        nameEn: `${testSuffix}-year-b`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    createdYearIds.push(year.id);

    const term = await prisma.term.create({
      data: {
        schoolId: school.id,
        academicYearId: year.id,
        nameAr: `${testSuffix}-term-b-ar`,
        nameEn: `${testSuffix}-term-b`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    createdTermIds.push(term.id);

    const stage = await prisma.stage.create({
      data: {
        schoolId: school.id,
        nameAr: `${testSuffix}-stage-b-ar`,
        nameEn: `${testSuffix}-stage-b`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdStageIds.push(stage.id);

    const grade = await prisma.grade.create({
      data: {
        schoolId: school.id,
        stageId: stage.id,
        nameAr: `${testSuffix}-grade-b-ar`,
        nameEn: `${testSuffix}-grade-b`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdGradeIds.push(grade.id);

    const section = await prisma.section.create({
      data: {
        schoolId: school.id,
        gradeId: grade.id,
        nameAr: `${testSuffix}-section-b-ar`,
        nameEn: `${testSuffix}-section-b`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdSectionIds.push(section.id);

    const classroom = await prisma.classroom.create({
      data: {
        schoolId: school.id,
        sectionId: section.id,
        nameAr: `${testSuffix}-classroom-b-ar`,
        nameEn: `${testSuffix}-classroom-b`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdClassroomIds.push(classroom.id);

    const subject = await prisma.subject.create({
      data: {
        schoolId: school.id,
        nameAr: `${testSuffix}-subject-b-ar`,
        nameEn: `${testSuffix}-subject-b`,
        code: `${testSuffix.toUpperCase()}-B`,
        isActive: true,
      },
      select: { id: true },
    });
    createdSubjectIds.push(subject.id);

    const allocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId: school.id,
        teacherUserId,
        subjectId: subject.id,
        classroomId: classroom.id,
        termId: term.id,
      },
      select: { id: true },
    });
    createdAllocationIds.push(allocation.id);

    const assessment = await prisma.gradeAssessment.create({
      data: {
        schoolId: school.id,
        academicYearId: year.id,
        termId: term.id,
        subjectId: subject.id,
        scopeType: GradeScopeType.CLASSROOM,
        scopeKey: classroom.id,
        classroomId: classroom.id,
        titleEn: `${testSuffix} Tenant B Quiz`,
        type: GradeAssessmentType.QUIZ,
        deliveryMode: GradeAssessmentDeliveryMode.SCORE_ONLY,
        date: new Date('2026-10-07T00:00:00.000Z'),
        weight: 10,
        maxScore: 10,
        approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
        publishedAt: new Date('2026-09-23T08:00:00.000Z'),
        publishedById: linkedStudentUserId,
        createdById: linkedStudentUserId,
      },
      select: { id: true },
    });
    createdGradeAssessmentIds.push(assessment.id);

    const student = await prisma.student.create({
      data: {
        schoolId: school.id,
        organizationId: organization.id,
        firstName: 'Tenant',
        lastName: 'Student',
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdStudentIds.push(student.id);

    const enrollment = await prisma.enrollment.create({
      data: {
        schoolId: school.id,
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

    const behaviorRecord = await prisma.behaviorRecord.create({
      data: {
        schoolId: school.id,
        academicYearId: year.id,
        termId: term.id,
        studentId: student.id,
        enrollmentId: enrollment.id,
        type: BehaviorRecordType.POSITIVE,
        status: BehaviorRecordStatus.APPROVED,
        titleEn: `${testSuffix} Tenant B Behavior`,
        points: 5,
        occurredAt: new Date('2026-10-08T08:00:00.000Z'),
      },
      select: { id: true },
    });
    createdBehaviorRecordIds.push(behaviorRecord.id);

    const heroMission = await prisma.heroMission.create({
      data: {
        schoolId: school.id,
        academicYearId: year.id,
        termId: term.id,
        stageId: stage.id,
        subjectId: subject.id,
        titleEn: `${testSuffix} Tenant B Hero Mission`,
        briefEn: 'Tenant B hidden mission.',
        requiredLevel: 1,
        rewardXp: 10,
        status: HeroMissionStatus.PUBLISHED,
        positionX: 10,
        positionY: 20,
        sortOrder: 1,
        publishedAt: new Date('2026-09-24T08:00:00.000Z'),
        publishedById: linkedStudentUserId,
        createdById: linkedStudentUserId,
      },
      select: { id: true },
    });
    createdHeroMissionIds.push(heroMission.id);

    const task = await prisma.reinforcementTask.create({
      data: {
        schoolId: school.id,
        academicYearId: year.id,
        termId: term.id,
        titleEn: `${testSuffix} Tenant B Task`,
        source: ReinforcementSource.TEACHER,
        status: ReinforcementTaskStatus.NOT_COMPLETED,
        assignedById: teacherUserId,
        createdById: teacherUserId,
      },
      select: { id: true },
    });
    createdTaskIds.push(task.id);

    const stageBTask = await prisma.reinforcementTaskStage.create({
      data: {
        schoolId: school.id,
        taskId: task.id,
        sortOrder: 1,
        titleEn: `${testSuffix} Tenant B Task Stage`,
        proofType: ReinforcementProofType.NONE,
      },
      select: { id: true },
    });
    createdTaskStageIds.push(stageBTask.id);

    const assignment = await prisma.reinforcementAssignment.create({
      data: {
        schoolId: school.id,
        taskId: task.id,
        academicYearId: year.id,
        termId: term.id,
        studentId: student.id,
        enrollmentId: enrollment.id,
        status: ReinforcementTaskStatus.NOT_COMPLETED,
        progress: 0,
      },
      select: { id: true },
    });
    createdAssignmentIds.push(assignment.id);

    const submission = await prisma.reinforcementSubmission.create({
      data: {
        schoolId: school.id,
        assignmentId: assignment.id,
        taskId: task.id,
        stageId: stageBTask.id,
        studentId: student.id,
        enrollmentId: enrollment.id,
        status: ReinforcementSubmissionStatus.PENDING,
      },
      select: { id: true },
    });
    createdTaskSubmissionIds.push(submission.id);

    const conversation = await prisma.communicationConversation.create({
      data: {
        schoolId: school.id,
        type: CommunicationConversationType.DIRECT,
        status: CommunicationConversationStatus.ACTIVE,
        titleEn: `${testSuffix} Tenant B Conversation`,
        createdById: teacherUserId,
      },
      select: { id: true },
    });
    createdConversationIds.push(conversation.id);

    const announcement = await prisma.communicationAnnouncement.create({
      data: {
        schoolId: school.id,
        title: `${testSuffix} Tenant B Announcement`,
        body: 'Hidden tenant announcement.',
        status: CommunicationAnnouncementStatus.PUBLISHED,
        priority: CommunicationAnnouncementPriority.NORMAL,
        audienceType: CommunicationAnnouncementAudienceType.SCHOOL,
        category: 'school',
        publishedAt: new Date('2026-01-10T08:00:00.000Z'),
        createdById: teacherUserId,
        publishedById: teacherUserId,
      },
      select: { id: true },
    });
    createdAnnouncementIds.push(announcement.id);

    return {
      subjectId: subject.id,
      assessmentId: assessment.id,
      behaviorRecordId: behaviorRecord.id,
      heroMissionId: heroMission.id,
      taskId: task.id,
      taskSubmissionId: submission.id,
      conversationId: conversation.id,
      announcementId: announcement.id,
    };
  }

  async function login(email: string): Promise<{ accessToken: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: E2E_PASSWORD })
      .expect(200);

    return { accessToken: response.body.accessToken };
  }

  function listRegisteredStudentRoutes(): string[] {
    const expressApp = app.getHttpAdapter().getInstance() as {
      _router?: { stack?: ExpressLayer[] };
      router?: { stack?: ExpressLayer[] };
    };
    const stack = expressApp._router?.stack ?? expressApp.router?.stack ?? [];
    const routes: string[] = [];

    collectRoutes(stack, routes);

    return routes
      .filter((route) => / \/api\/v1\/student(\/|$)/.test(route))
      .sort();
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

  function assertNoForbiddenStudentAppFields(body: unknown): void {
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      'schoolId',
      'organizationId',
      'scheduleId',
      'guardian',
      'medical',
      'document',
      'internalNote',
      'password',
      'session',
      'token',
      'applicationId',
      'bucket',
      'objectKey',
      'objectPath',
      'storageKey',
      'assetPath',
      'directUrl',
      'signedUrl',
      'fileUrl',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  }

  function assertNoAnswerKeysOrCorrectAnswers(body: unknown): void {
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      'answerKey',
      'correctAnswer',
      'correctAnswers',
      'isCorrect',
      'hidden-option',
      'hidden-question-key',
      'hidden-answer-key',
      'raw-storage-key',
      'raw-object-key',
      'raw-bucket',
      'https://raw-storage.invalid/file',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  }
});
