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
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
  ReinforcementProofType,
  ReinforcementRewardType,
  ReinforcementSource,
  ReinforcementSubmissionStatus,
  ReinforcementTargetScope,
  ReinforcementTaskStatus,
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
import { StorageService } from '../../src/infrastructure/storage/storage.service';
import { ParentAppAccessService } from '../../src/modules/parent-app/access/parent-app-access.service';
import { ParentAppGuardianReadAdapter } from '../../src/modules/parent-app/access/parent-app-guardian-read.adapter';
import type {
  ParentAppEnrollmentRecord,
  ParentAppGuardianRecord,
  ParentAppStudentGuardianLinkRecord,
} from '../../src/modules/parent-app/shared/parent-app.types';

type ExpressLayer = {
  route?: {
    path?: string | string[];
    methods?: Record<string, boolean>;
  };
  handle?: {
    stack?: ExpressLayer[];
  };
};

const PARENT_USER_ID = 'parent-user-1';
const GUARDIAN_ID = 'guardian-1';
const STUDENT_ID = 'student-1';
const SECOND_STUDENT_ID = 'student-2';
const ENROLLMENT_ID = 'enrollment-1';
const SECOND_ENROLLMENT_ID = 'enrollment-2';
const CLASSROOM_ID = 'classroom-1';
const SCHOOL_ID = 'school-1';
const ORGANIZATION_ID = 'org-1';
const GLOBAL_PREFIX = '/api/v1';
const E2E_PASSWORD = 'ParentApp123!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(120000);

describe('Sprint 9F Parent App final closeout access foundation', () => {
  it('does not allow a parent to access an unlinked same-school child', async () => {
    const { service, adapter } = createValidService();
    adapter.findOwnedActiveEnrollmentForStudent.mockResolvedValue(null);

    await expect(
      withParentRequestContext(() =>
        service.assertParentOwnsStudent('same-school-unlinked-student'),
      ),
    ).rejects.toMatchObject({
      code: 'parent_app.child.not_found',
    });
    expect(adapter.findOwnedActiveEnrollmentForStudent).toHaveBeenCalledWith({
      studentId: 'same-school-unlinked-student',
      guardianIds: [GUARDIAN_ID],
    });
  });

  it('does not allow a parent to access a cross-school guessed child', async () => {
    const { service, adapter } = createValidService();
    adapter.findOwnedActiveEnrollmentForStudent.mockResolvedValue(null);

    await expect(
      withParentRequestContext(() =>
        service.assertParentOwnsStudent('cross-school-student'),
      ),
    ).rejects.toMatchObject({
      code: 'parent_app.child.not_found',
    });
  });

  it('returns only current-school linked children from the active school context', async () => {
    const { service, adapter } = createValidService();

    const children = await withParentRequestContext(() =>
      service.listAccessibleChildren(),
    );

    expect(children).toEqual([
      {
        studentId: STUDENT_ID,
        enrollmentId: ENROLLMENT_ID,
        classroomId: CLASSROOM_ID,
        academicYearId: 'year-1',
        termId: 'term-1',
      },
      {
        studentId: SECOND_STUDENT_ID,
        enrollmentId: SECOND_ENROLLMENT_ID,
        classroomId: CLASSROOM_ID,
        academicYearId: 'year-1',
        termId: 'term-1',
      },
    ]);
    expect(children.map((child) => child.studentId)).not.toContain(
      'cross-school-student',
    );
    expect(adapter.listActiveEnrollmentsForLinkedStudents).toHaveBeenCalledWith(
      {
        guardianIds: [GUARDIAN_ID],
        studentIds: [STUDENT_ID, SECOND_STUDENT_ID],
      },
    );
  });

  it('rejects non-parent actors before resolving guardian ownership', async () => {
    const { service, adapter } = createValidService();

    await expect(
      withParentRequestContext(() => service.getParentAppContext(), {
        userType: UserType.TEACHER,
      }),
    ).rejects.toMatchObject({
      code: 'parent_app.actor.required_parent',
    });
    expect(adapter.listCurrentSchoolGuardiansByUserId).not.toHaveBeenCalled();
  });
});

