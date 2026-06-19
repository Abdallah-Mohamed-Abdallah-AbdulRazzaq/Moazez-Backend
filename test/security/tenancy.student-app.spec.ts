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
  HomeworkAssignmentMode,
  HomeworkAssignmentStatus,
  HomeworkTargetMode,
  HomeworkTargetStatus,
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
  TimetableConfigStatus,
  TimetableEntryStatus,
  TimetablePeriodType,
  TimetablePublicationStatus,
  TimetableScopeType,
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

jest.setTimeout(45000);

describe('Student App ownership foundation (security)', () => {
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

describe('Student App Home/Profile routes (security)', () => {
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
  let ownDraftAttendanceEntryId: string;
  let otherStudentBehaviorRecordId: string;
  let tenantBBehaviorRecordId: string;
  let heroMissionId: string;
  let heroObjectiveId: string;
  let heroProgressId: string;
  let otherHeroProgressId: string;
  let heroBadgeId: string;
  let startableHeroMissionId: string;
  let completableHeroMissionId: string;
  let objectiveActionHeroMissionId: string;
  let objectiveActionHeroObjectiveId: string;
  let objectiveActionHeroProgressId: string;
  let otherOnlyHeroMissionId: string;
  let otherOnlyHeroObjectiveId: string;
  let tenantBHeroMissionId: string;
  let ownTaskId: string;
  let ownTaskSubmissionId: string;
  let ownSubmittableTaskId: string;
  let ownSubmittableStageId: string;
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
  let ownScheduleEntryId: string;
  let otherClassroomScheduleEntryId: string;
  let tenantBScheduleEntryId: string;
  let tenantBSubjectId: string;
  let tenantBAssessmentId: string;
  let tenantBLinkedStudentEmail: string;
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
  let gradeId: string;
  let sectionId: string;
  let ownSubjectAllocationId: string;
  let teacherUserId: string;
  let ownRewardId: string;
  let redeemableRewardId: string;
  let insufficientRewardId: string;
  let draftRewardId: string;
  let archivedRewardId: string;
  let outOfStockRewardId: string;
  let ownRewardRedemptionId: string;
  let sameSchoolOtherRewardRedemptionId: string;
  let tenantBRewardId: string;
  let tenantBRewardRedemptionId: string;

  const testSuffix = `student-app-security-${Date.now()}`;
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
  const createdHomeworkAssignmentIds: string[] = [];
  const createdHomeworkSubmissionIds: string[] = [];
  const createdTaskIds: string[] = [];
  const createdTimetablePublicationIds: string[] = [];
  const createdTimetableEntryIds: string[] = [];
  const createdTimetablePeriodIds: string[] = [];
  const createdTimetableConfigIds: string[] = [];
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
    teacherUserId = await createUserWithMembership({
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
    gradeId = academic.gradeId;
    sectionId = academic.sectionId;
    subjectId = academic.subjectId;
    ownSubjectAllocationId = academic.allocationId;

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

    ownScheduleEntryId = await createStudentScheduleFixture({
      schoolId,
      academicYearId,
      termId,
      gradeId,
      sectionId,
      classroomId,
      subjectId,
      teacherUserId,
      allocationId: ownSubjectAllocationId,
      marker: 'own-student-schedule',
      dayOfWeek: 1,
    });

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
    heroObjectiveId = heroFixture.objectiveId;
    heroProgressId = heroFixture.progressId;
    otherHeroProgressId = heroFixture.otherProgressId;
    heroBadgeId = heroFixture.badgeId;
    startableHeroMissionId = heroFixture.startableMissionId;
    completableHeroMissionId = heroFixture.completableMissionId;
    objectiveActionHeroMissionId = heroFixture.objectiveActionMissionId;
    objectiveActionHeroObjectiveId = heroFixture.objectiveActionObjectiveId;
    objectiveActionHeroProgressId = heroFixture.objectiveActionProgressId;
    otherOnlyHeroMissionId = heroFixture.otherOnlyMissionId;
    otherOnlyHeroObjectiveId = heroFixture.otherOnlyObjectiveId;

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
    otherClassroomScheduleEntryId = await createStudentScheduleFixture({
      schoolId,
      academicYearId,
      termId,
      gradeId,
      sectionId,
      classroomId: otherClassroomFixture.classroomId,
      subjectId: otherClassroomFixture.subjectId,
      teacherUserId,
      allocationId: otherClassroomFixture.allocationId,
      marker: 'other-classroom-student-schedule',
      dayOfWeek: 1,
    });

    const tenantBFixture = await createTenantBAssessmentFixture({
      teacherUserId,
      studentRoleId: studentRole.id,
    });
    tenantBSubjectId = tenantBFixture.subjectId;
    tenantBAssessmentId = tenantBFixture.assessmentId;
    tenantBLinkedStudentEmail = tenantBFixture.studentEmail;
    tenantBScheduleEntryId = tenantBFixture.scheduleEntryId;
    tenantBBehaviorRecordId = tenantBFixture.behaviorRecordId;
    tenantBHeroMissionId = tenantBFixture.heroMissionId;
    tenantBTaskId = tenantBFixture.taskId;
    tenantBTaskSubmissionId = tenantBFixture.taskSubmissionId;
    tenantBRewardId = tenantBFixture.rewardId;
    tenantBRewardRedemptionId = tenantBFixture.rewardRedemptionId;

    const taskFixture = await createStudentTaskFixture({
      teacherUserId,
      otherStudentId: sameSchoolOtherStudentId,
      otherEnrollmentId: sameSchoolOtherEnrollmentId,
      otherStudentUserId: sameSchoolOtherStudentUserId,
    });
    ownTaskId = taskFixture.taskId;
    ownTaskSubmissionId = taskFixture.submissionId;
    ownSubmittableTaskId = taskFixture.submittableTaskId;
    ownSubmittableStageId = taskFixture.submittableStageId;
    sameSchoolOtherTaskId = taskFixture.otherTaskId;
    sameSchoolOtherTaskSubmissionId = taskFixture.otherSubmissionId;

    const communicationFixture = await createStudentCommunicationFixture({
      teacherUserId,
      otherStudentUserId: sameSchoolOtherStudentUserId,
      tenantBConversationId: tenantBFixture.conversationId,
      tenantBAnnouncementId: tenantBFixture.announcementId,
    });
    ownConversationId = communicationFixture.conversationId;
    sameSchoolOtherConversationId = communicationFixture.otherConversationId;
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

    const rewardFixture = await createStudentRewardFixture({
      otherStudentId: sameSchoolOtherStudentId,
      otherEnrollmentId: sameSchoolOtherEnrollmentId,
    });
    ownRewardId = rewardFixture.ownRewardId;
    redeemableRewardId = rewardFixture.redeemableRewardId;
    insufficientRewardId = rewardFixture.insufficientRewardId;
    draftRewardId = rewardFixture.draftRewardId;
    archivedRewardId = rewardFixture.archivedRewardId;
    outOfStockRewardId = rewardFixture.outOfStockRewardId;
    ownRewardRedemptionId = rewardFixture.ownRedemptionId;
    sameSchoolOtherRewardRedemptionId =
      rewardFixture.sameSchoolOtherRedemptionId;

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
      await prisma.heroJourneyEvent.deleteMany({
        where: {
          OR: [
            { missionId: { in: createdHeroMissionIds } },
            { missionProgressId: { in: createdHeroMissionProgressIds } },
          ],
        },
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
      await prisma.homeworkSubmission.deleteMany({
        where: {
          OR: [
            { id: { in: createdHomeworkSubmissionIds } },
            { homeworkAssignmentId: { in: createdHomeworkAssignmentIds } },
          ],
        },
      });
      await prisma.homeworkTarget.deleteMany({
        where: { homeworkAssignmentId: { in: createdHomeworkAssignmentIds } },
      });
      await prisma.homeworkAssignment.deleteMany({
        where: { id: { in: createdHomeworkAssignmentIds } },
      });
      await prisma.timetablePublication.deleteMany({
        where: { id: { in: createdTimetablePublicationIds } },
      });
      await prisma.timetableEntry.deleteMany({
        where: { id: { in: createdTimetableEntryIds } },
      });
      await prisma.timetablePeriod.deleteMany({
        where: { id: { in: createdTimetablePeriodIds } },
      });
      await prisma.timetableConfig.deleteMany({
        where: { id: { in: createdTimetableConfigIds } },
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
      pendingTasksCount: 2,
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

  it('allows a linked student to read own daily and weekly schedule only', async () => {
    const { accessToken } = await login(linkedStudentEmail);

    const daily = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/schedule`)
      .query({ date: '2026-09-14' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(daily.body).toMatchObject({
      date: '2026-09-14',
      dayOfWeek: 1,
      items: [
        expect.objectContaining({
          scheduleId: `timetable-entry:${ownScheduleEntryId}:2026-09-14`,
          timetableEntryId: ownScheduleEntryId,
          status: 'scheduled',
          needsAttendance: true,
          hasHomework: null,
          isExam: null,
          isBreak: false,
        }),
      ],
    });
    expect(JSON.stringify(daily.body)).not.toContain(
      otherClassroomScheduleEntryId,
    );
    expect(JSON.stringify(daily.body)).not.toContain(tenantBScheduleEntryId);
    expectSafeStudentSchedulePayload(daily.body);

    const weekly = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/schedule/week`)
      .query({ date: '2026-09-16' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(weekly.body.weekStartDate).toBe('2026-09-14');
    expect(weekly.body.weekEndDate).toBe('2026-09-20');
    expect(weekly.body.days).toHaveLength(7);
    expect(
      weekly.body.days.find(
        (day: { date: string }) => day.date === '2026-09-14',
      ),
    ).toMatchObject({
      date: '2026-09-14',
      dayOfWeek: 1,
      items: [
        expect.objectContaining({
          scheduleId: `timetable-entry:${ownScheduleEntryId}:2026-09-14`,
          timetableEntryId: ownScheduleEntryId,
        }),
      ],
    });
    expect(JSON.stringify(weekly.body)).not.toContain(
      otherClassroomScheduleEntryId,
    );
    expect(JSON.stringify(weekly.body)).not.toContain(tenantBScheduleEntryId);
    expectSafeStudentSchedulePayload(weekly.body);
  });

  it('student schedule returns empty outside the published term without leaking entries', async () => {
    const { accessToken } = await login(linkedStudentEmail);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/schedule`)
      .query({ date: '2027-01-04' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body).toEqual({
      date: '2027-01-04',
      dayOfWeek: 1,
      items: [],
    });
    const json = JSON.stringify(response.body);
    expect(json).not.toContain(ownScheduleEntryId);
    expect(json).not.toContain(otherClassroomScheduleEntryId);
    expect(json).not.toContain(tenantBScheduleEntryId);
    expectSafeStudentSchedulePayload(response.body);
  });

  it('student from another school cannot see this school schedule entries', async () => {
    const { accessToken } = await login(tenantBLinkedStudentEmail);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/schedule`)
      .query({ date: '2026-09-14' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const json = JSON.stringify(response.body);
    expect(json).toContain(tenantBScheduleEntryId);
    expect(json).not.toContain(ownScheduleEntryId);
    expect(json).not.toContain(otherClassroomScheduleEntryId);
    expectSafeStudentSchedulePayload(response.body);
  });

  it('keeps student actors out of teacher and parent schedule routes', async () => {
    const { accessToken } = await login(linkedStudentEmail);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/schedule`)
      .query({ date: '2026-09-14' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children/${linkedStudentId}/schedule/today`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${linkedStudentId}/schedule/weekly`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
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
      percentage: 40,
      assessmentCount: 2,
      enteredCount: 1,
      missingCount: 1,
      absentCount: 0,
      rating: 'needs_support',
    });
    expect(gradeSummary.body.selectedAcademicYear).toMatchObject({
      id: academicYearId,
    });
    expect(gradeSummary.body.selectedTerm).toMatchObject({ id: termId });
    expect(gradeSummary.body.subjects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subjectId,
          totalEarned: 8,
          totalMax: 20,
          percentage: 40,
          assessmentCount: 2,
          enteredCount: 1,
          missingCount: 1,
          absentCount: 0,
          rating: 'needs_support',
        }),
      ]),
    );
    assertNoForbiddenStudentAppFields(gradeSummary.body);
    assertNoAnswerKeysOrCorrectAnswers(gradeSummary.body);

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
      gradeItem: {
        score: 8,
        maxScore: 10,
        isVirtualMissing: false,
      },
      submission: {
        submissionId: ownSubmissionId,
        status: 'submitted',
        answers: [
          expect.objectContaining({
            answerText: 'A',
            awardedPoints: 8,
            maxPoints: 10,
            selectedOptions: expect.arrayContaining([
              expect.objectContaining({
                label: 'Correct visible label',
              }),
            ]),
          }),
        ],
      },
      questions: [
        expect.objectContaining({
          type: 'multiple_choice',
          title: 'Choose the visible answer.',
          points: 10,
          options: expect.arrayContaining([
            expect.objectContaining({
              label: 'Correct visible label',
              text: 'Correct visible label',
              value: 'A',
            }),
          ]),
        }),
      ],
    });
    assertNoForbiddenStudentAppFields(assessmentGrade.body);
    assertNoAnswerKeysOrCorrectAnswers(assessmentGrade.body);
    expect(JSON.stringify(assessmentGrade.body)).not.toContain(
      'OTHER_STUDENT_HIDDEN_ANSWER',
    );
    expect(JSON.stringify(assessmentGrade.body)).not.toContain(
      'OTHER_STUDENT_HIDDEN_JSON',
    );

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
    expect(JSON.stringify(behavior.body)).not.toContain('attendance:');
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

    const discipline = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/discipline`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(discipline.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: 'attendance',
          itemType: 'absence',
          status: 'submitted',
          pointsDelta: 0,
        }),
        expect.objectContaining({
          sourceType: 'attendance',
          itemType: 'lateness',
          status: 'submitted',
          attendance: expect.objectContaining({
            status: 'late',
          }),
        }),
        expect.objectContaining({
          id: `behavior:${ownPositiveBehaviorRecordId}`,
          sourceType: 'behavior',
          itemType: 'positive',
          status: 'approved',
          pointsDelta: 5,
        }),
        expect.objectContaining({
          id: `behavior:${ownNegativeBehaviorRecordId}`,
          sourceType: 'behavior',
          itemType: 'negative',
          status: 'approved',
          pointsDelta: -2,
        }),
      ]),
    );
    expect(discipline.body.summary).toMatchObject({
      attendanceIncidentCount: 2,
      absenceCount: 1,
      lateCount: 1,
      earlyLeaveCount: 0,
      excusedCount: 0,
      positiveCount: 1,
      negativeCount: 1,
      behaviorPoints: 3,
      totalIncidents: 4,
    });
    expect(JSON.stringify(discipline.body)).not.toContain(
      ownDraftBehaviorRecordId,
    );
    expect(JSON.stringify(discipline.body)).not.toContain(
      ownDraftAttendanceEntryId,
    );
    expect(JSON.stringify(discipline.body)).not.toContain(
      otherStudentBehaviorRecordId,
    );
    expect(JSON.stringify(discipline.body)).not.toContain(
      tenantBBehaviorRecordId,
    );
    expect(JSON.stringify(discipline.body)).not.toContain('reviewedById');
    expect(JSON.stringify(discipline.body)).not.toContain('submittedById');
    expect(JSON.stringify(discipline.body)).not.toContain('markedById');
    assertNoForbiddenStudentAppFields(discipline.body);

    const disciplineSummary = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/discipline/summary`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(disciplineSummary.body.summary).toMatchObject({
      attendanceIncidentCount: 2,
      positiveCount: 1,
      negativeCount: 1,
      behaviorPoints: 3,
      totalIncidents: 4,
    });
    expect(disciplineSummary.body.summary).not.toHaveProperty(
      'disciplineScore',
    );
    expect(disciplineSummary.body.summary).not.toHaveProperty(
      'disciplinePercentage',
    );
    assertNoForbiddenStudentAppFields(disciplineSummary.body);

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
        requested: 2,
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
      total: 5,
      notStarted: 2,
      inProgress: 2,
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

  it('allows linked student to mutate own hero missions through core only', async () => {
    const { accessToken } = await login(linkedStudentEmail);
    const beforeCounts = {
      xpLedger: await prisma.xpLedger.count(),
      behaviorPointLedger: await prisma.behaviorPointLedger.count(),
      rewardRedemption: await prisma.rewardRedemption.count(),
      heroStudentBadge: await prisma.heroStudentBadge.count(),
    };

    const startResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/hero/missions/${startableHeroMissionId}/start`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(200);

    expect(startResponse.body).toMatchObject({
      missionId: startableHeroMissionId,
      progressStatus: 'in_progress',
      progress: {
        progressId: expect.any(String),
        progressPercent: 0,
        completedAt: null,
      },
    });
    assertNoForbiddenStudentAppFields(startResponse.body);
    createdHeroMissionProgressIds.push(startResponse.body.progress.progressId);

    const duplicateStart = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/hero/missions/${startableHeroMissionId}/start`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(200);

    expect(duplicateStart.body.progress.progressId).toBe(
      startResponse.body.progress.progressId,
    );
    expect(
      await prisma.heroMissionProgress.count({
        where: {
          missionId: startableHeroMissionId,
          studentId: linkedStudentId,
        },
      }),
    ).toBe(1);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/hero/missions/${startableHeroMissionId}/start`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        studentId: '11111111-1111-4111-8111-111111111111',
        progressId: startResponse.body.progress.progressId,
        status: 'completed',
        xpAmount: 999,
        rewardId: '22222222-2222-4222-8222-222222222222',
      })
      .expect(400);

    const objectiveResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/student/hero/missions/${objectiveActionHeroMissionId}/objectives/${objectiveActionHeroObjectiveId}/complete`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(200);

    expect(objectiveResponse.body).toMatchObject({
      missionId: objectiveActionHeroMissionId,
      progressStatus: 'in_progress',
      progress: {
        progressId: objectiveActionHeroProgressId,
        progressPercent: 100,
      },
    });
    expect(objectiveResponse.body.objectives).toEqual([
      expect.objectContaining({
        id: objectiveActionHeroObjectiveId,
        isCompleted: true,
      }),
    ]);
    assertNoForbiddenStudentAppFields(objectiveResponse.body);
    const objectiveProgress =
      await prisma.heroMissionObjectiveProgress.findFirst({
        where: {
          missionProgressId: objectiveActionHeroProgressId,
          objectiveId: objectiveActionHeroObjectiveId,
        },
        select: { id: true },
      });
    expect(objectiveProgress).not.toBeNull();
    if (objectiveProgress) {
      createdHeroMissionObjectiveProgressIds.push(objectiveProgress.id);
    }

    const completeResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/student/hero/missions/${completableHeroMissionId}/complete`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(200);

    expect(completeResponse.body).toMatchObject({
      missionId: completableHeroMissionId,
      progressStatus: 'completed',
      progress: {
        progressPercent: 100,
      },
    });
    assertNoForbiddenStudentAppFields(completeResponse.body);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/student/hero/missions/${completableHeroMissionId}/complete`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(409);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/hero/missions/${tenantBHeroMissionId}/start`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(404);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/student/hero/missions/${tenantBHeroMissionId}/complete`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(404);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/student/hero/missions/${otherOnlyHeroMissionId}/complete`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(404);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/student/hero/missions/${otherOnlyHeroMissionId}/objectives/${otherOnlyHeroObjectiveId}/complete`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(404);

    expect(await prisma.xpLedger.count()).toBe(beforeCounts.xpLedger);
    expect(await prisma.behaviorPointLedger.count()).toBe(
      beforeCounts.behaviorPointLedger,
    );
    expect(await prisma.rewardRedemption.count()).toBe(
      beforeCounts.rewardRedemption,
    );
    expect(await prisma.heroStudentBadge.count()).toBe(
      beforeCounts.heroStudentBadge,
    );
  });

  it('allows linked student to list and redeem app-safe rewards only', async () => {
    const { accessToken } = await login(linkedStudentEmail);

    const rewards = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/rewards`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(rewards.body.xp).toEqual({ totalEarnedXp: 25 });
    expect(rewards.body.rewards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rewardId: ownRewardId,
          isRedeemable: true,
          insufficientXp: false,
        }),
        expect.objectContaining({
          rewardId: redeemableRewardId,
          isRedeemable: true,
          insufficientXp: false,
        }),
        expect.objectContaining({
          rewardId: insufficientRewardId,
          isRedeemable: false,
          insufficientXp: true,
          availabilityStatus: 'insufficient_xp',
        }),
      ]),
    );
    expect(JSON.stringify(rewards.body)).not.toContain(draftRewardId);
    expect(JSON.stringify(rewards.body)).not.toContain(archivedRewardId);
    expect(JSON.stringify(rewards.body)).not.toContain(outOfStockRewardId);
    expect(JSON.stringify(rewards.body)).not.toContain(tenantBRewardId);
    assertNoForbiddenStudentRewardsFields(rewards.body);

    const rewardDetail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/rewards/${ownRewardId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(rewardDetail.body.reward).toMatchObject({
      rewardId: ownRewardId,
      type: 'privilege',
      requiredXp: 10,
    });
    assertNoForbiddenStudentRewardsFields(rewardDetail.body);

    for (const rewardId of [
      draftRewardId,
      archivedRewardId,
      outOfStockRewardId,
      tenantBRewardId,
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/student/rewards/${rewardId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    }

    const redemptions = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/rewards/redemptions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(redemptions.body.redemptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          redemptionId: ownRewardRedemptionId,
          status: 'requested',
          requestSource: 'student_app',
        }),
      ]),
    );
    expect(JSON.stringify(redemptions.body)).not.toContain(
      sameSchoolOtherRewardRedemptionId,
    );
    expect(JSON.stringify(redemptions.body)).not.toContain(
      tenantBRewardRedemptionId,
    );
    assertNoForbiddenStudentRewardsFields(redemptions.body);

    const ownRedemption = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/rewards/redemptions/${ownRewardRedemptionId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(ownRedemption.body.redemption).toMatchObject({
      redemptionId: ownRewardRedemptionId,
      reward: expect.objectContaining({ rewardId: ownRewardId }),
      status: 'requested',
    });
    assertNoForbiddenStudentRewardsFields(ownRedemption.body);

    for (const redemptionId of [
      sameSchoolOtherRewardRedemptionId,
      tenantBRewardRedemptionId,
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/student/rewards/redemptions/${redemptionId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    }

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/rewards/${redeemableRewardId}/redeem`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        studentId: linkedStudentId,
        enrollmentId: linkedEnrollmentId,
        status: 'approved',
        costXp: 1,
        xpBalance: 999,
        approvedById: linkedStudentUserId,
      })
      .expect(400);

    const beforeCounts = {
      xpLedger: await prisma.xpLedger.count(),
      behaviorPointLedger: await prisma.behaviorPointLedger.count(),
      rewardRedemption: await prisma.rewardRedemption.count(),
      heroMissionProgress: await prisma.heroMissionProgress.count(),
      heroStudentBadge: await prisma.heroStudentBadge.count(),
    };

    const redeemed = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/rewards/${redeemableRewardId}/redeem`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ note: '  Student reward request  ' })
      .expect(200);

    expect(redeemed.body.redemption).toMatchObject({
      redemptionId: expect.any(String),
      reward: expect.objectContaining({ rewardId: redeemableRewardId }),
      status: 'requested',
      requestSource: 'student_app',
      note: 'Student reward request',
      nextAction: 'await_review',
    });
    assertNoForbiddenStudentRewardsFields(redeemed.body);
    createdRewardRedemptionIds.push(redeemed.body.redemption.redemptionId);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/rewards/${redeemableRewardId}/redeem`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(409);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/rewards/${insufficientRewardId}/redeem`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(422);

    for (const rewardId of [
      draftRewardId,
      archivedRewardId,
      outOfStockRewardId,
      tenantBRewardId,
    ]) {
      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/student/rewards/${rewardId}/redeem`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(404);
    }

    expect(await prisma.xpLedger.count()).toBe(beforeCounts.xpLedger);
    expect(await prisma.behaviorPointLedger.count()).toBe(
      beforeCounts.behaviorPointLedger,
    );
    expect(await prisma.rewardRedemption.count()).toBe(
      beforeCounts.rewardRedemption + 1,
    );
    expect(await prisma.heroMissionProgress.count()).toBe(
      beforeCounts.heroMissionProgress,
    );
    expect(await prisma.heroStudentBadge.count()).toBe(
      beforeCounts.heroStudentBadge,
    );
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

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/student/tasks/${ownSubmittableTaskId}/stages/${ownSubmittableStageId}/submit`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        proofText: 'Student proof',
        studentId: linkedStudentId,
      })
      .expect(400);

    const [xpBefore, behaviorBefore, redemptionBefore] = await Promise.all([
      prisma.xpLedger.count({ where: { studentId: linkedStudentId } }),
      prisma.behaviorPointLedger.count({
        where: { studentId: linkedStudentId },
      }),
      prisma.rewardRedemption.count({ where: { studentId: linkedStudentId } }),
    ]);

    const submitted = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/student/tasks/${ownSubmittableTaskId}/stages/${ownSubmittableStageId}/submit`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ proofText: '  Student text proof  ' })
      .expect(200);

    expect(submitted.body.submission).toMatchObject({
      status: 'submitted',
      proofText: 'Student text proof',
      proofFile: null,
    });
    assertNoForbiddenStudentAppFields(submitted.body);
    createdTaskSubmissionIds.push(submitted.body.submission.submissionId);

    await expect(
      prisma.reinforcementSubmission.findFirstOrThrow({
        where: {
          id: submitted.body.submission.submissionId,
          taskId: ownSubmittableTaskId,
          stageId: ownSubmittableStageId,
          studentId: linkedStudentId,
          enrollmentId: linkedEnrollmentId,
          submittedById: linkedStudentUserId,
        },
        select: { proofText: true },
      }),
    ).resolves.toEqual({ proofText: 'Student text proof' });

    await expect(
      Promise.all([
        prisma.xpLedger.count({ where: { studentId: linkedStudentId } }),
        prisma.behaviorPointLedger.count({
          where: { studentId: linkedStudentId },
        }),
        prisma.rewardRedemption.count({
          where: { studentId: linkedStudentId },
        }),
      ]),
    ).resolves.toEqual([xpBefore, behaviorBefore, redemptionBefore]);

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

    for (const taskId of [sameSchoolOtherTaskId, tenantBTaskId]) {
      await request(app.getHttpServer())
        .post(
          `${GLOBAL_PREFIX}/student/tasks/${taskId}/stages/${ownSubmittableStageId}/submit`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ proofText: 'blocked' })
        .expect(404);
    }
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
      .get(
        `${GLOBAL_PREFIX}/student/messages/conversations/${ownConversationId}`,
      )
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
      .get(
        `${GLOBAL_PREFIX}/student/messages/conversations/${ownConversationId}`,
      )
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

    for (const assessmentId of [
      otherClassroomAssessmentId,
      tenantBAssessmentId,
    ]) {
      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/student/exams/${assessmentId}/start`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(404);

      await request(app.getHttpServer())
        .put(
          `${GLOBAL_PREFIX}/student/exams/${assessmentId}/submission/answers`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          answers: [
            {
              questionId: '11111111-1111-4111-8111-111111111111',
              selectedOptionIds: [],
            },
          ],
        })
        .expect(404);

      await request(app.getHttpServer())
        .patch(
          `${GLOBAL_PREFIX}/student/exams/${assessmentId}/submission/answers/11111111-1111-4111-8111-111111111111`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ selectedOptionIds: [] })
        .expect(404);

      await request(app.getHttpServer())
        .post(
          `${GLOBAL_PREFIX}/student/exams/${assessmentId}/submission/submit`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
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
        'schedule?date=2026-09-14',
        'schedule/week?date=2026-09-14',
        'grades',
        'grades/summary',
        `grades/assessments/${ownAssessmentId}`,
        'exams',
        `exams/${ownAssessmentId}`,
        `exams/${ownAssessmentId}/submission`,
        'behavior',
        'behavior/summary',
        `behavior/${ownPositiveBehaviorRecordId}`,
        'discipline',
        'discipline/summary',
        'progress',
        'progress/academic',
        'progress/behavior',
        'progress/xp',
        'rewards',
        `rewards/${ownRewardId}`,
        'rewards/redemptions',
        `rewards/redemptions/${ownRewardRedemptionId}`,
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
        `exams/${ownNoSubmissionAssessmentId}/start`,
        `exams/${ownNoSubmissionAssessmentId}/submission/submit`,
      ]) {
        await request(app.getHttpServer())
          .post(`${GLOBAL_PREFIX}/student/${path}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ body: 'blocked' })
          .expect(403);
      }

      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/student/rewards/${redeemableRewardId}/redeem`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(403);

      for (const path of [
        `hero/missions/${startableHeroMissionId}/start`,
        `hero/missions/${completableHeroMissionId}/complete`,
        `hero/missions/${objectiveActionHeroMissionId}/objectives/${objectiveActionHeroObjectiveId}/complete`,
      ]) {
        await request(app.getHttpServer())
          .post(`${GLOBAL_PREFIX}/student/${path}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({})
          .expect(403);
      }

      await request(app.getHttpServer())
        .post(
          `${GLOBAL_PREFIX}/student/tasks/${ownSubmittableTaskId}/stages/${ownSubmittableStageId}/submit`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ proofText: 'blocked' })
        .expect(403);

      await request(app.getHttpServer())
        .put(
          `${GLOBAL_PREFIX}/student/exams/${ownNoSubmissionAssessmentId}/submission/answers`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          answers: [
            {
              questionId: '11111111-1111-4111-8111-111111111111',
              selectedOptionIds: [],
            },
          ],
        })
        .expect(403);

      await request(app.getHttpServer())
        .patch(
          `${GLOBAL_PREFIX}/student/exams/${ownNoSubmissionAssessmentId}/submission/answers/11111111-1111-4111-8111-111111111111`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ selectedOptionIds: [] })
        .expect(403);
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

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/discipline`)
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

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/discipline/summary`)
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
        'discipline',
        'discipline/summary',
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
        'schedule',
        'schedule/week',
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
      `hero/badges/${heroBadgeId}/award`,
      'hero/rewards/redeem',
      'rewards/redemptions',
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

  it('allows a linked student to save and submit own homework text only', async () => {
    const { accessToken } = await login(linkedStudentEmail);
    const homeworkId = await createStudentHomeworkFixture();

    const draft = await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/student/homeworks/${homeworkId}/submission`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ bodyText: 'Student App draft' })
      .expect(200);

    createdHomeworkSubmissionIds.push(draft.body.submission.id);
    expect(draft.body.submission).toMatchObject({
      homeworkId,
      status: 'draft',
      bodyText: 'Student App draft',
      submittedAt: null,
    });
    assertNoForbiddenStudentAppFields(draft.body);

    const currentSubmission = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/homeworks/${homeworkId}/submission`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(currentSubmission.body.submission).toMatchObject({
      id: draft.body.submission.id,
      status: 'draft',
      bodyText: 'Student App draft',
    });
    assertNoForbiddenStudentAppFields(currentSubmission.body);

    const submitted = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/student/homeworks/${homeworkId}/submit`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(200);

    expect(submitted.body.submission).toMatchObject({
      id: draft.body.submission.id,
      status: 'submitted',
      bodyText: 'Student App draft',
    });
    expect(submitted.body.submission.submittedAt).toEqual(expect.any(String));
    assertNoForbiddenStudentAppFields(submitted.body);

    const detail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/homeworks/${homeworkId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(detail.body.homework).toMatchObject({
      homeworkId,
      status: 'completed',
      targetStatus: 'submitted',
      submission: expect.objectContaining({
        status: 'submitted',
        bodyText: 'Student App draft',
      }),
      questions: [],
      attachments: [],
    });
    assertNoForbiddenStudentAppFields(detail.body);
  });

  it('does not expose out-of-scope Student App routes', async () => {
    const { accessToken } = await login(linkedStudentEmail);

    for (const path of [
      'homework',
      `homeworks/${ownTaskId}/submission/resolve`,
      `homeworks/${ownTaskId}/submission/submit`,
      `homeworks/${ownTaskId}/submission/history`,
      `homeworks/${ownTaskId}/questions`,
      `homeworks/${ownTaskId}/attachments`,
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

  async function createStudentHomeworkFixture(): Promise<string> {
    const homework = await prisma.homeworkAssignment.create({
      data: {
        schoolId,
        academicYearId,
        termId,
        classroomId,
        subjectId,
        teacherUserId,
        teacherSubjectAllocationId: ownSubjectAllocationId,
        title: `${testSuffix} Student App Homework`,
        description: 'Student App homework submission fixture',
        mode: HomeworkAssignmentMode.HOMEWORK,
        status: HomeworkAssignmentStatus.PUBLISHED,
        targetMode: HomeworkTargetMode.SELECTED_STUDENTS,
        publishedAt: new Date('2026-09-10T08:00:00.000Z'),
        dueAt: new Date('2027-03-15T10:00:00.000Z'),
        createdByUserId: teacherUserId,
        publishedByUserId: teacherUserId,
      },
      select: { id: true },
    });
    createdHomeworkAssignmentIds.push(homework.id);

    await prisma.homeworkTarget.create({
      data: {
        schoolId,
        homeworkAssignmentId: homework.id,
        studentId: linkedStudentId,
        enrollmentId: linkedEnrollmentId,
        status: HomeworkTargetStatus.ASSIGNED,
      },
    });

    return homework.id;
  }

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
    return createUserWithScopedMembership({
      ...params,
      organizationId,
      schoolId,
    });
  }

  async function createUserWithScopedMembership(params: {
    email: string;
    userType: UserType;
    roleId: string;
    organizationId: string;
    schoolId: string;
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
        organizationId: params.organizationId,
        schoolId: params.schoolId,
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
    gradeId: string;
    classroomId: string;
    sectionId: string;
    subjectId: string;
    allocationId: string;
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
      gradeId: grade.id,
      classroomId: classroom.id,
      sectionId: section.id,
      subjectId: subject.id,
      allocationId: allocation.id,
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
    submittableTaskId: string;
    submittableStageId: string;
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

    const submittableTask = await prisma.reinforcementTask.create({
      data: {
        schoolId,
        academicYearId,
        termId,
        subjectId,
        titleEn: `${testSuffix} Student Submittable Task`,
        descriptionEn: 'Student app submission mutation task.',
        source: ReinforcementSource.TEACHER,
        status: ReinforcementTaskStatus.NOT_COMPLETED,
        dueDate: new Date('2026-10-20T08:00:00.000Z'),
        assignedById: params.teacherUserId,
        assignedByName: 'StudentApp Teacher',
        createdById: params.teacherUserId,
      },
      select: { id: true },
    });
    createdTaskIds.push(submittableTask.id);

    const submittableStage = await prisma.reinforcementTaskStage.create({
      data: {
        schoolId,
        taskId: submittableTask.id,
        sortOrder: 1,
        titleEn: `${testSuffix} Text proof stage`,
        proofType: ReinforcementProofType.NONE,
        requiresApproval: true,
      },
      select: { id: true },
    });
    createdTaskStageIds.push(submittableStage.id);

    const submittableAssignment = await prisma.reinforcementAssignment.create({
      data: {
        schoolId,
        taskId: submittableTask.id,
        academicYearId,
        termId,
        studentId: linkedStudentId,
        enrollmentId: linkedEnrollmentId,
        status: ReinforcementTaskStatus.NOT_COMPLETED,
        progress: 0,
      },
      select: { id: true },
    });
    createdAssignmentIds.push(submittableAssignment.id);

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
      submittableTaskId: submittableTask.id,
      submittableStageId: submittableStage.id,
      otherTaskId: otherTask.id,
      otherSubmissionId: otherSubmission.id,
    };
  }

  async function createStudentRewardFixture(params: {
    otherStudentId: string;
    otherEnrollmentId: string;
  }): Promise<{
    ownRewardId: string;
    redeemableRewardId: string;
    insufficientRewardId: string;
    draftRewardId: string;
    archivedRewardId: string;
    outOfStockRewardId: string;
    ownRedemptionId: string;
    sameSchoolOtherRedemptionId: string;
  }> {
    async function createReward(input: {
      suffix: string;
      status: RewardCatalogItemStatus;
      minTotalXp?: number;
      isUnlimited?: boolean;
      stockQuantity?: number | null;
      stockRemaining?: number | null;
    }): Promise<string> {
      const reward = await prisma.rewardCatalogItem.create({
        data: {
          schoolId,
          academicYearId,
          termId,
          titleEn: `${testSuffix} ${input.suffix} Reward`,
          descriptionEn: `${input.suffix} reward description.`,
          type: RewardCatalogItemType.PRIVILEGE,
          status: input.status,
          minTotalXp: input.minTotalXp ?? null,
          isUnlimited: input.isUnlimited ?? true,
          stockQuantity: input.stockQuantity ?? null,
          stockRemaining: input.stockRemaining ?? null,
          publishedAt:
            input.status === RewardCatalogItemStatus.PUBLISHED
              ? new Date('2026-09-25T08:00:00.000Z')
              : null,
          publishedById:
            input.status === RewardCatalogItemStatus.PUBLISHED
              ? linkedStudentUserId
              : null,
          archivedAt:
            input.status === RewardCatalogItemStatus.ARCHIVED
              ? new Date('2026-09-26T08:00:00.000Z')
              : null,
          archivedById:
            input.status === RewardCatalogItemStatus.ARCHIVED
              ? linkedStudentUserId
              : null,
          createdById: linkedStudentUserId,
          metadata: {
            internalPolicy: 'hidden',
            wallet: 'not-v1',
            payment: 'not-v1',
          },
        },
        select: { id: true },
      });
      createdRewardCatalogItemIds.push(reward.id);
      return reward.id;
    }

    const ownRewardId = await createReward({
      suffix: 'Own',
      status: RewardCatalogItemStatus.PUBLISHED,
      minTotalXp: 10,
    });
    const redeemableRewardId = await createReward({
      suffix: 'Redeemable',
      status: RewardCatalogItemStatus.PUBLISHED,
      minTotalXp: 10,
    });
    const insufficientRewardId = await createReward({
      suffix: 'Insufficient XP',
      status: RewardCatalogItemStatus.PUBLISHED,
      minTotalXp: 9999,
    });
    const draftRewardId = await createReward({
      suffix: 'Draft',
      status: RewardCatalogItemStatus.DRAFT,
      minTotalXp: 1,
    });
    const archivedRewardId = await createReward({
      suffix: 'Archived',
      status: RewardCatalogItemStatus.ARCHIVED,
      minTotalXp: 1,
    });
    const outOfStockRewardId = await createReward({
      suffix: 'Out Of Stock',
      status: RewardCatalogItemStatus.PUBLISHED,
      minTotalXp: 1,
      isUnlimited: false,
      stockQuantity: 1,
      stockRemaining: 0,
    });

    const ownRedemption = await prisma.rewardRedemption.create({
      data: {
        schoolId,
        catalogItemId: ownRewardId,
        studentId: linkedStudentId,
        enrollmentId: linkedEnrollmentId,
        academicYearId,
        termId,
        status: RewardRedemptionStatus.REQUESTED,
        requestSource: RewardRedemptionRequestSource.STUDENT_APP,
        requestedById: linkedStudentUserId,
        requestNoteEn: 'Visible student request note',
        eligibilitySnapshot: {
          totalEarnedXp: 25,
          internalPolicy: 'hidden',
        },
        metadata: { rewardLedgerInternal: 'hidden' },
      },
      select: { id: true },
    });
    createdRewardRedemptionIds.push(ownRedemption.id);

    const sameSchoolOtherRedemption = await prisma.rewardRedemption.create({
      data: {
        schoolId,
        catalogItemId: ownRewardId,
        studentId: params.otherStudentId,
        enrollmentId: params.otherEnrollmentId,
        academicYearId,
        termId,
        status: RewardRedemptionStatus.REQUESTED,
        requestSource: RewardRedemptionRequestSource.STUDENT_APP,
        requestedById: sameSchoolOtherStudentUserId,
      },
      select: { id: true },
    });
    createdRewardRedemptionIds.push(sameSchoolOtherRedemption.id);

    return {
      ownRewardId,
      redeemableRewardId,
      insufficientRewardId,
      draftRewardId,
      archivedRewardId,
      outOfStockRewardId,
      ownRedemptionId: ownRedemption.id,
      sameSchoolOtherRedemptionId: sameSchoolOtherRedemption.id,
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
    const outOfAudience = await prisma.communicationAnnouncementAudience.create(
      {
        data: {
          schoolId,
          announcementId: outOfAudienceAnnouncement.id,
          audienceType: CommunicationAnnouncementAudienceType.CUSTOM,
          studentId: sameSchoolOtherStudentId,
          userId: params.otherStudentUserId,
        },
        select: { id: true },
      },
    );
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

    const attachment = await prisma.communicationAnnouncementAttachment.create({
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

    const draftSession = await prisma.attendanceSession.create({
      data: {
        schoolId,
        academicYearId,
        termId,
        date: new Date('2026-10-04T00:00:00.000Z'),
        scopeType: AttendanceScopeType.CLASSROOM,
        scopeKey: classroomId,
        classroomId,
        mode: AttendanceMode.DAILY,
        periodKey: 'daily-draft-hidden',
        status: AttendanceSessionStatus.DRAFT,
      },
      select: { id: true },
    });
    createdAttendanceSessionIds.push(draftSession.id);

    const draftEntry = await prisma.attendanceEntry.create({
      data: {
        schoolId,
        sessionId: draftSession.id,
        studentId: linkedStudentId,
        enrollmentId: linkedEnrollmentId,
        status: AttendanceStatus.ABSENT,
        markedAt: new Date('2026-10-04T08:05:00.000Z'),
        markedById: linkedStudentUserId,
      },
      select: { id: true },
    });
    ownDraftAttendanceEntryId = draftEntry.id;
    createdAttendanceEntryIds.push(draftEntry.id);
  }

  async function createStudentHeroFixture(params: {
    otherStudentId: string;
    otherEnrollmentId: string;
  }): Promise<{
    missionId: string;
    objectiveId: string;
    progressId: string;
    otherProgressId: string;
    badgeId: string;
    startableMissionId: string;
    completableMissionId: string;
    objectiveActionMissionId: string;
    objectiveActionObjectiveId: string;
    objectiveActionProgressId: string;
    otherOnlyMissionId: string;
    otherOnlyObjectiveId: string;
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

    const createPublishedMission = async (params: {
      title: string;
      sortOrder: number;
      rewardXp?: number;
    }): Promise<{ missionId: string; objectiveId: string }> => {
      const mission = await prisma.heroMission.create({
        data: {
          schoolId,
          academicYearId,
          termId,
          stageId,
          subjectId,
          titleEn: `${testSuffix} ${params.title}`,
          briefEn: 'Student App hero action mission.',
          requiredLevel: 1,
          rewardXp: params.rewardXp ?? 0,
          badgeRewardId: badge.id,
          status: HeroMissionStatus.PUBLISHED,
          positionX: params.sortOrder * 10,
          positionY: params.sortOrder * 10,
          sortOrder: params.sortOrder,
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
          titleEn: `${testSuffix} ${params.title} Objective`,
          subtitleEn: 'Complete the action objective.',
          sortOrder: 1,
          isRequired: true,
        },
        select: { id: true },
      });
      createdHeroMissionObjectiveIds.push(objective.id);

      return { missionId: mission.id, objectiveId: objective.id };
    };

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

    const startableMission = await createPublishedMission({
      title: 'Startable Hero Mission',
      sortOrder: 2,
    });
    const completableMission = await createPublishedMission({
      title: 'Completable Hero Mission',
      sortOrder: 3,
    });
    const completableProgress = await prisma.heroMissionProgress.create({
      data: {
        schoolId,
        missionId: completableMission.missionId,
        studentId: linkedStudentId,
        enrollmentId: linkedEnrollmentId,
        academicYearId,
        termId,
        status: HeroMissionProgressStatus.IN_PROGRESS,
        progressPercent: 100,
        startedAt: new Date('2026-10-03T08:00:00.000Z'),
        lastActivityAt: new Date('2026-10-03T09:00:00.000Z'),
      },
      select: { id: true },
    });
    createdHeroMissionProgressIds.push(completableProgress.id);
    const completableObjectiveProgress =
      await prisma.heroMissionObjectiveProgress.create({
        data: {
          schoolId,
          missionProgressId: completableProgress.id,
          objectiveId: completableMission.objectiveId,
          completedAt: new Date('2026-10-03T09:00:00.000Z'),
          completedById: linkedStudentUserId,
        },
        select: { id: true },
      });
    createdHeroMissionObjectiveProgressIds.push(
      completableObjectiveProgress.id,
    );

    const objectiveActionMission = await createPublishedMission({
      title: 'Objective Action Hero Mission',
      sortOrder: 4,
    });
    const objectiveActionProgress = await prisma.heroMissionProgress.create({
      data: {
        schoolId,
        missionId: objectiveActionMission.missionId,
        studentId: linkedStudentId,
        enrollmentId: linkedEnrollmentId,
        academicYearId,
        termId,
        status: HeroMissionProgressStatus.IN_PROGRESS,
        progressPercent: 0,
        startedAt: new Date('2026-10-04T08:00:00.000Z'),
        lastActivityAt: new Date('2026-10-04T08:00:00.000Z'),
      },
      select: { id: true },
    });
    createdHeroMissionProgressIds.push(objectiveActionProgress.id);

    const otherOnlyMission = await createPublishedMission({
      title: 'Other Student Only Hero Mission',
      sortOrder: 5,
    });
    const otherOnlyProgress = await prisma.heroMissionProgress.create({
      data: {
        schoolId,
        missionId: otherOnlyMission.missionId,
        studentId: params.otherStudentId,
        enrollmentId: params.otherEnrollmentId,
        academicYearId,
        termId,
        status: HeroMissionProgressStatus.IN_PROGRESS,
        progressPercent: 0,
        startedAt: new Date('2026-10-05T08:00:00.000Z'),
        lastActivityAt: new Date('2026-10-05T08:00:00.000Z'),
      },
      select: { id: true },
    });
    createdHeroMissionProgressIds.push(otherOnlyProgress.id);

    return {
      missionId: mission.id,
      objectiveId: objective.id,
      progressId: progress.id,
      otherProgressId: otherProgress.id,
      badgeId: badge.id,
      startableMissionId: startableMission.missionId,
      completableMissionId: completableMission.missionId,
      objectiveActionMissionId: objectiveActionMission.missionId,
      objectiveActionObjectiveId: objectiveActionMission.objectiveId,
      objectiveActionProgressId: objectiveActionProgress.id,
      otherOnlyMissionId: otherOnlyMission.missionId,
      otherOnlyObjectiveId: otherOnlyMission.objectiveId,
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

    const otherSubmission = await prisma.gradeSubmission.create({
      data: {
        schoolId,
        assessmentId: assessment.id,
        termId,
        studentId: sameSchoolOtherStudentId,
        enrollmentId: sameSchoolOtherEnrollmentId,
        status: GradeSubmissionStatus.SUBMITTED,
        startedAt: new Date('2026-10-04T09:00:00.000Z'),
        submittedAt: new Date('2026-10-04T09:30:00.000Z'),
        totalScore: 1,
        maxScore: 10,
      },
      select: { id: true },
    });
    createdGradeSubmissionIds.push(otherSubmission.id);

    const otherAnswer = await prisma.gradeSubmissionAnswer.create({
      data: {
        schoolId,
        submissionId: otherSubmission.id,
        assessmentId: assessment.id,
        questionId: question.id,
        studentId: sameSchoolOtherStudentId,
        answerText: 'OTHER_STUDENT_HIDDEN_ANSWER',
        answerJson: { selected: 'OTHER_STUDENT_HIDDEN_JSON' },
        correctionStatus: GradeAnswerCorrectionStatus.PENDING,
        maxPoints: 10,
      },
      select: { id: true },
    });
    createdGradeSubmissionAnswerIds.push(otherAnswer.id);

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
  ): Promise<{
    classroomId: string;
    subjectId: string;
    allocationId: string;
    assessmentId: string;
  }> {
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

    return {
      classroomId: classroom.id,
      subjectId: subject.id,
      allocationId: allocation.id,
      assessmentId: assessment.id,
    };
  }

  async function createStudentScheduleFixture(params: {
    schoolId: string;
    academicYearId: string;
    termId: string;
    gradeId: string;
    sectionId: string;
    classroomId: string;
    subjectId: string;
    teacherUserId: string;
    allocationId: string;
    marker: string;
    dayOfWeek: number;
  }): Promise<string> {
    const config = await prisma.timetableConfig.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        termId: params.termId,
        name: `${testSuffix}-${params.marker}-config`,
        weekStartDay: 1,
        activeDays: [1, 2, 3, 4, 5],
        scopeType: TimetableScopeType.CLASSROOM,
        scopeKey: params.classroomId,
        classroomId: params.classroomId,
        status: TimetableConfigStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdTimetableConfigIds.push(config.id);

    const period = await prisma.timetablePeriod.create({
      data: {
        schoolId: params.schoolId,
        timetableConfigId: config.id,
        periodIndex: 1,
        label: `${testSuffix}-${params.marker}-period`,
        startTime: '08:00',
        endTime: '08:45',
        type: TimetablePeriodType.CLASS,
        isInstructional: true,
      },
      select: { id: true },
    });
    createdTimetablePeriodIds.push(period.id);

    const publication = await prisma.timetablePublication.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        termId: params.termId,
        timetableConfigId: config.id,
        status: TimetablePublicationStatus.PUBLISHED,
        publishedAt: new Date('2026-09-10T08:00:00.000Z'),
        publishedByUserId: params.teacherUserId,
        revision: 1,
      },
      select: { id: true },
    });
    createdTimetablePublicationIds.push(publication.id);

    const entry = await prisma.timetableEntry.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        termId: params.termId,
        timetableConfigId: config.id,
        periodId: period.id,
        dayOfWeek: params.dayOfWeek,
        gradeId: params.gradeId,
        sectionId: params.sectionId,
        classroomId: params.classroomId,
        subjectId: params.subjectId,
        teacherUserId: params.teacherUserId,
        teacherSubjectAllocationId: params.allocationId,
        notes: `${testSuffix}-${params.marker}-safe-note`,
        status: TimetableEntryStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdTimetableEntryIds.push(entry.id);

    return entry.id;
  }

  async function createTenantBAssessmentFixture(params: {
    teacherUserId: string;
    studentRoleId: string;
  }): Promise<{
    subjectId: string;
    assessmentId: string;
    studentEmail: string;
    scheduleEntryId: string;
    behaviorRecordId: string;
    heroMissionId: string;
    taskId: string;
    taskSubmissionId: string;
    conversationId: string;
    announcementId: string;
    rewardId: string;
    rewardRedemptionId: string;
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

    const studentEmail = `${testSuffix}-tenant-b-student@example.test`;
    const studentUserId = await createUserWithScopedMembership({
      email: studentEmail,
      userType: UserType.STUDENT,
      roleId: params.studentRoleId,
      organizationId: organization.id,
      schoolId: school.id,
    });

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
        teacherUserId: params.teacherUserId,
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
        userId: studentUserId,
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

    const scheduleEntryId = await createStudentScheduleFixture({
      schoolId: school.id,
      academicYearId: year.id,
      termId: term.id,
      gradeId: grade.id,
      sectionId: section.id,
      classroomId: classroom.id,
      subjectId: subject.id,
      teacherUserId: params.teacherUserId,
      allocationId: allocation.id,
      marker: 'tenant-b-student-schedule',
      dayOfWeek: 1,
    });

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
        assignedById: params.teacherUserId,
        createdById: params.teacherUserId,
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
        createdById: params.teacherUserId,
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
        createdById: params.teacherUserId,
        publishedById: params.teacherUserId,
      },
      select: { id: true },
    });
    createdAnnouncementIds.push(announcement.id);

    const reward = await prisma.rewardCatalogItem.create({
      data: {
        schoolId: school.id,
        academicYearId: year.id,
        termId: term.id,
        titleEn: `${testSuffix} Tenant B Reward`,
        descriptionEn: 'Hidden tenant reward.',
        type: RewardCatalogItemType.DIGITAL,
        status: RewardCatalogItemStatus.PUBLISHED,
        minTotalXp: 1,
        isUnlimited: true,
        publishedAt: new Date('2026-09-25T08:00:00.000Z'),
        publishedById: studentUserId,
        createdById: studentUserId,
      },
      select: { id: true },
    });
    createdRewardCatalogItemIds.push(reward.id);

    const rewardRedemption = await prisma.rewardRedemption.create({
      data: {
        schoolId: school.id,
        catalogItemId: reward.id,
        studentId: student.id,
        enrollmentId: enrollment.id,
        academicYearId: year.id,
        termId: term.id,
        status: RewardRedemptionStatus.REQUESTED,
        requestSource: RewardRedemptionRequestSource.STUDENT_APP,
        requestedById: studentUserId,
      },
      select: { id: true },
    });
    createdRewardRedemptionIds.push(rewardRedemption.id);

    return {
      subjectId: subject.id,
      assessmentId: assessment.id,
      studentEmail,
      scheduleEntryId,
      behaviorRecordId: behaviorRecord.id,
      heroMissionId: heroMission.id,
      taskId: task.id,
      taskSubmissionId: submission.id,
      conversationId: conversation.id,
      announcementId: announcement.id,
      rewardId: reward.id,
      rewardRedemptionId: rewardRedemption.id,
    };
  }

  async function login(email: string): Promise<{ accessToken: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: E2E_PASSWORD })
      .expect(200);

    return { accessToken: response.body.accessToken };
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

  function expectSafeStudentSchedulePayload(body: unknown): void {
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      'schoolId',
      'organizationId',
      'academicYearId',
      'termId',
      'teacherSubjectAllocationId',
      'password',
      'session',
      'token',
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

  function assertNoForbiddenStudentRewardsFields(body: unknown): void {
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      'schoolId',
      'organizationId',
      'membershipId',
      'roleId',
      'deletedAt',
      'studentId',
      'enrollmentId',
      'createdById',
      'updatedById',
      'approvedById',
      'rejectedById',
      'fulfilledById',
      'cancelledById',
      'requestedById',
      'reviewedById',
      'XP ledger internals',
      'xpLedgerId',
      'ledgerEntryId',
      'RewardRedemption internals',
      'eligibilitySnapshot',
      'metadata',
      'internalPolicy',
      'rewardLedgerInternal',
      'BehaviorPointLedger',
      'wallet',
      'finance',
      'marketplace',
      'payment',
      'objectKey',
      'bucket',
      'raw metadata',
      'signedUrl',
      'unsafe storage URL',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  }
});