async function withParentRequestContext<T>(
  fn: () => T | Promise<T>,
  options?: { userType?: UserType },
): Promise<T> {
  return runWithRequestContext(createRequestContext(), async () => {
    setActor({
      id: PARENT_USER_ID,
      userType: options?.userType ?? UserType.PARENT,
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
  service: ParentAppAccessService;
  adapter: jest.Mocked<ParentAppGuardianReadAdapter>;
} {
  const adapter = {
    listCurrentSchoolGuardiansByUserId: jest
      .fn()
      .mockResolvedValue([guardianFixture()]),
    listLinkedStudentsForGuardians: jest.fn().mockResolvedValue([
      linkFixture(),
      linkFixture({
        id: 'link-2',
        studentId: SECOND_STUDENT_ID,
        student: studentRecordFixture({ id: SECOND_STUDENT_ID }),
      }),
    ]),
    listActiveEnrollmentsForLinkedStudents: jest.fn().mockResolvedValue([
      enrollmentFixture(),
      enrollmentFixture({
        id: SECOND_ENROLLMENT_ID,
        studentId: SECOND_STUDENT_ID,
        student: studentRecordFixture({ id: SECOND_STUDENT_ID }),
      }),
    ]),
    findOwnedActiveEnrollmentForStudent: jest.fn(),
    findOwnedEnrollmentById: jest.fn(),
    findOwnedClassroomEnrollment: jest.fn(),
  } as unknown as jest.Mocked<ParentAppGuardianReadAdapter>;

  return {
    service: new ParentAppAccessService(adapter),
    adapter,
  };
}

function guardianFixture(
  overrides?: Partial<ParentAppGuardianRecord>,
): ParentAppGuardianRecord {
  return {
    id: GUARDIAN_ID,
    schoolId: SCHOOL_ID,
    organizationId: ORGANIZATION_ID,
    userId: PARENT_USER_ID,
    deletedAt: null,
    user: {
      id: PARENT_USER_ID,
      userType: UserType.PARENT,
      status: UserStatus.ACTIVE,
      deletedAt: null,
    },
    ...overrides,
  };
}

function studentRecordFixture(overrides?: {
  id?: string;
  schoolId?: string;
  organizationId?: string;
  status?: StudentStatus;
  deletedAt?: Date | null;
}): NonNullable<ParentAppStudentGuardianLinkRecord['student']> {
  return {
    id: overrides?.id ?? STUDENT_ID,
    schoolId: overrides?.schoolId ?? SCHOOL_ID,
    organizationId: overrides?.organizationId ?? ORGANIZATION_ID,
    status: overrides?.status ?? StudentStatus.ACTIVE,
    deletedAt: overrides?.deletedAt ?? null,
  };
}

function linkFixture(
  overrides?: Partial<ParentAppStudentGuardianLinkRecord>,
): ParentAppStudentGuardianLinkRecord {
  return {
    id: 'link-1',
    schoolId: SCHOOL_ID,
    studentId: STUDENT_ID,
    guardianId: GUARDIAN_ID,
    student: studentRecordFixture(),
    ...overrides,
  };
}

function enrollmentFixture(
  overrides?: Partial<ParentAppEnrollmentRecord>,
): ParentAppEnrollmentRecord {
  return {
    id: ENROLLMENT_ID,
    schoolId: SCHOOL_ID,
    studentId: STUDENT_ID,
    academicYearId: 'year-1',
    termId: 'term-1',
    classroomId: CLASSROOM_ID,
    status: StudentEnrollmentStatus.ACTIVE,
    deletedAt: null,
    student: studentRecordFixture(),
    ...overrides,
  };
}

describe('Sprint 9F Parent App final closeout flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let storageService: StorageService | undefined;

  let organizationAId: string;
  let organizationBId: string;
  let schoolAId: string;
  let schoolBId: string;
  let academicYearAId: string;
  let termAId: string;
  let classroomAId: string;
  let parentEmail: string;
  let adminEmail: string;
  let teacherEmail: string;
  let studentEmail: string;
  let parentUserId: string;
  let adminUserId: string;
  let teacherUserId: string;
  let studentUserId: string;
  let guardianAId: string;
  let ownedStudentAId: string;
  let secondOwnedStudentAId: string;
  let sameSchoolUnlinkedStudentId: string;
  let sameSchoolUnlinkedEnrollmentId: string;
  let crossSchoolLinkedStudentId: string;
  let crossSchoolLinkedEnrollmentId: string;
  let ownedEnrollmentAId: string;
  let secondOwnedEnrollmentAId: string;
  let subjectAId: string;
  let ownedAssessmentAId: string;
  let draftAssessmentAId: string;
  let positiveBehaviorRecordAId: string;
  let negativeBehaviorRecordAId: string;
  let ownedTaskAId: string;
  let ownedTaskStageAId: string;
  let ownedTaskSubmissionAId: string;
  let ownedTaskProofFileAId: string;
  let secondOwnedTaskProofFileAId: string;
  let sameSchoolUnlinkedTaskAId: string;
  let sameSchoolUnlinkedTaskSubmissionAId: string;
  let sameSchoolUnlinkedTaskProofFileAId: string;
  let crossSchoolTaskId: string;
  let crossSchoolTaskSubmissionId: string;
  let crossSchoolTaskProofFileId: string;
  let arbitraryPrivateFileAId: string;
  let ownConversationAId: string;
  let ownConversationHiddenMessageAId: string;
  let nonParticipantConversationAId: string;
  let crossSchoolConversationId: string;
  let audienceAnnouncementAId: string;
  let outOfAudienceAnnouncementAId: string;
  let crossSchoolAnnouncementId: string;

  const testSuffix = `parent-app-closeout-${Date.now()}`;
  const createdUserIds: string[] = [];
  const createdGuardianIds: string[] = [];
  const createdStudentGuardianIds: string[] = [];
  const createdStudentIds: string[] = [];
  const createdEnrollmentIds: string[] = [];
  const createdAttendanceSessionIds: string[] = [];
  const createdAttendanceEntryIds: string[] = [];
  const createdBehaviorCategoryIds: string[] = [];
  const createdBehaviorRecordIds: string[] = [];
  const createdBehaviorPointLedgerIds: string[] = [];
  const createdGradeAssessmentIds: string[] = [];
  const createdGradeItemIds: string[] = [];
  const createdGradeQuestionIds: string[] = [];
  const createdGradeQuestionOptionIds: string[] = [];
  const createdGradeSubmissionIds: string[] = [];
  const createdGradeSubmissionAnswerIds: string[] = [];
  const createdXpLedgerIds: string[] = [];
  const createdReinforcementSubmissionIds: string[] = [];
  const createdReinforcementStageIds: string[] = [];
  const createdReinforcementAssignmentIds: string[] = [];
  const createdReinforcementTargetIds: string[] = [];
  const createdReinforcementTaskIds: string[] = [];
  const createdCommunicationAnnouncementAttachmentIds: string[] = [];
  const createdCommunicationAnnouncementReadIds: string[] = [];
  const createdCommunicationAnnouncementAudienceIds: string[] = [];
  const createdCommunicationAnnouncementIds: string[] = [];
  const createdCommunicationMessageReadIds: string[] = [];
  const createdCommunicationMessageIds: string[] = [];
  const createdCommunicationParticipantIds: string[] = [];
  const createdCommunicationConversationIds: string[] = [];
  const createdFileIds: string[] = [];
  const createdStoredObjects: { bucket: string; objectKey: string }[] = [];
  const createdStoredObjectKeys = new Set<string>();
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

    const [parentRole, schoolAdminRole, teacherRole, studentRole] =
      await Promise.all([
        findSystemRole('parent'),
        findSystemRole('school_admin'),
        findSystemRole('teacher'),
        findSystemRole('student'),
      ]);

    const organizationA = await prisma.organization.create({
      data: {
        slug: `${testSuffix}-org-a`,
        name: `${testSuffix} Org A`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    organizationAId = organizationA.id;
    createdOrganizationIds.push(organizationA.id);

    const organizationB = await prisma.organization.create({
      data: {
        slug: `${testSuffix}-org-b`,
        name: `${testSuffix} Org B`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    organizationBId = organizationB.id;
    createdOrganizationIds.push(organizationB.id);

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
    createdSchoolIds.push(schoolA.id);

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
    createdSchoolIds.push(schoolB.id);

    await prisma.schoolProfile.create({
      data: {
        schoolId: schoolAId,
        schoolName: `${testSuffix} Parent Academy`,
        logoUrl: 'raw-parent-logo-should-not-be-returned',
      },
    });

    parentEmail = `${testSuffix}-parent@example.test`;
    adminEmail = `${testSuffix}-admin@example.test`;
    teacherEmail = `${testSuffix}-teacher@example.test`;
    studentEmail = `${testSuffix}-student@example.test`;

    parentUserId = await createUserWithMembership({
      email: parentEmail,
      userType: UserType.PARENT,
      roleId: parentRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
      firstName: 'Mona',
      lastName: 'Parent',
    });
    adminUserId = await createUserWithMembership({
      email: adminEmail,
      userType: UserType.SCHOOL_USER,
      roleId: schoolAdminRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    teacherUserId = await createUserWithMembership({
      email: teacherEmail,
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    studentUserId = await createUserWithMembership({
      email: studentEmail,
      userType: UserType.STUDENT,
      roleId: studentRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });

    const academicA = await createAcademicFixture({
      organizationId: organizationAId,
      schoolId: schoolAId,
      marker: 'a',
    });
    academicYearAId = academicA.academicYearId;
    termAId = academicA.termId;
    classroomAId = academicA.classroomId;

    const firstChild = await createStudentWithEnrollment({
      organizationId: organizationAId,
      schoolId: schoolAId,
      academicYearId: academicYearAId,
      termId: termAId,
      classroomId: classroomAId,
      firstName: 'Sara',
      lastName: 'Child',
    });
    ownedStudentAId = firstChild.studentId;
    ownedEnrollmentAId = firstChild.enrollmentId;

    const secondChild = await createStudentWithEnrollment({
      organizationId: organizationAId,
      schoolId: schoolAId,
      academicYearId: academicYearAId,
      termId: termAId,
      classroomId: classroomAId,
      firstName: 'Omar',
      lastName: 'Child',
    });
    secondOwnedStudentAId = secondChild.studentId;
    secondOwnedEnrollmentAId = secondChild.enrollmentId;

    const unlinkedChild = await createStudentWithEnrollment({
      organizationId: organizationAId,
      schoolId: schoolAId,
      academicYearId: academicYearAId,
      termId: termAId,
      classroomId: classroomAId,
      firstName: 'Unlinked',
      lastName: 'Child',
    });
    sameSchoolUnlinkedStudentId = unlinkedChild.studentId;
    sameSchoolUnlinkedEnrollmentId = unlinkedChild.enrollmentId;

    guardianAId = await createGuardian({
      organizationId: organizationAId,
      schoolId: schoolAId,
      userId: parentUserId,
      relation: 'mother',
      isPrimary: true,
      marker: 'current-school',
    });
    await linkGuardianToStudent({
      schoolId: schoolAId,
      studentId: ownedStudentAId,
      guardianId: guardianAId,
      isPrimary: true,
    });
    await linkGuardianToStudent({
      schoolId: schoolAId,
      studentId: secondOwnedStudentAId,
      guardianId: guardianAId,
      isPrimary: false,
    });

    const featureFixture = await createParentAppFeatureFixture();
    subjectAId = featureFixture.subjectId;
    ownedAssessmentAId = featureFixture.assessmentId;
    draftAssessmentAId = featureFixture.draftAssessmentId;
    positiveBehaviorRecordAId = featureFixture.positiveBehaviorRecordId;
    negativeBehaviorRecordAId = featureFixture.negativeBehaviorRecordId;

    const academicB = await createAcademicFixture({
      organizationId: organizationBId,
      schoolId: schoolBId,
      marker: 'b',
    });
    const crossSchoolChild = await createStudentWithEnrollment({
      organizationId: organizationBId,
      schoolId: schoolBId,
      academicYearId: academicB.academicYearId,
      termId: academicB.termId,
      classroomId: academicB.classroomId,
      firstName: 'Cross',
      lastName: 'School',
    });
    crossSchoolLinkedStudentId = crossSchoolChild.studentId;
    crossSchoolLinkedEnrollmentId = crossSchoolChild.enrollmentId;

    const guardianBId = await createGuardian({
      organizationId: organizationBId,
      schoolId: schoolBId,
      userId: parentUserId,
      relation: 'father',
      isPrimary: true,
      marker: 'cross-school',
    });
    await linkGuardianToStudent({
      schoolId: schoolBId,
      studentId: crossSchoolLinkedStudentId,
      guardianId: guardianBId,
      isPrimary: true,
    });

    const sprint9EFixture = await createParentAppSprint9EFixture({
      crossSchoolAcademicYearId: academicB.academicYearId,
      crossSchoolTermId: academicB.termId,
      crossSchoolClassroomId: academicB.classroomId,
    });
    ownedTaskAId = sprint9EFixture.ownedTaskId;
    ownedTaskStageAId = sprint9EFixture.ownedTaskStageId;
    ownedTaskSubmissionAId = sprint9EFixture.ownedTaskSubmissionId;
    ownedTaskProofFileAId = sprint9EFixture.ownedTaskProofFileId;
    secondOwnedTaskProofFileAId =
      sprint9EFixture.secondOwnedTaskProofFileId;
    sameSchoolUnlinkedTaskAId = sprint9EFixture.sameSchoolUnlinkedTaskId;
    sameSchoolUnlinkedTaskSubmissionAId =
      sprint9EFixture.sameSchoolUnlinkedTaskSubmissionId;
    sameSchoolUnlinkedTaskProofFileAId =
      sprint9EFixture.sameSchoolUnlinkedTaskProofFileId;
    crossSchoolTaskId = sprint9EFixture.crossSchoolTaskId;
    crossSchoolTaskSubmissionId = sprint9EFixture.crossSchoolTaskSubmissionId;
    crossSchoolTaskProofFileId = sprint9EFixture.crossSchoolTaskProofFileId;
    arbitraryPrivateFileAId = sprint9EFixture.arbitraryPrivateFileId;
    ownConversationAId = sprint9EFixture.ownConversationId;
    ownConversationHiddenMessageAId =
      sprint9EFixture.ownConversationHiddenMessageId;
    nonParticipantConversationAId =
      sprint9EFixture.nonParticipantConversationId;
    crossSchoolConversationId = sprint9EFixture.crossSchoolConversationId;
    audienceAnnouncementAId = sprint9EFixture.audienceAnnouncementId;
    outOfAudienceAnnouncementAId = sprint9EFixture.outOfAudienceAnnouncementId;
    crossSchoolAnnouncementId = sprint9EFixture.crossSchoolAnnouncementId;

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
    await ensureCreatedFileObjects();
  });

  afterAll(async () => {
    try {
      await prisma.session.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.communicationAnnouncementRead.deleteMany({
        where: {
          OR: [
            { id: { in: createdCommunicationAnnouncementReadIds } },
            {
              announcementId: {
                in: createdCommunicationAnnouncementIds,
              },
            },
          ],
        },
      });
      await prisma.communicationAnnouncementAttachment.deleteMany({
        where: { id: { in: createdCommunicationAnnouncementAttachmentIds } },
      });
      await prisma.communicationAnnouncementAudience.deleteMany({
        where: { id: { in: createdCommunicationAnnouncementAudienceIds } },
      });
      await prisma.communicationAnnouncement.deleteMany({
        where: { id: { in: createdCommunicationAnnouncementIds } },
      });
      await prisma.communicationMessageRead.deleteMany({
        where: {
          OR: [
            { id: { in: createdCommunicationMessageReadIds } },
            { conversationId: { in: createdCommunicationConversationIds } },
          ],
        },
      });
      await prisma.communicationConversationParticipant.updateMany({
        where: { conversationId: { in: createdCommunicationConversationIds } },
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
      await prisma.gradeSubmissionAnswerOption.deleteMany({
        where: {
          OR: [
            { answerId: { in: createdGradeSubmissionAnswerIds } },
            { optionId: { in: createdGradeQuestionOptionIds } },
          ],
        },
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
      for (const object of createdStoredObjects) {
        await storageService?.deleteObject(object).catch(() => undefined);
      }
      await prisma.studentGuardian.deleteMany({
        where: { id: { in: createdStudentGuardianIds } },
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

  it('registers the Sprint 9F Parent App route set and keeps deferred routes absent', async () => {
    const routes = listRegisteredParentRoutes();

    expect(routes).toEqual([
      'GET /api/v1/parent/announcements',
      'GET /api/v1/parent/announcements/:announcementId',
      'GET /api/v1/parent/announcements/:announcementId/attachments',
      'GET /api/v1/parent/children',
      'GET /api/v1/parent/children/:studentId',
      'GET /api/v1/parent/children/:studentId/behavior',
      'GET /api/v1/parent/children/:studentId/behavior/:recordId',
      'GET /api/v1/parent/children/:studentId/behavior/summary',
      'GET /api/v1/parent/children/:studentId/calendar/events',
      'GET /api/v1/parent/children/:studentId/calendar/events/:eventId',
      'GET /api/v1/parent/children/:studentId/discipline',
      'GET /api/v1/parent/children/:studentId/discipline/summary',
      'GET /api/v1/parent/children/:studentId/files/:fileId/download',
      'GET /api/v1/parent/children/:studentId/grades',
      'GET /api/v1/parent/children/:studentId/grades/assessments/:assessmentId',
      'GET /api/v1/parent/children/:studentId/grades/summary',
      'GET /api/v1/parent/children/:studentId/hero',
      'GET /api/v1/parent/children/:studentId/hero/badges',
      'GET /api/v1/parent/children/:studentId/hero/missions',
      'GET /api/v1/parent/children/:studentId/hero/missions/:missionId',
      'GET /api/v1/parent/children/:studentId/hero/progress',
      'GET /api/v1/parent/children/:studentId/homeworks',
      'GET /api/v1/parent/children/:studentId/homeworks/:homeworkId',
      'GET /api/v1/parent/children/:studentId/lessons/:lessonPlanItemId',
      'GET /api/v1/parent/children/:studentId/lessons/today',
      'GET /api/v1/parent/children/:studentId/lessons/week',
      'GET /api/v1/parent/children/:studentId/progress',
      'GET /api/v1/parent/children/:studentId/progress/academic',
      'GET /api/v1/parent/children/:studentId/progress/behavior',
      'GET /api/v1/parent/children/:studentId/progress/xp',
      'GET /api/v1/parent/children/:studentId/reports',
      'GET /api/v1/parent/children/:studentId/reports/summary',
      'GET /api/v1/parent/children/:studentId/rewards',
      'GET /api/v1/parent/children/:studentId/rewards/:rewardId',
      'GET /api/v1/parent/children/:studentId/rewards/redemptions',
      'GET /api/v1/parent/children/:studentId/rewards/redemptions/:redemptionId',
      'GET /api/v1/parent/children/:studentId/schedule/today',
      'GET /api/v1/parent/children/:studentId/schedule/weekly',
      'GET /api/v1/parent/children/:studentId/tasks',
      'GET /api/v1/parent/children/:studentId/tasks/:taskId',
      'GET /api/v1/parent/children/:studentId/tasks/:taskId/submissions',
      'GET /api/v1/parent/children/:studentId/tasks/:taskId/submissions/:submissionId',
      'GET /api/v1/parent/children/:studentId/tasks/summary',
      'GET /api/v1/parent/home',
      'GET /api/v1/parent/messages/conversations',
      'GET /api/v1/parent/messages/conversations/:conversationId',
      'GET /api/v1/parent/messages/conversations/:conversationId/messages',
      'GET /api/v1/parent/profile',
      'POST /api/v1/parent/announcements/:announcementId/read',
      'POST /api/v1/parent/messages/conversations/:conversationId/messages',
      'POST /api/v1/parent/messages/conversations/:conversationId/read',
    ]);

    for (const absentRoute of [
      'GET /api/v1/parent/schedule',
      'GET /api/v1/parent/children/:studentId/schedule',
      'GET /api/v1/parent/children/:studentId/timetable',
      'GET /api/v1/parent/homeworks',
      'GET /api/v1/parent/pickup',
      'GET /api/v1/parent/smart-pickup',
      'GET /api/v1/parent/notifications',
      'GET /api/v1/parent/messages/contacts',
      'POST /api/v1/parent/messages/conversations',
      'POST /api/v1/parent/messages/conversations/:conversationId/attachments',
      'POST /api/v1/parent/messages/conversations/:conversationId/audio',
      'POST /api/v1/parent/children/:studentId/tasks',
      'POST /api/v1/parent/children/:studentId/tasks/:taskId/submit',
      'POST /api/v1/parent/children/:studentId/tasks/:taskId/stages/:stageId/submit',
      'PATCH /api/v1/parent/children/:studentId/tasks/:taskId',
      'POST /api/v1/parent/children/:studentId/tasks/:taskId/cancel',
      'POST /api/v1/parent/children/:studentId/tasks/:taskId/review',
      'POST /api/v1/parent/children/:studentId/tasks/:taskId/approve',
      'POST /api/v1/parent/children/:studentId/tasks/:taskId/reject',
      'POST /api/v1/parent/children/:studentId/tasks/:taskId/complete',
      'POST /api/v1/parent/children/:studentId/homeworks/:homeworkId/submission/save',
      'POST /api/v1/parent/children/:studentId/homeworks/:homeworkId/submission/submit',
      'POST /api/v1/parent/children/:studentId/homeworks/:homeworkId/submit',
      'PATCH /api/v1/parent/children/:studentId/homeworks/:homeworkId',
      'POST /api/v1/parent/children/:studentId/grades',
      'POST /api/v1/parent/children/:studentId/grades/assessments/:assessmentId/submission/submit',
      'POST /api/v1/parent/children/:studentId/exams/:assessmentId/submission/submit',
      'POST /api/v1/parent/children/:studentId/exams/:assessmentId/submit',
      'POST /api/v1/parent/children/:studentId/attendance',
      'PATCH /api/v1/parent/children/:studentId/attendance/:entryId',
      'POST /api/v1/parent/children/:studentId/behavior',
      'POST /api/v1/parent/children/:studentId/behavior/:recordId/approve',
      'POST /api/v1/parent/children/:studentId/discipline',
      'POST /api/v1/parent/children/:studentId/reports/generate',
      'POST /api/v1/parent/children/:studentId/hero/missions/:missionId/start',
      'POST /api/v1/parent/children/:studentId/hero/missions/:missionId/complete',
      'POST /api/v1/parent/children/:studentId/hero/missions/:missionId/objectives/:objectiveId/complete',
      'POST /api/v1/parent/children/:studentId/rewards/:rewardId/redeem',
      'POST /api/v1/parent/children/:studentId/xp/grants/manual',
      'POST /api/v1/parent/children/:studentId/progress/xp/grants/manual',
      'POST /api/v1/parent/announcements',
      'PATCH /api/v1/parent/announcements/:announcementId',
      'POST /api/v1/parent/announcements/:announcementId/publish',
      'PATCH /api/v1/parent/profile',
      'POST /api/v1/parent/profile/avatar',
      'POST /api/v1/parent/add-child',
      'GET /api/v1/parent/add-child',
      'GET /api/v1/parent/applicant-portal',
      'POST /api/v1/parent/xp/grants/manual',
      'POST /api/v1/parent/rewards/redeem',
      'GET /api/v1/parent/dashboard',
      'GET /api/v1/parent/global-dashboard',
    ]) {
      expect(routes).not.toContain(absentRoute);
    }
  });

  it('linked parent can read own home', async () => {
    const { accessToken } = await login(parentEmail);

    const home = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/home`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(home.body.parent).toMatchObject({
      userId: parentUserId,
      displayName: 'Mona Parent',
      email: parentEmail,
      phone: null,
    });
    expect(home.body.school).toEqual({
      name: `${testSuffix} Parent Academy`,
      logoUrl: null,
    });
    expect(home.body.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studentId: ownedStudentAId,
          enrollmentId: ownedEnrollmentAId,
        }),
        expect.objectContaining({
          studentId: secondOwnedStudentAId,
          enrollmentId: secondOwnedEnrollmentAId,
        }),
      ]),
    );
    expect(home.body.summaries.childrenCount).toBe(2);
    expect(home.body.schedule).toEqual({
      available: false,
      reason: 'timetable_not_available',
    });
    expect(JSON.stringify(home.body)).not.toContain(crossSchoolLinkedStudentId);
    assertNoForbiddenParentAppFields(home.body);
  });

  it('linked parent can list own current-school children and read owned child detail', async () => {
    const { accessToken } = await login(parentEmail);

    const list = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(list.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studentId: ownedStudentAId,
          displayName: 'Sara Child',
          enrollmentId: ownedEnrollmentAId,
        }),
        expect.objectContaining({
          studentId: secondOwnedStudentAId,
          displayName: 'Omar Child',
          enrollmentId: secondOwnedEnrollmentAId,
        }),
      ]),
    );
    expect(JSON.stringify(list.body)).not.toContain(crossSchoolLinkedStudentId);
    assertNoForbiddenParentAppFields(list.body);

    const detail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(detail.body.student).toMatchObject({
      studentId: ownedStudentAId,
      displayName: 'Sara Child',
      avatarUrl: null,
      status: 'active',
    });
    expect(detail.body.enrollment).toMatchObject({
      enrollmentId: ownedEnrollmentAId,
      academicYearId: academicYearAId,
      termId: termAId,
      classroom: { id: classroomAId },
    });
    expect(detail.body.summaries).toMatchObject({
      attendance: {
        available: false,
        reason: 'detailed_attendance_not_in_this_slice',
      },
      grades: { available: false, reason: 'grades_slice_not_loaded' },
      behavior: { available: false, reason: 'behavior_slice_not_loaded' },
      progress: { available: false, reason: 'progress_slice_not_loaded' },
    });
    expect(detail.body.unsupported).toEqual({
      schedule: true,
      homeworks: true,
      pickup: true,
    });
    assertNoForbiddenParentAppFields(detail.body);
  });

  it('linked parent can read own profile with guardian and current-school child summaries', async () => {
    const { accessToken } = await login(parentEmail);

    const profile = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/profile`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(profile.body.parent).toMatchObject({
      userId: parentUserId,
      displayName: 'Mona Parent',
      firstName: 'Mona',
      lastName: 'Parent',
      email: parentEmail,
      avatarUrl: null,
    });
    expect(profile.body.guardians).toEqual([
      {
        relationship: 'mother',
        isPrimary: true,
      },
    ]);
    expect(profile.body.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studentId: ownedStudentAId,
          enrollmentId: ownedEnrollmentAId,
        }),
        expect.objectContaining({
          studentId: secondOwnedStudentAId,
          enrollmentId: secondOwnedEnrollmentAId,
        }),
      ]),
    );
    expect(profile.body.unsupported).toEqual({
      avatarUpload: true,
      preferences: true,
      supportTickets: true,
      addChild: true,
    });
    expect(JSON.stringify(profile.body)).not.toContain(
      crossSchoolLinkedStudentId,
    );
    assertNoForbiddenParentAppFields(profile.body);
  });

  it('linked parent can read owned child grades and assessment grade detail', async () => {
    const { accessToken } = await login(parentEmail);

    const list = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/grades`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(list.body.child).toMatchObject({
      studentId: ownedStudentAId,
      enrollmentId: ownedEnrollmentAId,
    });
    expect(list.body.assessments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assessmentId: ownedAssessmentAId,
          subjectId: subjectAId,
          score: 8,
          maxScore: 10,
        }),
      ]),
    );
    expect(JSON.stringify(list.body)).not.toContain(draftAssessmentAId);
    assertNoForbiddenParentAppFields(list.body);

    const summary = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/grades/summary`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(summary.body.summary).toMatchObject({
      totalEarned: 8,
      totalMax: 10,
      percentage: 80,
    });
    assertNoForbiddenParentAppFields(summary.body);

    const detail = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/grades/assessments/${ownedAssessmentAId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(detail.body.assessment).toMatchObject({
      assessmentId: ownedAssessmentAId,
      subject: { subjectId: subjectAId },
      status: 'published',
    });
    expect(detail.body.grade).toMatchObject({
      score: 8,
      maxScore: 10,
      percent: 80,
    });
    assertNoForbiddenParentAppFields(detail.body);
    assertNoAnswerKeysOrCorrectAnswers(detail.body);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/grades/assessments/${draftAssessmentAId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('linked parent can read owned child behavior list, summary, and detail', async () => {
    const { accessToken } = await login(parentEmail);

    const list = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/behavior`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(list.body.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: positiveBehaviorRecordAId,
          type: 'positive',
          points: 5,
          status: 'approved',
        }),
        expect.objectContaining({
          id: negativeBehaviorRecordAId,
          type: 'negative',
          points: -2,
          status: 'approved',
        }),
      ]),
    );
    expect(list.body.summary).toMatchObject({
      positiveCount: 1,
      negativeCount: 1,
      positivePoints: 5,
      negativePoints: -2,
      totalBehaviorPoints: 3,
    });
    expect(JSON.stringify(list.body.summary)).not.toContain('xp');
    expect(JSON.stringify(list.body)).not.toContain('attendance:');
    assertNoForbiddenParentAppFields(list.body);

    const summary = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/behavior/summary`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(summary.body.summary).toMatchObject({
      positivePoints: 5,
      negativePoints: -2,
      totalBehaviorPoints: 3,
    });
    assertNoForbiddenParentAppFields(summary.body);

    const detail = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/behavior/${positiveBehaviorRecordAId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(detail.body).toMatchObject({
      id: positiveBehaviorRecordAId,
      type: 'positive',
      points: 5,
      status: 'approved',
    });
    assertNoForbiddenParentAppFields(detail.body);

    const discipline = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/discipline`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(discipline.body.child).toMatchObject({
      studentId: ownedStudentAId,
      enrollmentId: ownedEnrollmentAId,
    });
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
        }),
        expect.objectContaining({
          id: `behavior:${positiveBehaviorRecordAId}`,
          sourceType: 'behavior',
          itemType: 'positive',
          status: 'approved',
          pointsDelta: 5,
        }),
        expect.objectContaining({
          id: `behavior:${negativeBehaviorRecordAId}`,
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
      positiveCount: 1,
      negativeCount: 1,
      behaviorPoints: 3,
      totalIncidents: 4,
    });
    expect(JSON.stringify(discipline.body)).not.toContain('reviewedById');
    expect(JSON.stringify(discipline.body)).not.toContain('submittedById');
    expect(JSON.stringify(discipline.body)).not.toContain('markedById');
    assertNoForbiddenParentAppFields(discipline.body);

    const disciplineSummary = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/discipline/summary`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(disciplineSummary.body.child).toMatchObject({
      studentId: ownedStudentAId,
      enrollmentId: ownedEnrollmentAId,
    });
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
    assertNoForbiddenParentAppFields(disciplineSummary.body);
  });

  it('linked parent can read owned child progress overview, academic, behavior, and XP', async () => {
    const { accessToken } = await login(parentEmail);

    const overview = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/progress`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(overview.body.academic.summary).toMatchObject({
      totalEarned: 8,
      totalMax: 10,
      percentage: 80,
    });
    expect(overview.body.behavior.summary).toMatchObject({
      totalBehaviorPoints: 3,
    });
    expect(overview.body.xp).toMatchObject({
      totalXp: 25,
      currentLevel: null,
      rank: null,
      tier: null,
    });
    expect(overview.body.unsupported).toEqual({
      rank: true,
      tier: true,
      level: true,
    });
    assertNoForbiddenParentAppFields(overview.body);

    const academic = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/progress/academic`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(academic.body.summary.percentage).toBe(80);

    const behavior = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/progress/behavior`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(behavior.body.summary.totalBehaviorPoints).toBe(3);
    expect(JSON.stringify(behavior.body)).not.toContain('totalXp');
    expect(JSON.stringify(behavior.body)).not.toContain('total_xp');

    const xp = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/progress/xp`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(xp.body.totalXp).toBe(25);
  });

  it('linked parent can read owned child reports list and summary', async () => {
    const { accessToken } = await login(parentEmail);

    const list = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/reports`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(list.body.reports).toEqual([
      expect.objectContaining({
        reportId: 'current-term-performance',
        type: 'performance',
        source: 'derived_current_school_data',
        summary: expect.objectContaining({
          disciplinePercentage: 33.33,
          discipline: expect.objectContaining({
            attendanceIncidentCount: 2,
            absenceCount: 1,
            lateCount: 1,
            positiveCount: 1,
            negativeCount: 1,
            behaviorPoints: 3,
            totalIncidents: 4,
          }),
        }),
      }),
    ]);
    expect(JSON.stringify(list.body)).not.toContain('disciplineScore');
    expect(JSON.stringify(list.body)).not.toContain(
      'combinedDisciplinePercentage',
    );
    expect(list.body.unavailable).toMatchObject({
      reportEngine: { available: false },
      pdfExport: { available: false },
      templates: { available: false },
      schedule: { available: false },
      homework: { available: false },
      pickup: { available: false },
    });
    assertNoForbiddenParentAppFields(list.body);

    const summary = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/reports/summary`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(summary.body).toMatchObject({
      academic: { percentage: 80 },
      behavior: { totalBehaviorPoints: 3 },
      attendance: {
        disciplinePercentage: 33.33,
        discipline_percentage: 33.33,
      },
      discipline: {
        attendanceIncidentCount: 2,
        absenceCount: 1,
        lateCount: 1,
        positiveCount: 1,
        negativeCount: 1,
        behaviorPoints: 3,
        totalIncidents: 4,
      },
      xp: { totalXp: 25 },
      unavailable: {
        reportEngine: { available: false },
        schedule: { available: false },
        homework: { available: false },
        pickup: { available: false },
      },
    });
    expect(JSON.stringify(summary.body)).not.toContain('disciplineScore');
    expect(JSON.stringify(summary.body)).not.toContain(
      'combinedDisciplinePercentage',
    );
    assertNoForbiddenParentAppFields(summary.body);
  });

  it('linked parent can read owned child tasks and submissions only', async () => {
    const { accessToken } = await login(parentEmail);

    const list = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/tasks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(list.body.child).toMatchObject({
      studentId: ownedStudentAId,
    });
    expect(list.body.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taskId: ownedTaskAId,
          status: 'under_review',
          progressPercent: 50,
          stageCount: 1,
          submissionStatus: 'submitted',
          reviewStatus: 'pending_review',
        }),
      ]),
    );
    expect(JSON.stringify(list.body)).not.toContain(sameSchoolUnlinkedTaskAId);
    expect(JSON.stringify(list.body)).not.toContain(crossSchoolTaskId);
    assertNoForbiddenParentTaskFields(list.body);
    assertNoForbiddenParentAppFields(list.body);

    const summary = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/tasks/summary`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(summary.body.summary).toMatchObject({
      total: 1,
      activeCount: 1,
      underReview: 1,
      completionRate: 0,
    });
    assertNoForbiddenParentTaskFields(summary.body);
    assertNoForbiddenParentAppFields(summary.body);

    const detail = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/tasks/${ownedTaskAId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(detail.body.task).toMatchObject({
      taskId: ownedTaskAId,
      title: `${testSuffix} Parent Task owned`,
      status: 'under_review',
      reward: {
        type: 'moral',
        label: 'Visible reward',
      },
    });
    expect(detail.body.task.stages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stageId: ownedTaskStageAId,
          proofType: 'image',
          submission: expect.objectContaining({
            submissionId: ownedTaskSubmissionAId,
            stageId: ownedTaskStageAId,
            proofFile: expect.objectContaining({
              fileId: ownedTaskProofFileAId,
              filename: `${testSuffix}-owned-proof.png`,
              originalName: `${testSuffix}-owned-proof.png`,
              mimeType: 'image/png',
              visibility: 'private',
              createdAt: expect.any(String),
              downloadPath: `${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/files/${ownedTaskProofFileAId}/download`,
            }),
          }),
        }),
      ]),
    );
    assertNoForbiddenParentTaskFields(detail.body);
    assertNoForbiddenParentAppFields(detail.body);

    const proofDownload = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/files/${ownedTaskProofFileAId}/download`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .redirects(0)
      .expect(307);

    expect(proofDownload.headers.location).toEqual(expect.any(String));
    expect(proofDownload.headers.location).toContain('X-Amz-Expires=300');

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/files/${ownedTaskProofFileAId}/download`)
      .set('Authorization', `Bearer ${accessToken}`)
      .redirects(0)
      .expect(403);

    for (const blockedRoute of [
      `${GLOBAL_PREFIX}/parent/children/${sameSchoolUnlinkedStudentId}/files/${sameSchoolUnlinkedTaskProofFileAId}/download`,
      `${GLOBAL_PREFIX}/parent/children/${crossSchoolLinkedStudentId}/files/${crossSchoolTaskProofFileId}/download`,
      `${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/files/${secondOwnedTaskProofFileAId}/download`,
      `${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/files/${arbitraryPrivateFileAId}/download`,
    ]) {
      await request(app.getHttpServer())
        .get(blockedRoute)
        .set('Authorization', `Bearer ${accessToken}`)
        .redirects(0)
        .expect(404);
    }

    for (const actorEmail of [adminEmail, teacherEmail, studentEmail]) {
      const actor = await login(actorEmail);
      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/files/${ownedTaskProofFileAId}/download`,
        )
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .redirects(0)
        .expect(403);
    }

    const submissions = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/tasks/${ownedTaskAId}/submissions`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(submissions.body.submissions).toEqual([
      expect.objectContaining({
        submissionId: ownedTaskSubmissionAId,
        stageId: ownedTaskStageAId,
        status: 'submitted',
      }),
    ]);
    expect(JSON.stringify(submissions.body)).not.toContain(
      sameSchoolUnlinkedTaskSubmissionAId,
    );
    expect(JSON.stringify(submissions.body)).not.toContain(
      crossSchoolTaskSubmissionId,
    );
    assertNoForbiddenParentTaskFields(submissions.body);
    assertNoForbiddenParentAppFields(submissions.body);

    const submissionDetail = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/tasks/${ownedTaskAId}/submissions/${ownedTaskSubmissionAId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(submissionDetail.body.submission).toMatchObject({
      submissionId: ownedTaskSubmissionAId,
      stageId: ownedTaskStageAId,
      status: 'submitted',
      proofText: 'Visible parent proof',
    });
    assertNoForbiddenParentTaskFields(submissionDetail.body);
    assertNoForbiddenParentAppFields(submissionDetail.body);

    for (const inaccessibleTaskId of [
      sameSchoolUnlinkedTaskAId,
      crossSchoolTaskId,
    ]) {
      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/tasks/${inaccessibleTaskId}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    }
  });

  it('linked parent can use only own existing message conversations', async () => {
    const { accessToken } = await login(parentEmail);

    const list = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/messages/conversations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(list.body.conversations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conversationId: ownConversationAId,
          status: 'active',
        }),
      ]),
    );
    expect(JSON.stringify(list.body)).not.toContain(
      nonParticipantConversationAId,
    );
    expect(JSON.stringify(list.body)).not.toContain(crossSchoolConversationId);
    assertNoForbiddenParentAppFields(list.body);

    const detail = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/messages/conversations/${ownConversationAId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(detail.body.conversation).toMatchObject({
      conversationId: ownConversationAId,
      participantsCount: 2,
    });
    expect(detail.body.conversation.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: parentUserId,
          isMe: true,
        }),
      ]),
    );
    assertNoForbiddenParentAppFields(detail.body);

    const messages = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/messages/conversations/${ownConversationAId}/messages`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const hiddenMessage = messages.body.messages.find(
      (message: { messageId: string }) =>
        message.messageId === ownConversationHiddenMessageAId,
    );
    expect(hiddenMessage).toMatchObject({
      body: null,
      content: null,
      text: null,
      status: 'hidden',
    });
    assertNoForbiddenParentAppFields(messages.body);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/parent/messages/conversations/${ownConversationAId}/messages`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ body: 'This should fail', attachmentId: ownedTaskAId })
      .expect(400);

    const sent = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/parent/messages/conversations/${ownConversationAId}/messages`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ body: 'Parent closeout reply' })
      .expect(201);

    expect(sent.body.message).toMatchObject({
      body: 'Parent closeout reply',
      type: 'text',
      status: 'sent',
      sender: expect.objectContaining({
        userId: parentUserId,
        isMe: true,
      }),
    });
    assertNoForbiddenParentAppFields(sent.body);

    const read = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/parent/messages/conversations/${ownConversationAId}/read`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);

    expect(read.body).toMatchObject({
      conversationId: ownConversationAId,
    });
    assertNoForbiddenParentAppFields(read.body);

    for (const inaccessibleConversationId of [
      nonParticipantConversationAId,
      crossSchoolConversationId,
    ]) {
      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/parent/messages/conversations/${inaccessibleConversationId}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/parent/messages/conversations/${inaccessibleConversationId}/messages`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .post(
          `${GLOBAL_PREFIX}/parent/messages/conversations/${inaccessibleConversationId}/messages`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ body: 'Nope' })
        .expect(404);
      await request(app.getHttpServer())
        .post(
          `${GLOBAL_PREFIX}/parent/messages/conversations/${inaccessibleConversationId}/read`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(404);
    }
  });

  it('linked parent can read only audience-matched announcements and safe attachments', async () => {
    const { accessToken } = await login(parentEmail);

    const list = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/announcements`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(list.body.announcements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          announcementId: audienceAnnouncementAId,
          title: `${testSuffix} Parent Announcement visible`,
        }),
      ]),
    );
    expect(JSON.stringify(list.body)).not.toContain(
      outOfAudienceAnnouncementAId,
    );
    expect(JSON.stringify(list.body)).not.toContain(crossSchoolAnnouncementId);
    assertNoForbiddenParentAppFields(list.body);

    const detail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/announcements/${audienceAnnouncementAId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(detail.body.announcement).toMatchObject({
      announcementId: audienceAnnouncementAId,
      title: `${testSuffix} Parent Announcement visible`,
      category: 'closeout',
      attachmentsCount: 1,
    });
    assertNoForbiddenParentAppFields(detail.body);

    const read = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/parent/announcements/${audienceAnnouncementAId}/read`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);

    expect(read.body).toMatchObject({
      announcementId: audienceAnnouncementAId,
    });
    assertNoForbiddenParentAppFields(read.body);

    const attachments = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/announcements/${audienceAnnouncementAId}/attachments`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(attachments.body.attachments).toEqual([
      expect.objectContaining({
        filename: `${testSuffix}-announcement.pdf`,
        mimeType: 'application/pdf',
      }),
    ]);
    expect(attachments.body.attachments[0]).toEqual(
      expect.objectContaining({
        fileId: expect.any(String),
        filename: `${testSuffix}-announcement.pdf`,
        mimeType: 'application/pdf',
        size: '2048',
      }),
    );
    expect(Object.keys(attachments.body.attachments[0]).sort()).toEqual([
      'fileId',
      'filename',
      'mimeType',
      'size',
    ]);
    assertNoForbiddenParentAppFields(attachments.body);

    for (const inaccessibleAnnouncementId of [
      outOfAudienceAnnouncementAId,
      crossSchoolAnnouncementId,
    ]) {
      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/parent/announcements/${inaccessibleAnnouncementId}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .post(
          `${GLOBAL_PREFIX}/parent/announcements/${inaccessibleAnnouncementId}/read`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(404);
      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/parent/announcements/${inaccessibleAnnouncementId}/attachments`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    }
  });

  it('returns safe 404 for same-school unlinked and cross-school child details', async () => {
    const { accessToken } = await login(parentEmail);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children/${sameSchoolUnlinkedStudentId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children/${crossSchoolLinkedStudentId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    for (const childId of [
      sameSchoolUnlinkedStudentId,
      crossSchoolLinkedStudentId,
    ]) {
      for (const path of [
        'grades',
        'grades/summary',
        `grades/assessments/${ownedAssessmentAId}`,
        'behavior',
        'behavior/summary',
        `behavior/${positiveBehaviorRecordAId}`,
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
        'rewards',
        'rewards/redemptions',
        'reports',
        'reports/summary',
        'tasks',
        'tasks/summary',
        `tasks/${ownedTaskAId}`,
        `tasks/${ownedTaskAId}/submissions`,
        `tasks/${ownedTaskAId}/submissions/${ownedTaskSubmissionAId}`,
      ]) {
        await request(app.getHttpServer())
          .get(`${GLOBAL_PREFIX}/parent/children/${childId}/${path}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(404);
      }
    }
  });

  it('forbids school admin, teacher, and student actors on Parent App routes', async () => {
    for (const email of [adminEmail, teacherEmail, studentEmail]) {
      const { accessToken } = await login(email);

      for (const path of [
        'home',
        'children',
        `children/${ownedStudentAId}`,
        `children/${ownedStudentAId}/grades`,
        `children/${ownedStudentAId}/grades/summary`,
        `children/${ownedStudentAId}/grades/assessments/${ownedAssessmentAId}`,
        `children/${ownedStudentAId}/behavior`,
        `children/${ownedStudentAId}/behavior/summary`,
        `children/${ownedStudentAId}/behavior/${positiveBehaviorRecordAId}`,
        `children/${ownedStudentAId}/discipline`,
        `children/${ownedStudentAId}/discipline/summary`,
        `children/${ownedStudentAId}/progress`,
        `children/${ownedStudentAId}/progress/academic`,
        `children/${ownedStudentAId}/progress/behavior`,
        `children/${ownedStudentAId}/progress/xp`,
        `children/${ownedStudentAId}/hero`,
        `children/${ownedStudentAId}/hero/progress`,
        `children/${ownedStudentAId}/hero/badges`,
        `children/${ownedStudentAId}/hero/missions`,
        `children/${ownedStudentAId}/rewards`,
        `children/${ownedStudentAId}/rewards/redemptions`,
        `children/${ownedStudentAId}/reports`,
        `children/${ownedStudentAId}/reports/summary`,
        `children/${ownedStudentAId}/tasks`,
        `children/${ownedStudentAId}/tasks/summary`,
        `children/${ownedStudentAId}/tasks/${ownedTaskAId}`,
        `children/${ownedStudentAId}/tasks/${ownedTaskAId}/submissions`,
        `children/${ownedStudentAId}/tasks/${ownedTaskAId}/submissions/${ownedTaskSubmissionAId}`,
        'messages/conversations',
        `messages/conversations/${ownConversationAId}`,
        `messages/conversations/${ownConversationAId}/messages`,
        'announcements',
        `announcements/${audienceAnnouncementAId}`,
        `announcements/${audienceAnnouncementAId}/attachments`,
        'profile',
      ]) {
        await request(app.getHttpServer())
          .get(`${GLOBAL_PREFIX}/parent/${path}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(403);
      }

      for (const route of [
        {
          path: `messages/conversations/${ownConversationAId}/messages`,
          body: { body: 'Forbidden actor' },
        },
        {
          path: `messages/conversations/${ownConversationAId}/read`,
          body: {},
        },
        {
          path: `announcements/${audienceAnnouncementAId}/read`,
          body: {},
        },
      ]) {
        await request(app.getHttpServer())
          .post(`${GLOBAL_PREFIX}/parent/${route.path}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send(route.body)
          .expect(403);
      }
    }
  });

  it('does not expose mutation, avatar upload, add-child, or deferred Parent App routes', async () => {
    const { accessToken } = await login(parentEmail);
    const initialXpLedgerCount = await prisma.xpLedger.count({
      where: { schoolId: schoolAId },
    });
    const initialRewardRedemptionCount = await prisma.rewardRedemption.count({
      where: { schoolId: schoolAId },
    });

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/parent/profile`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ firstName: 'Changed' })
      .expect(404);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/profile/avatar`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(404);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/children`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(404);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/add-child`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(404);

    for (const path of [
      `children/${ownedStudentAId}/grades`,
      `children/${ownedStudentAId}/behavior`,
      `children/${ownedStudentAId}/discipline`,
      `children/${ownedStudentAId}/progress`,
      `children/${ownedStudentAId}/reports`,
    ]) {
      for (const method of ['post', 'put', 'patch', 'delete'] as const) {
        await request(app.getHttpServer())
          [method](`${GLOBAL_PREFIX}/parent/${path}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({})
          .expect(404);
      }
    }

    for (const path of [
      'schedule',
      'homework',
      'homeworks',
      'pickup',
      'messages',
      'notifications',
      'grades',
      'behavior',
      'progress',
      'reports',
      'tasks',
      'applicant-portal',
      'add-child',
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/parent/${path}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    }

    for (const path of [
      'schedule',
      'homework',
      'pickup',
      'messages',
      'notifications',
      'applicant-portal',
      'add-child',
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/${path}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    }

    for (const route of [
      { method: 'get' as const, path: 'messages/contacts' },
      { method: 'post' as const, path: 'messages/conversations' },
      {
        method: 'post' as const,
        path: `messages/conversations/${ownConversationAId}/attachments`,
      },
      {
        method: 'post' as const,
        path: `messages/conversations/${ownConversationAId}/audio`,
      },
      {
        method: 'post' as const,
        path: `children/${ownedStudentAId}/tasks`,
      },
      {
        method: 'patch' as const,
        path: `children/${ownedStudentAId}/tasks/${ownedTaskAId}`,
      },
      {
        method: 'post' as const,
        path: `children/${ownedStudentAId}/tasks/${ownedTaskAId}/cancel`,
      },
      {
        method: 'post' as const,
        path: `children/${ownedStudentAId}/tasks/${ownedTaskAId}/submit`,
      },
      {
        method: 'post' as const,
        path: `children/${ownedStudentAId}/tasks/${ownedTaskAId}/stages/${ownedTaskStageAId}/submit`,
      },
      {
        method: 'post' as const,
        path: `children/${ownedStudentAId}/tasks/${ownedTaskAId}/review`,
      },
      {
        method: 'post' as const,
        path: `children/${ownedStudentAId}/tasks/${ownedTaskAId}/approve`,
      },
      {
        method: 'post' as const,
        path: `children/${ownedStudentAId}/tasks/${ownedTaskAId}/reject`,
      },
      {
        method: 'post' as const,
        path: `children/${ownedStudentAId}/tasks/${ownedTaskAId}/complete`,
      },
      {
        method: 'post' as const,
        path: `children/${ownedStudentAId}/homeworks/f0000000-0000-4000-8000-000000000010/submission/save`,
      },
      {
        method: 'post' as const,
        path: `children/${ownedStudentAId}/homeworks/f0000000-0000-4000-8000-000000000010/submission/submit`,
      },
      {
        method: 'post' as const,
        path: `children/${ownedStudentAId}/homeworks/f0000000-0000-4000-8000-000000000010/submit`,
      },
      {
        method: 'patch' as const,
        path: `children/${ownedStudentAId}/homeworks/f0000000-0000-4000-8000-000000000010`,
      },
      {
        method: 'post' as const,
        path: `children/${ownedStudentAId}/grades`,
      },
      {
        method: 'post' as const,
        path: `children/${ownedStudentAId}/grades/assessments/${ownedAssessmentAId}/submission/submit`,
      },
      {
        method: 'post' as const,
        path: `children/${ownedStudentAId}/exams/${ownedAssessmentAId}/submission/submit`,
      },
      {
        method: 'post' as const,
        path: `children/${ownedStudentAId}/exams/${ownedAssessmentAId}/submit`,
      },
      {
        method: 'post' as const,
        path: `children/${ownedStudentAId}/attendance`,
      },
      {
        method: 'patch' as const,
        path: `children/${ownedStudentAId}/attendance/f0000000-0000-4000-8000-000000000011`,
      },
      {
        method: 'post' as const,
        path: `children/${ownedStudentAId}/behavior`,
      },
      {
        method: 'post' as const,
        path: `children/${ownedStudentAId}/behavior/${positiveBehaviorRecordAId}/approve`,
      },
      {
        method: 'post' as const,
        path: `children/${ownedStudentAId}/discipline`,
      },
      {
        method: 'post' as const,
        path: `children/${ownedStudentAId}/reports/generate`,
      },
      { method: 'post' as const, path: 'announcements' },
      {
        method: 'patch' as const,
        path: `announcements/${audienceAnnouncementAId}`,
      },
      {
        method: 'post' as const,
        path: `announcements/${audienceAnnouncementAId}/publish`,
      },
      {
        method: 'post' as const,
        path: `announcements/${audienceAnnouncementAId}/archive`,
      },
      {
        method: 'post' as const,
        path: `announcements/${audienceAnnouncementAId}/cancel`,
      },
      {
        method: 'get' as const,
        path: 'schedule',
      },
      {
        method: 'get' as const,
        path: 'homework',
      },
      {
        method: 'get' as const,
        path: 'pickup',
      },
      {
        method: 'get' as const,
        path: 'applicant-portal',
      },
      {
        method: 'post' as const,
        path: 'add-child',
      },
    ]) {
      await request(app.getHttpServer())
        [route.method](`${GLOBAL_PREFIX}/parent/${route.path}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(404);
    }

    expect(
      await prisma.xpLedger.count({ where: { schoolId: schoolAId } }),
    ).toBe(initialXpLedgerCount);
    expect(
      await prisma.rewardRedemption.count({ where: { schoolId: schoolAId } }),
    ).toBe(initialRewardRedemptionCount);
  });

  async function createParentAppSprint9EFixture(params: {
    crossSchoolAcademicYearId: string;
    crossSchoolTermId: string;
    crossSchoolClassroomId: string;
  }): Promise<{
    ownedTaskId: string;
    ownedTaskStageId: string;
    ownedTaskSubmissionId: string;
    ownedTaskProofFileId: string;
    secondOwnedTaskProofFileId: string;
    sameSchoolUnlinkedTaskId: string;
    sameSchoolUnlinkedTaskSubmissionId: string;
    sameSchoolUnlinkedTaskProofFileId: string;
    crossSchoolTaskId: string;
    crossSchoolTaskSubmissionId: string;
    crossSchoolTaskProofFileId: string;
    arbitraryPrivateFileId: string;
    ownConversationId: string;
    ownConversationHiddenMessageId: string;
    nonParticipantConversationId: string;
    crossSchoolConversationId: string;
    audienceAnnouncementId: string;
    outOfAudienceAnnouncementId: string;
    crossSchoolAnnouncementId: string;
  }> {
    const ownedTask = await createReinforcementTaskForStudent({
      marker: 'owned',
      schoolId: schoolAId,
      academicYearId: academicYearAId,
      termId: termAId,
      subjectId: subjectAId,
      studentId: ownedStudentAId,
      enrollmentId: ownedEnrollmentAId,
      status: ReinforcementTaskStatus.UNDER_REVIEW,
    });
    const secondOwnedTask = await createReinforcementTaskForStudent({
      marker: 'second-owned',
      schoolId: schoolAId,
      academicYearId: academicYearAId,
      termId: termAId,
      subjectId: subjectAId,
      studentId: secondOwnedStudentAId,
      enrollmentId: secondOwnedEnrollmentAId,
      status: ReinforcementTaskStatus.UNDER_REVIEW,
    });
    const sameSchoolUnlinkedTask = await createReinforcementTaskForStudent({
      marker: 'unlinked',
      schoolId: schoolAId,
      academicYearId: academicYearAId,
      termId: termAId,
      subjectId: subjectAId,
      studentId: sameSchoolUnlinkedStudentId,
      enrollmentId: sameSchoolUnlinkedEnrollmentId,
      status: ReinforcementTaskStatus.UNDER_REVIEW,
    });
    const crossSchoolTask = await createReinforcementTaskForStudent({
      marker: 'cross-school',
      schoolId: schoolBId,
      academicYearId: params.crossSchoolAcademicYearId,
      termId: params.crossSchoolTermId,
      subjectId: null,
      studentId: crossSchoolLinkedStudentId,
      enrollmentId: crossSchoolLinkedEnrollmentId,
      status: ReinforcementTaskStatus.UNDER_REVIEW,
    });
    const arbitraryPrivateFileId = await createFile({
      marker: 'parent-arbitrary-private',
      schoolId: schoolAId,
      organizationId: organizationAId,
      originalName: `${testSuffix}-arbitrary-private.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: 512,
    });

    const ownConversationId = await createConversation({
      marker: 'own',
      schoolId: schoolAId,
      type: CommunicationConversationType.DIRECT,
      participants: [teacherUserId, parentUserId],
    });
    await createConversationMessage({
      conversationId: ownConversationId,
      schoolId: schoolAId,
      senderUserId: teacherUserId,
      body: 'Visible parent message',
      status: CommunicationMessageStatus.SENT,
      sentAt: new Date('2026-10-13T08:00:00.000Z'),
    });
    const hiddenMessageId = await createConversationMessage({
      conversationId: ownConversationId,
      schoolId: schoolAId,
      senderUserId: teacherUserId,
      body: 'Hidden message body should not leak',
      status: CommunicationMessageStatus.HIDDEN,
      sentAt: new Date('2026-10-13T09:00:00.000Z'),
    });

    const nonParticipantConversationId = await createConversation({
      marker: 'non-participant',
      schoolId: schoolAId,
      type: CommunicationConversationType.DIRECT,
      participants: [teacherUserId, adminUserId],
    });
    await createConversationMessage({
      conversationId: nonParticipantConversationId,
      schoolId: schoolAId,
      senderUserId: teacherUserId,
      body: 'Non participant message',
      status: CommunicationMessageStatus.SENT,
      sentAt: new Date('2026-10-13T10:00:00.000Z'),
    });

    const crossSchoolConversationId = await createConversation({
      marker: 'cross-school',
      schoolId: schoolBId,
      type: CommunicationConversationType.DIRECT,
      participants: [teacherUserId, parentUserId],
    });
    await createConversationMessage({
      conversationId: crossSchoolConversationId,
      schoolId: schoolBId,
      senderUserId: parentUserId,
      body: 'Cross school message',
      status: CommunicationMessageStatus.SENT,
      sentAt: new Date('2026-10-13T11:00:00.000Z'),
    });

    const audienceAnnouncementId = await createAnnouncement({
      marker: 'visible',
      schoolId: schoolAId,
      title: `${testSuffix} Parent Announcement visible`,
      body: 'Visible parent announcement body',
      audienceType: CommunicationAnnouncementAudienceType.CLASSROOM,
      classroomId: classroomAId,
      withAttachment: true,
    });
    const outOfAudienceAnnouncementId = await createAnnouncement({
      marker: 'out-of-audience',
      schoolId: schoolAId,
      title: `${testSuffix} Parent Announcement hidden`,
      body: 'Hidden parent announcement body',
      audienceType: CommunicationAnnouncementAudienceType.CUSTOM,
      userId: adminUserId,
      withAttachment: false,
    });
    const crossSchoolAnnouncementId = await createAnnouncement({
      marker: 'cross-school',
      schoolId: schoolBId,
      title: `${testSuffix} Parent Announcement cross`,
      body: 'Cross school parent announcement body',
      audienceType: CommunicationAnnouncementAudienceType.SCHOOL,
      withAttachment: false,
    });

    void params.crossSchoolClassroomId;

    return {
      ownedTaskId: ownedTask.taskId,
      ownedTaskStageId: ownedTask.stageId,
      ownedTaskSubmissionId: ownedTask.submissionId,
      ownedTaskProofFileId: ownedTask.proofFileId,
      secondOwnedTaskProofFileId: secondOwnedTask.proofFileId,
      sameSchoolUnlinkedTaskId: sameSchoolUnlinkedTask.taskId,
      sameSchoolUnlinkedTaskSubmissionId: sameSchoolUnlinkedTask.submissionId,
      sameSchoolUnlinkedTaskProofFileId: sameSchoolUnlinkedTask.proofFileId,
      crossSchoolTaskId: crossSchoolTask.taskId,
      crossSchoolTaskSubmissionId: crossSchoolTask.submissionId,
      crossSchoolTaskProofFileId: crossSchoolTask.proofFileId,
      arbitraryPrivateFileId,
      ownConversationId,
      ownConversationHiddenMessageId: hiddenMessageId,
      nonParticipantConversationId,
      crossSchoolConversationId,
      audienceAnnouncementId,
      outOfAudienceAnnouncementId,
      crossSchoolAnnouncementId,
    };
  }

  async function createFile(params: {
    marker: string;
    schoolId: string;
    organizationId: string | null;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
  }): Promise<string> {
    const bucket = `${testSuffix}-private`;
    const objectKey = `${params.marker}/raw-object-key`;
    if (storageService) {
      await saveTestObject({
        bucket,
        objectKey,
        mimeType: params.mimeType,
      });
    }

    const file = await prisma.file.create({
      data: {
        organizationId: params.organizationId,
        schoolId: params.schoolId,
        uploaderId: teacherUserId,
        bucket,
        objectKey,
        originalName: params.originalName,
        mimeType: params.mimeType,
        sizeBytes: BigInt(params.sizeBytes),
        visibility: FileVisibility.PRIVATE,
      },
      select: { id: true },
    });
    createdFileIds.push(file.id);

    return file.id;
  }

  async function ensureCreatedFileObjects(): Promise<void> {
    const files = await prisma.file.findMany({
      where: { id: { in: createdFileIds } },
      select: { bucket: true, objectKey: true, mimeType: true },
    });

    for (const file of files) {
      await saveTestObject({
        bucket: file.bucket,
        objectKey: file.objectKey,
        mimeType: file.mimeType,
      });
    }
  }

  async function saveTestObject(params: {
    bucket: string;
    objectKey: string;
    mimeType: string;
  }): Promise<void> {
    if (!storageService) return;

    await storageService.saveObject({
      bucket: params.bucket,
      objectKey: params.objectKey,
      body: Buffer.from(`${testSuffix}:${params.objectKey}`),
      visibility: FileVisibility.PRIVATE,
      contentType: params.mimeType,
    });

    const storedObjectKey = `${params.bucket}\0${params.objectKey}`;
    if (!createdStoredObjectKeys.has(storedObjectKey)) {
      createdStoredObjectKeys.add(storedObjectKey);
      createdStoredObjects.push({
        bucket: params.bucket,
        objectKey: params.objectKey,
      });
    }
  }

  async function createReinforcementTaskForStudent(params: {
    marker: string;
    schoolId: string;
    academicYearId: string;
    termId: string;
    subjectId: string | null;
    studentId: string;
    enrollmentId: string;
    status: ReinforcementTaskStatus;
  }): Promise<{
    taskId: string;
    stageId: string;
    submissionId: string;
    proofFileId: string;
  }> {
    const proofFileId = await createFile({
      marker: `task-proof-${params.marker}`,
      schoolId: params.schoolId,
      organizationId:
        params.schoolId === schoolAId ? organizationAId : organizationBId,
      originalName: `${testSuffix}-${params.marker}-proof.png`,
      mimeType: 'image/png',
      sizeBytes: 1024,
    });

    const task = await prisma.reinforcementTask.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        termId: params.termId,
        subjectId: params.subjectId,
        titleEn: `${testSuffix} Parent Task ${params.marker}`,
        descriptionEn: `Visible ${params.marker} task description`,
        source: ReinforcementSource.TEACHER,
        status: params.status,
        rewardType: ReinforcementRewardType.MORAL,
        rewardLabelEn: 'Visible reward',
        rewardValue: '5.00',
        dueDate: new Date('2026-12-01T00:00:00.000Z'),
        assignedById: teacherUserId,
        assignedByName: 'Teacher Sender',
        createdById: teacherUserId,
        metadata: { private: 'hidden-task-metadata' },
      },
      select: { id: true },
    });
    createdReinforcementTaskIds.push(task.id);

    const target = await prisma.reinforcementTaskTarget.create({
      data: {
        schoolId: params.schoolId,
        taskId: task.id,
        scopeType: ReinforcementTargetScope.STUDENT,
        scopeKey: params.studentId,
        studentId: params.studentId,
      },
      select: { id: true },
    });
    createdReinforcementTargetIds.push(target.id);

    const assignment = await prisma.reinforcementAssignment.create({
      data: {
        schoolId: params.schoolId,
        taskId: task.id,
        academicYearId: params.academicYearId,
        termId: params.termId,
        studentId: params.studentId,
        enrollmentId: params.enrollmentId,
        status: params.status,
        progress: 50,
        assignedAt: new Date('2026-10-12T08:00:00.000Z'),
        startedAt: new Date('2026-10-12T09:00:00.000Z'),
        metadata: { private: 'hidden-assignment-metadata' },
      },
      select: { id: true },
    });
    createdReinforcementAssignmentIds.push(assignment.id);

    const stage = await prisma.reinforcementTaskStage.create({
      data: {
        schoolId: params.schoolId,
        taskId: task.id,
        sortOrder: 1,
        titleEn: `${testSuffix} Stage ${params.marker}`,
        descriptionEn: 'Visible stage description',
        proofType: ReinforcementProofType.IMAGE,
        requiresApproval: true,
        metadata: { private: 'hidden-stage-metadata' },
      },
      select: { id: true },
    });
    createdReinforcementStageIds.push(stage.id);

    const submission = await prisma.reinforcementSubmission.create({
      data: {
        schoolId: params.schoolId,
        assignmentId: assignment.id,
        taskId: task.id,
        stageId: stage.id,
        studentId: params.studentId,
        enrollmentId: params.enrollmentId,
        status: ReinforcementSubmissionStatus.SUBMITTED,
        proofFileId,
        proofText: 'Visible parent proof',
        submittedById: studentUserId,
        submittedAt: new Date('2026-10-12T10:00:00.000Z'),
        metadata: { private: 'hidden-submission-metadata' },
      },
      select: { id: true },
    });
    createdReinforcementSubmissionIds.push(submission.id);

    return {
      taskId: task.id,
      stageId: stage.id,
      submissionId: submission.id,
      proofFileId,
    };
  }

  async function createConversation(params: {
    marker: string;
    schoolId: string;
    type: CommunicationConversationType;
    participants: string[];
  }): Promise<string> {
    const conversation = await prisma.communicationConversation.create({
      data: {
        schoolId: params.schoolId,
        type: params.type,
        status: CommunicationConversationStatus.ACTIVE,
        titleEn: `${testSuffix} Conversation ${params.marker}`,
        descriptionEn: `Visible conversation ${params.marker}`,
        createdById: teacherUserId,
        metadata: { private: 'hidden-conversation-metadata' },
      },
      select: { id: true },
    });
    createdCommunicationConversationIds.push(conversation.id);

    for (const [index, userId] of params.participants.entries()) {
      const participant =
        await prisma.communicationConversationParticipant.create({
          data: {
            schoolId: params.schoolId,
            conversationId: conversation.id,
            userId,
            role:
              index === 0
                ? CommunicationParticipantRole.OWNER
                : CommunicationParticipantRole.MEMBER,
            status: CommunicationParticipantStatus.ACTIVE,
            joinedAt: new Date('2026-10-13T07:00:00.000Z'),
            metadata: { private: 'hidden-participant-metadata' },
          },
          select: { id: true },
        });
      createdCommunicationParticipantIds.push(participant.id);
    }

    return conversation.id;
  }

  async function createConversationMessage(params: {
    conversationId: string;
    schoolId: string;
    senderUserId: string;
    body: string;
    status: CommunicationMessageStatus;
    sentAt: Date;
  }): Promise<string> {
    const message = await prisma.communicationMessage.create({
      data: {
        schoolId: params.schoolId,
        conversationId: params.conversationId,
        senderUserId: params.senderUserId,
        kind: CommunicationMessageKind.TEXT,
        status: params.status,
        body: params.body,
        sentAt: params.sentAt,
        hiddenById:
          params.status === CommunicationMessageStatus.HIDDEN
            ? adminUserId
            : null,
        hiddenAt:
          params.status === CommunicationMessageStatus.HIDDEN
            ? params.sentAt
            : null,
        hiddenReason:
          params.status === CommunicationMessageStatus.HIDDEN
            ? 'closeout-test-hidden'
            : null,
        metadata: { private: 'hidden-message-metadata' },
      },
      select: { id: true },
    });
    createdCommunicationMessageIds.push(message.id);

    await prisma.communicationConversation.update({
      where: { id: params.conversationId },
      data: { lastMessageAt: params.sentAt },
    });

    return message.id;
  }

  async function createAnnouncement(params: {
    marker: string;
    schoolId: string;
    title: string;
    body: string;
    audienceType: CommunicationAnnouncementAudienceType;
    classroomId?: string;
    userId?: string;
    withAttachment: boolean;
  }): Promise<string> {
    const announcement = await prisma.communicationAnnouncement.create({
      data: {
        schoolId: params.schoolId,
        title: params.title,
        body: params.body,
        status: CommunicationAnnouncementStatus.PUBLISHED,
        priority: CommunicationAnnouncementPriority.NORMAL,
        audienceType: params.audienceType,
        category: 'closeout',
        isPinned: false,
        publishedAt: new Date('2026-01-14T08:00:00.000Z'),
        expiresAt: new Date('2026-12-31T00:00:00.000Z'),
        createdById: teacherUserId,
        publishedById: teacherUserId,
        metadata: { private: 'hidden-announcement-metadata' },
      },
      select: { id: true },
    });
    createdCommunicationAnnouncementIds.push(announcement.id);

    if (params.audienceType !== CommunicationAnnouncementAudienceType.SCHOOL) {
      const audience = await prisma.communicationAnnouncementAudience.create({
        data: {
          schoolId: params.schoolId,
          announcementId: announcement.id,
          audienceType: params.audienceType,
          classroomId: params.classroomId,
          userId: params.userId,
        },
        select: { id: true },
      });
      createdCommunicationAnnouncementAudienceIds.push(audience.id);
    }

    if (params.withAttachment) {
      const fileId = await createFile({
        marker: `announcement-${params.marker}`,
        schoolId: params.schoolId,
        organizationId:
          params.schoolId === schoolAId ? organizationAId : organizationBId,
        originalName: `${testSuffix}-announcement.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 2048,
      });
      const attachment =
        await prisma.communicationAnnouncementAttachment.create({
          data: {
            schoolId: params.schoolId,
            announcementId: announcement.id,
            fileId,
            createdById: teacherUserId,
            caption: 'Hidden attachment caption',
            sortOrder: 1,
          },
          select: { id: true },
        });
      createdCommunicationAnnouncementAttachmentIds.push(attachment.id);
    }

    return announcement.id;
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
    organizationId: string;
    schoolId: string;
    firstName?: string;
    lastName?: string;
  }): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: params.email,
        firstName: params.firstName ?? 'ParentApp',
        lastName: params.lastName ?? params.userType.toLowerCase(),
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

  async function createAcademicFixture(params: {
    organizationId: string;
    schoolId: string;
    marker: string;
  }): Promise<{
    academicYearId: string;
    termId: string;
    classroomId: string;
  }> {
    const year = await prisma.academicYear.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${testSuffix}-year-${params.marker}-ar`,
        nameEn: `${testSuffix}-year-${params.marker}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    createdYearIds.push(year.id);

    const term = await prisma.term.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: year.id,
        nameAr: `${testSuffix}-term-${params.marker}-ar`,
        nameEn: `${testSuffix}-term-${params.marker}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    createdTermIds.push(term.id);

    const stage = await prisma.stage.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${testSuffix}-stage-${params.marker}-ar`,
        nameEn: `${testSuffix}-stage-${params.marker}`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdStageIds.push(stage.id);

    const grade = await prisma.grade.create({
      data: {
        schoolId: params.schoolId,
        stageId: stage.id,
        nameAr: `${testSuffix}-grade-${params.marker}-ar`,
        nameEn: `${testSuffix}-grade-${params.marker}`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdGradeIds.push(grade.id);

    const section = await prisma.section.create({
      data: {
        schoolId: params.schoolId,
        gradeId: grade.id,
        nameAr: `${testSuffix}-section-${params.marker}-ar`,
        nameEn: `${testSuffix}-section-${params.marker}`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdSectionIds.push(section.id);

    const classroom = await prisma.classroom.create({
      data: {
        schoolId: params.schoolId,
        sectionId: section.id,
        nameAr: `${testSuffix}-classroom-${params.marker}-ar`,
        nameEn: `${testSuffix}-classroom-${params.marker}`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdClassroomIds.push(classroom.id);

    return {
      academicYearId: year.id,
      termId: term.id,
      classroomId: classroom.id,
    };
  }

  async function createStudentWithEnrollment(params: {
    organizationId: string;
    schoolId: string;
    academicYearId: string;
    termId: string;
    classroomId: string;
    firstName: string;
    lastName: string;
  }): Promise<{ studentId: string; enrollmentId: string }> {
    const student = await prisma.student.create({
      data: {
        schoolId: params.schoolId,
        organizationId: params.organizationId,
        firstName: params.firstName,
        lastName: params.lastName,
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdStudentIds.push(student.id);

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
    createdEnrollmentIds.push(enrollment.id);

    return { studentId: student.id, enrollmentId: enrollment.id };
  }

  async function createGuardian(params: {
    organizationId: string;
    schoolId: string;
    userId: string;
    relation: string;
    isPrimary: boolean;
    marker: string;
  }): Promise<string> {
    const guardian = await prisma.guardian.create({
      data: {
        schoolId: params.schoolId,
        organizationId: params.organizationId,
        userId: params.userId,
        firstName: 'Mona',
        lastName: `Guardian ${params.marker}`,
        phone: `${testSuffix}-${params.marker}-phone`,
        email: `${testSuffix}-${params.marker}-guardian@example.test`,
        relation: params.relation,
        isPrimary: params.isPrimary,
      },
      select: { id: true },
    });
    createdGuardianIds.push(guardian.id);

    return guardian.id;
  }

  async function linkGuardianToStudent(params: {
    schoolId: string;
    studentId: string;
    guardianId: string;
    isPrimary: boolean;
  }): Promise<void> {
    const link = await prisma.studentGuardian.create({
      data: {
        schoolId: params.schoolId,
        studentId: params.studentId,
        guardianId: params.guardianId,
        isPrimary: params.isPrimary,
      },
      select: { id: true },
    });
    createdStudentGuardianIds.push(link.id);
  }

  async function createParentAppFeatureFixture(): Promise<{
    subjectId: string;
    assessmentId: string;
    draftAssessmentId: string;
    positiveBehaviorRecordId: string;
    negativeBehaviorRecordId: string;
  }> {
    const subject = await prisma.subject.create({
      data: {
        schoolId: schoolAId,
        nameAr: `${testSuffix}-parent-subject-ar`,
        nameEn: `${testSuffix} Parent Subject`,
        code: `${testSuffix.toUpperCase()}-PARENT`,
        isActive: true,
      },
      select: { id: true },
    });
    createdSubjectIds.push(subject.id);

    const allocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId: schoolAId,
        teacherUserId,
        subjectId: subject.id,
        classroomId: classroomAId,
        termId: termAId,
      },
      select: { id: true },
    });
    createdAllocationIds.push(allocation.id);

    const assessment = await prisma.gradeAssessment.create({
      data: {
        schoolId: schoolAId,
        academicYearId: academicYearAId,
        termId: termAId,
        subjectId: subject.id,
        scopeType: GradeScopeType.CLASSROOM,
        scopeKey: classroomAId,
        classroomId: classroomAId,
        titleEn: `${testSuffix} Parent Visible Quiz`,
        type: GradeAssessmentType.QUIZ,
        deliveryMode: GradeAssessmentDeliveryMode.QUESTION_BASED,
        date: new Date('2026-10-01T00:00:00.000Z'),
        weight: 10,
        maxScore: 10,
        expectedTimeMinutes: 30,
        approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
        publishedAt: new Date('2026-09-20T08:00:00.000Z'),
        publishedById: teacherUserId,
        createdById: teacherUserId,
      },
      select: { id: true },
    });
    createdGradeAssessmentIds.push(assessment.id);

    const draftAssessment = await prisma.gradeAssessment.create({
      data: {
        schoolId: schoolAId,
        academicYearId: academicYearAId,
        termId: termAId,
        subjectId: subject.id,
        scopeType: GradeScopeType.CLASSROOM,
        scopeKey: classroomAId,
        classroomId: classroomAId,
        titleEn: `${testSuffix} Parent Draft Quiz`,
        type: GradeAssessmentType.QUIZ,
        deliveryMode: GradeAssessmentDeliveryMode.SCORE_ONLY,
        date: new Date('2026-10-02T00:00:00.000Z'),
        weight: 5,
        maxScore: 10,
        approvalStatus: GradeAssessmentApprovalStatus.DRAFT,
        createdById: teacherUserId,
      },
      select: { id: true },
    });
    createdGradeAssessmentIds.push(draftAssessment.id);

    const gradeItem = await prisma.gradeItem.create({
      data: {
        schoolId: schoolAId,
        termId: termAId,
        assessmentId: assessment.id,
        studentId: ownedStudentAId,
        enrollmentId: ownedEnrollmentAId,
        score: 8,
        status: GradeItemStatus.ENTERED,
        comment: 'Visible parent feedback',
        enteredById: teacherUserId,
        enteredAt: new Date('2026-10-04T08:00:00.000Z'),
      },
      select: { id: true },
    });
    createdGradeItemIds.push(gradeItem.id);

    const question = await prisma.gradeAssessmentQuestion.create({
      data: {
        schoolId: schoolAId,
        assessmentId: assessment.id,
        type: GradeQuestionType.MCQ_SINGLE,
        prompt: 'Parent visible prompt',
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
        schoolId: schoolAId,
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

    const submission = await prisma.gradeSubmission.create({
      data: {
        schoolId: schoolAId,
        assessmentId: assessment.id,
        termId: termAId,
        studentId: ownedStudentAId,
        enrollmentId: ownedEnrollmentAId,
        status: GradeSubmissionStatus.SUBMITTED,
        startedAt: new Date('2026-10-04T08:00:00.000Z'),
        submittedAt: new Date('2026-10-04T08:30:00.000Z'),
        correctedAt: new Date('2026-10-05T08:00:00.000Z'),
        reviewedById: teacherUserId,
        totalScore: 8,
        maxScore: 10,
        metadata: { private: 'hidden-submission-metadata' },
      },
      select: { id: true },
    });
    createdGradeSubmissionIds.push(submission.id);

    const answer = await prisma.gradeSubmissionAnswer.create({
      data: {
        schoolId: schoolAId,
        submissionId: submission.id,
        assessmentId: assessment.id,
        questionId: question.id,
        studentId: ownedStudentAId,
        answerText: 'A',
        answerJson: {
          selected: 'A',
          answerKey: 'hidden-answer-key',
          correctAnswer: 'A',
          storageKey: 'raw-storage-key',
          objectKey: 'raw-object-key',
          bucket: 'raw-bucket',
        },
        correctionStatus: GradeAnswerCorrectionStatus.CORRECTED,
        awardedPoints: 8,
        maxPoints: 10,
        reviewerComment: 'Visible review comment',
        reviewedById: teacherUserId,
        reviewedAt: new Date('2026-10-05T08:00:00.000Z'),
      },
      select: { id: true },
    });
    createdGradeSubmissionAnswerIds.push(answer.id);

    await prisma.gradeSubmissionAnswerOption.create({
      data: {
        schoolId: schoolAId,
        answerId: answer.id,
        optionId: correctOption.id,
      },
    });

    const positiveCategory = await prisma.behaviorCategory.create({
      data: {
        schoolId: schoolAId,
        code: `${testSuffix}-positive`,
        nameEn: 'Helpful',
        type: BehaviorRecordType.POSITIVE,
        defaultPoints: 5,
        isActive: true,
      },
      select: { id: true },
    });
    createdBehaviorCategoryIds.push(positiveCategory.id);

    const negativeCategory = await prisma.behaviorCategory.create({
      data: {
        schoolId: schoolAId,
        code: `${testSuffix}-negative`,
        nameEn: 'Needs support',
        type: BehaviorRecordType.NEGATIVE,
        defaultPoints: -2,
        isActive: true,
      },
      select: { id: true },
    });
    createdBehaviorCategoryIds.push(negativeCategory.id);

    const positiveRecord = await prisma.behaviorRecord.create({
      data: {
        schoolId: schoolAId,
        academicYearId: academicYearAId,
        termId: termAId,
        studentId: ownedStudentAId,
        enrollmentId: ownedEnrollmentAId,
        categoryId: positiveCategory.id,
        type: BehaviorRecordType.POSITIVE,
        status: BehaviorRecordStatus.APPROVED,
        titleEn: `${testSuffix} Helpful`,
        noteEn: 'Visible positive note',
        points: 5,
        occurredAt: new Date('2026-10-06T08:00:00.000Z'),
        createdById: teacherUserId,
        reviewedById: teacherUserId,
        reviewedAt: new Date('2026-10-06T09:00:00.000Z'),
        reviewNoteEn: 'Hidden review note',
        metadata: { private: 'hidden-behavior-metadata' },
      },
      select: { id: true },
    });
    createdBehaviorRecordIds.push(positiveRecord.id);

    const negativeRecord = await prisma.behaviorRecord.create({
      data: {
        schoolId: schoolAId,
        academicYearId: academicYearAId,
        termId: termAId,
        studentId: ownedStudentAId,
        enrollmentId: ownedEnrollmentAId,
        categoryId: negativeCategory.id,
        type: BehaviorRecordType.NEGATIVE,
        status: BehaviorRecordStatus.APPROVED,
        titleEn: `${testSuffix} Needs Support`,
        noteEn: 'Visible negative note',
        points: -2,
        occurredAt: new Date('2026-10-07T08:00:00.000Z'),
        createdById: teacherUserId,
        reviewedById: teacherUserId,
        reviewedAt: new Date('2026-10-07T09:00:00.000Z'),
      },
      select: { id: true },
    });
    createdBehaviorRecordIds.push(negativeRecord.id);

    const draftRecord = await prisma.behaviorRecord.create({
      data: {
        schoolId: schoolAId,
        academicYearId: academicYearAId,
        termId: termAId,
        studentId: ownedStudentAId,
        enrollmentId: ownedEnrollmentAId,
        categoryId: positiveCategory.id,
        type: BehaviorRecordType.POSITIVE,
        status: BehaviorRecordStatus.DRAFT,
        titleEn: `${testSuffix} Draft Behavior`,
        points: 4,
        occurredAt: new Date('2026-10-08T08:00:00.000Z'),
        createdById: teacherUserId,
      },
      select: { id: true },
    });
    createdBehaviorRecordIds.push(draftRecord.id);

    const positiveLedger = await prisma.behaviorPointLedger.create({
      data: {
        schoolId: schoolAId,
        academicYearId: academicYearAId,
        termId: termAId,
        studentId: ownedStudentAId,
        enrollmentId: ownedEnrollmentAId,
        recordId: positiveRecord.id,
        categoryId: positiveCategory.id,
        entryType: BehaviorPointLedgerEntryType.AWARD,
        amount: 5,
        reasonEn: 'Visible behavior points',
        actorId: teacherUserId,
      },
      select: { id: true },
    });
    createdBehaviorPointLedgerIds.push(positiveLedger.id);

    const negativeLedger = await prisma.behaviorPointLedger.create({
      data: {
        schoolId: schoolAId,
        academicYearId: academicYearAId,
        termId: termAId,
        studentId: ownedStudentAId,
        enrollmentId: ownedEnrollmentAId,
        recordId: negativeRecord.id,
        categoryId: negativeCategory.id,
        entryType: BehaviorPointLedgerEntryType.PENALTY,
        amount: -2,
        reasonEn: 'Visible behavior penalty',
        actorId: teacherUserId,
      },
      select: { id: true },
    });
    createdBehaviorPointLedgerIds.push(negativeLedger.id);

    await createAttendanceEntry({
      date: new Date('2026-10-09T00:00:00.000Z'),
      periodKey: 'daily-present',
      status: AttendanceStatus.PRESENT,
    });
    await createAttendanceEntry({
      date: new Date('2026-10-10T00:00:00.000Z'),
      periodKey: 'daily-absent',
      status: AttendanceStatus.ABSENT,
    });
    await createAttendanceEntry({
      date: new Date('2026-10-11T00:00:00.000Z'),
      periodKey: 'daily-late',
      status: AttendanceStatus.LATE,
    });

    const xpLedger = await prisma.xpLedger.create({
      data: {
        schoolId: schoolAId,
        academicYearId: academicYearAId,
        termId: termAId,
        studentId: ownedStudentAId,
        enrollmentId: ownedEnrollmentAId,
        sourceType: XpSourceType.SYSTEM,
        sourceId: `${testSuffix}-parent-xp`,
        amount: 25,
        reason: 'Parent App closeout XP fixture',
      },
      select: { id: true },
    });
    createdXpLedgerIds.push(xpLedger.id);

    return {
      subjectId: subject.id,
      assessmentId: assessment.id,
      draftAssessmentId: draftAssessment.id,
      positiveBehaviorRecordId: positiveRecord.id,
      negativeBehaviorRecordId: negativeRecord.id,
    };
  }

  async function createAttendanceEntry(params: {
    date: Date;
    periodKey: string;
    status: AttendanceStatus;
  }): Promise<void> {
    const session = await prisma.attendanceSession.create({
      data: {
        schoolId: schoolAId,
        academicYearId: academicYearAId,
        termId: termAId,
        date: params.date,
        scopeType: AttendanceScopeType.CLASSROOM,
        scopeKey: classroomAId,
        classroomId: classroomAId,
        mode: AttendanceMode.DAILY,
        periodKey: params.periodKey,
        periodLabelEn: params.periodKey,
        status: AttendanceSessionStatus.SUBMITTED,
        submittedAt: new Date(params.date.getTime() + 60 * 60 * 1000),
        submittedById: teacherUserId,
      },
      select: { id: true },
    });
    createdAttendanceSessionIds.push(session.id);

    const entry = await prisma.attendanceEntry.create({
      data: {
        schoolId: schoolAId,
        sessionId: session.id,
        studentId: ownedStudentAId,
        enrollmentId: ownedEnrollmentAId,
        status: params.status,
        markedById: teacherUserId,
        markedAt: new Date(params.date.getTime() + 30 * 60 * 1000),
      },
      select: { id: true },
    });
    createdAttendanceEntryIds.push(entry.id);
  }

  async function login(email: string): Promise<{ accessToken: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: E2E_PASSWORD })
      .expect(200);

    return { accessToken: response.body.accessToken };
  }

  function listRegisteredParentRoutes(): string[] {
    const expressApp = app.getHttpAdapter().getInstance() as {
      _router?: { stack?: ExpressLayer[] };
      router?: { stack?: ExpressLayer[] };
    };
    const stack = expressApp._router?.stack ?? expressApp.router?.stack ?? [];
    const routes: string[] = [];

    collectRoutes(stack, routes);

    return routes
      .filter((route) => / \/api\/v1\/parent(\/|$)/.test(route))
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

  function assertNoForbiddenParentAppFields(body: unknown): void {
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      'schoolId',
      'organizationId',
      'membershipId',
      'roleId',
      'deletedAt',
      'guardianId',
      'parentId',
      'studentGuardianId',
      'createdById',
      'updatedById',
      'scheduleId',
      'raw-parent-logo-should-not-be-returned',
      'medical',
      'allergy',
      'condition',
      'medication',
      'document',
      'internalNote',
      'password',
      'passwordHash',
      'session',
      'refreshToken',
      'bucket',
      'objectKey',
      'storageKey',
      'signedUrl',
      'wallet',
      'finance',
      'marketplace',
      'payment',
      'applicationId',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  }

  function assertNoForbiddenParentTaskFields(body: unknown): void {
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      'schoolId',
      'organizationId',
      'membershipId',
      'roleId',
      'deletedAt',
      'enrollmentId',
      'enrollment_id',
      'assignmentId',
      'assignment_id',
      'guardianId',
      'parentId',
      'studentGuardianId',
      'submittedById',
      'reviewedById',
      'approvedById',
      'rejectedById',
      'createdById',
      'updatedById',
      'xpLedgerId',
      'ledgerEntryId',
      'sourceId',
      'dedupeKey',
      'RewardRedemption',
      'BehaviorPointLedger',
      'metadata',
      'bucket',
      'objectKey',
      'storageKey',
      'signedUrl',
      'wallet',
      'finance',
      'marketplace',
      'payment',
      'hidden-task-metadata',
      'hidden-assignment-metadata',
      'hidden-stage-metadata',
      'hidden-submission-metadata',
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
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  }
});
