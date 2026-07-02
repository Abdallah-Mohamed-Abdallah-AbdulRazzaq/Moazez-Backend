import { INestApplication, ValidationPipe } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';
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
  CommunicationNotificationPreferenceCategory,
  CommunicationNotificationPriority,
  CommunicationNotificationSourceModule,
  CommunicationNotificationStatus,
  CommunicationNotificationType,
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
  ReinforcementProofType,
  ReinforcementRewardType,
  ReinforcementSource,
  ReinforcementSubmissionStatus,
  ReinforcementTargetScope,
  ReinforcementTaskStatus,
  XpSourceType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import 'reflect-metadata';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../src/common/context/request-context';
import { AppModule } from '../../src/app.module';
import { REQUIRED_PERMISSIONS_METADATA } from '../../src/common/decorators/required-permissions.decorator';
import { StorageService } from '../../src/infrastructure/storage/storage.service';
import { ParentAppAccessService } from '../../src/modules/parent-app/access/parent-app-access.service';
import { ParentAppGuardianReadAdapter } from '../../src/modules/parent-app/access/parent-app-guardian-read.adapter';
import { ParentAnnouncementsController } from '../../src/modules/parent-app/announcements/controller/parent-announcements.controller';
import { ParentBehaviorController } from '../../src/modules/parent-app/behavior/controller/parent-behavior.controller';
import { ParentCalendarController } from '../../src/modules/parent-app/calendar/controller/parent-calendar.controller';
import { ParentChildrenController } from '../../src/modules/parent-app/children/controller/parent-children.controller';
import { ParentDisciplineController } from '../../src/modules/parent-app/discipline/controller/parent-discipline.controller';
import { ParentFilesController } from '../../src/modules/parent-app/files/controller/parent-files.controller';
import { ParentGradesController } from '../../src/modules/parent-app/grades/controller/parent-grades.controller';
import { ParentHeroController } from '../../src/modules/parent-app/hero/controller/parent-hero.controller';
import { ParentHomeController } from '../../src/modules/parent-app/home/controller/parent-home.controller';
import { ParentHomeworksController } from '../../src/modules/parent-app/homeworks/controller/parent-homeworks.controller';
import { ParentChildLessonsController } from '../../src/modules/parent-app/lessons/controller/parent-child-lessons.controller';
import { ParentMessagesController } from '../../src/modules/parent-app/messages/controller/parent-messages.controller';
import { ParentNotificationsController } from '../../src/modules/parent-app/notifications/controller/parent-notifications.controller';
import { ParentProfileController } from '../../src/modules/parent-app/profile/controller/parent-profile.controller';
import { ParentProgressController } from '../../src/modules/parent-app/progress/controller/parent-progress.controller';
import { ParentReportsController } from '../../src/modules/parent-app/reports/controller/parent-reports.controller';
import { ParentRewardsController } from '../../src/modules/parent-app/rewards/controller/parent-rewards.controller';
import { ParentScheduleController } from '../../src/modules/parent-app/schedule/controller/parent-schedule.controller';
import {
  ParentScheduleClock,
  parseParentScheduleDate,
} from '../../src/modules/parent-app/schedule/application/parent-schedule-date';
import { ParentTasksController } from '../../src/modules/parent-app/tasks/controller/parent-tasks.controller';
import type {
  ParentAppEnrollmentRecord,
  ParentAppGuardianRecord,
  ParentAppStudentGuardianLinkRecord,
} from '../../src/modules/parent-app/shared/parent-app.types';

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

jest.setTimeout(45000);

type ParentAppControllerClass = {
  prototype: object;
  name: string;
};

type ParentAppReadPermissionCase = {
  controller: ParentAppControllerClass;
  method: string;
  permissions: string[];
  sprint: '1B';
};

type ParentAppActionPermissionCase = {
  controller: ParentAppControllerClass;
  method: string;
  permissions: string[];
  sprint: '1C';
};

const PARENT_APP_READ_PERMISSION_CASES: ParentAppReadPermissionCase[] = [
  {
    controller: ParentHomeController,
    method: 'getHome',
    permissions: ['parent.home.view'],
    sprint: '1B',
  },
  {
    controller: ParentChildrenController,
    method: 'listChildren',
    permissions: ['parent.children.view'],
    sprint: '1B',
  },
  {
    controller: ParentChildrenController,
    method: 'getChild',
    permissions: [
      'parent.children.view',
      'students.records.view',
      'students.enrollments.view',
    ],
    sprint: '1B',
  },
  {
    controller: ParentProfileController,
    method: 'getProfile',
    permissions: ['parent.profile.view'],
    sprint: '1B',
  },
  {
    controller: ParentGradesController,
    method: 'listGrades',
    permissions: ['grades.assessments.view'],
    sprint: '1B',
  },
  {
    controller: ParentGradesController,
    method: 'getSummary',
    permissions: ['grades.gradebook.view'],
    sprint: '1B',
  },
  {
    controller: ParentGradesController,
    method: 'getAssessmentGrade',
    permissions: ['grades.assessments.view', 'grades.submissions.view'],
    sprint: '1B',
  },
  {
    controller: ParentHomeworksController,
    method: 'listHomeworks',
    permissions: ['homework.assignments.view'],
    sprint: '1B',
  },
  {
    controller: ParentHomeworksController,
    method: 'getHomework',
    permissions: ['homework.assignments.view', 'homework.submissions.view'],
    sprint: '1B',
  },
  {
    controller: ParentBehaviorController,
    method: 'listBehavior',
    permissions: [
      'behavior.records.view',
      'behavior.points.view',
      'attendance.sessions.view',
      'attendance.absences.view',
    ],
    sprint: '1B',
  },
  {
    controller: ParentBehaviorController,
    method: 'getSummary',
    permissions: [
      'behavior.points.view',
      'attendance.sessions.view',
      'attendance.absences.view',
    ],
    sprint: '1B',
  },
  {
    controller: ParentBehaviorController,
    method: 'getRecord',
    permissions: ['behavior.records.view', 'behavior.points.view'],
    sprint: '1B',
  },
  {
    controller: ParentDisciplineController,
    method: 'listDiscipline',
    permissions: ['discipline.timeline.view'],
    sprint: '1B',
  },
  {
    controller: ParentDisciplineController,
    method: 'getDisciplineSummary',
    permissions: ['discipline.timeline.view'],
    sprint: '1B',
  },
  {
    controller: ParentProgressController,
    method: 'getProgress',
    permissions: ['parent.progress.view'],
    sprint: '1B',
  },
  {
    controller: ParentProgressController,
    method: 'getAcademicProgress',
    permissions: [
      'parent.progress.view',
      'grades.assessments.view',
      'grades.gradebook.view',
      'academics.subjects.view',
    ],
    sprint: '1B',
  },
  {
    controller: ParentProgressController,
    method: 'getBehaviorProgress',
    permissions: [
      'parent.progress.view',
      'behavior.records.view',
      'behavior.points.view',
      'attendance.sessions.view',
      'attendance.absences.view',
    ],
    sprint: '1B',
  },
  {
    controller: ParentProgressController,
    method: 'getXpProgress',
    permissions: ['parent.progress.view', 'reinforcement.xp.view'],
    sprint: '1B',
  },
  {
    controller: ParentReportsController,
    method: 'listReports',
    permissions: ['parent.reports.view'],
    sprint: '1B',
  },
  {
    controller: ParentReportsController,
    method: 'getSummary',
    permissions: ['parent.reports.view'],
    sprint: '1B',
  },
  {
    controller: ParentScheduleController,
    method: 'getTodaySchedule',
    permissions: ['academics.timetable.view'],
    sprint: '1B',
  },
  {
    controller: ParentScheduleController,
    method: 'getWeeklySchedule',
    permissions: ['academics.timetable.view'],
    sprint: '1B',
  },
  {
    controller: ParentCalendarController,
    method: 'listEvents',
    permissions: ['academics.calendar.view'],
    sprint: '1B',
  },
  {
    controller: ParentCalendarController,
    method: 'getEvent',
    permissions: ['academics.calendar.view'],
    sprint: '1B',
  },
  {
    controller: ParentChildLessonsController,
    method: 'getToday',
    permissions: ['academics.lesson_plans.view', 'academics.curriculum.view'],
    sprint: '1B',
  },
  {
    controller: ParentChildLessonsController,
    method: 'getWeek',
    permissions: [
      'academics.lesson_plans.view',
      'academics.curriculum.view',
      'academics.timetable.view',
    ],
    sprint: '1B',
  },
  {
    controller: ParentChildLessonsController,
    method: 'getDetail',
    permissions: ['academics.lesson_plans.view', 'academics.curriculum.view'],
    sprint: '1B',
  },
  {
    controller: ParentTasksController,
    method: 'listTasks',
    permissions: ['reinforcement.tasks.view'],
    sprint: '1B',
  },
  {
    controller: ParentTasksController,
    method: 'getSummary',
    permissions: ['reinforcement.tasks.view'],
    sprint: '1B',
  },
  {
    controller: ParentTasksController,
    method: 'getTask',
    permissions: ['reinforcement.tasks.view', 'reinforcement.submissions.view'],
    sprint: '1B',
  },
  {
    controller: ParentTasksController,
    method: 'listSubmissions',
    permissions: ['reinforcement.submissions.view'],
    sprint: '1B',
  },
  {
    controller: ParentTasksController,
    method: 'getSubmission',
    permissions: ['reinforcement.submissions.view'],
    sprint: '1B',
  },
  {
    controller: ParentHeroController,
    method: 'getHeroOverview',
    permissions: [
      'reinforcement.hero.view',
      'reinforcement.hero.progress.view',
      'reinforcement.xp.view',
      'reinforcement.rewards.redemptions.view',
    ],
    sprint: '1B',
  },
  {
    controller: ParentHeroController,
    method: 'getHeroProgress',
    permissions: ['reinforcement.hero.progress.view'],
    sprint: '1B',
  },
  {
    controller: ParentHeroController,
    method: 'listBadges',
    permissions: ['reinforcement.hero.badges.view'],
    sprint: '1B',
  },
  {
    controller: ParentHeroController,
    method: 'listMissions',
    permissions: ['reinforcement.hero.view', 'reinforcement.hero.progress.view'],
    sprint: '1B',
  },
  {
    controller: ParentHeroController,
    method: 'getMission',
    permissions: ['reinforcement.hero.view', 'reinforcement.hero.progress.view'],
    sprint: '1B',
  },
  {
    controller: ParentRewardsController,
    method: 'listRewards',
    permissions: ['reinforcement.rewards.view', 'reinforcement.xp.view'],
    sprint: '1B',
  },
  {
    controller: ParentRewardsController,
    method: 'listRedemptions',
    permissions: ['reinforcement.rewards.redemptions.view'],
    sprint: '1B',
  },
  {
    controller: ParentRewardsController,
    method: 'getRedemption',
    permissions: ['reinforcement.rewards.redemptions.view'],
    sprint: '1B',
  },
  {
    controller: ParentRewardsController,
    method: 'getReward',
    permissions: ['reinforcement.rewards.view', 'reinforcement.xp.view'],
    sprint: '1B',
  },
  {
    controller: ParentMessagesController,
    method: 'listContacts',
    permissions: ['communication.contacts.view'],
    sprint: '1B',
  },
  {
    controller: ParentMessagesController,
    method: 'listConversations',
    permissions: ['communication.conversations.view'],
    sprint: '1B',
  },
  {
    controller: ParentMessagesController,
    method: 'getConversation',
    permissions: ['communication.conversations.view'],
    sprint: '1B',
  },
  {
    controller: ParentMessagesController,
    method: 'searchMessages',
    permissions: ['communication.messages.view'],
    sprint: '1B',
  },
  {
    controller: ParentMessagesController,
    method: 'listMessages',
    permissions: ['communication.messages.view'],
    sprint: '1B',
  },
  {
    controller: ParentMessagesController,
    method: 'getMessageReaders',
    permissions: ['communication.messages.view'],
    sprint: '1B',
  },
  {
    controller: ParentMessagesController,
    method: 'getMessageInfo',
    permissions: ['communication.messages.view'],
    sprint: '1B',
  },
  {
    controller: ParentMessagesController,
    method: 'downloadAttachment',
    permissions: ['communication.messages.view'],
    sprint: '1B',
  },
  {
    controller: ParentMessagesController,
    method: 'previewAttachment',
    permissions: ['communication.messages.view'],
    sprint: '1B',
  },
  {
    controller: ParentNotificationsController,
    method: 'listNotifications',
    permissions: ['communication.notifications.view'],
    sprint: '1B',
  },
  {
    controller: ParentNotificationsController,
    method: 'getSummary',
    permissions: ['communication.notifications.view'],
    sprint: '1B',
  },
  {
    controller: ParentNotificationsController,
    method: 'getPreferences',
    permissions: ['communication.notifications.view'],
    sprint: '1B',
  },
  {
    controller: ParentNotificationsController,
    method: 'getNotification',
    permissions: ['communication.notifications.view'],
    sprint: '1B',
  },
  {
    controller: ParentAnnouncementsController,
    method: 'listAnnouncements',
    permissions: ['communication.announcements.view'],
    sprint: '1B',
  },
  {
    controller: ParentAnnouncementsController,
    method: 'getAnnouncement',
    permissions: ['communication.announcements.view'],
    sprint: '1B',
  },
  {
    controller: ParentAnnouncementsController,
    method: 'listAttachments',
    permissions: ['communication.announcements.view'],
    sprint: '1B',
  },
  {
    controller: ParentFilesController,
    method: 'downloadChildFile',
    permissions: ['reinforcement.submissions.view'],
    sprint: '1B',
  },
];

const PARENT_APP_CONTROLLER_CLASSES = [
  ParentHomeController,
  ParentChildrenController,
  ParentProfileController,
  ParentGradesController,
  ParentHomeworksController,
  ParentBehaviorController,
  ParentDisciplineController,
  ParentProgressController,
  ParentReportsController,
  ParentScheduleController,
  ParentCalendarController,
  ParentChildLessonsController,
  ParentTasksController,
  ParentHeroController,
  ParentRewardsController,
  ParentMessagesController,
  ParentNotificationsController,
  ParentAnnouncementsController,
  ParentFilesController,
];

const PARENT_APP_ACTION_PERMISSION_CASES: ParentAppActionPermissionCase[] = [
  {
    controller: ParentMessagesController,
    method: 'createConversation',
    permissions: ['communication.conversations.create'],
    sprint: '1C',
  },
  {
    controller: ParentMessagesController,
    method: 'sendMessage',
    permissions: ['communication.messages.send'],
    sprint: '1C',
  },
  {
    controller: ParentMessagesController,
    method: 'markRead',
    permissions: ['communication.conversations.read'],
    sprint: '1C',
  },
  {
    controller: ParentAnnouncementsController,
    method: 'markRead',
    permissions: ['communication.announcements.read'],
    sprint: '1C',
  },
  {
    controller: ParentNotificationsController,
    method: 'markAllRead',
    permissions: ['communication.notifications.read'],
    sprint: '1C',
  },
  {
    controller: ParentNotificationsController,
    method: 'updatePreferences',
    permissions: ['communication.notifications.preferences.manage'],
    sprint: '1C',
  },
  {
    controller: ParentNotificationsController,
    method: 'registerDeviceToken',
    permissions: ['app.device_tokens.manage'],
    sprint: '1C',
  },
  {
    controller: ParentNotificationsController,
    method: 'unregisterCurrentDeviceToken',
    permissions: ['app.device_tokens.manage'],
    sprint: '1C',
  },
  {
    controller: ParentNotificationsController,
    method: 'markRead',
    permissions: ['communication.notifications.read'],
    sprint: '1C',
  },
  {
    controller: ParentNotificationsController,
    method: 'archive',
    permissions: ['communication.notifications.archive'],
    sprint: '1C',
  },
];

const PARENT_APP_ROUTE_PERMISSION_CASES = [
  ...PARENT_APP_READ_PERMISSION_CASES,
  ...PARENT_APP_ACTION_PERMISSION_CASES,
];

describe('Parent App route permission metadata (security)', () => {
  it('declares the PARENT-PERM-1B read-only permission inventory', () => {
    expect(PARENT_APP_READ_PERMISSION_CASES).toHaveLength(58);

    for (const entry of PARENT_APP_READ_PERMISSION_CASES) {
      const handler = (entry.controller.prototype as Record<string, unknown>)[
        entry.method
      ];

      expect(typeof handler).toBe('function');
      expect(
        Reflect.getMetadata(
          REQUIRED_PERMISSIONS_METADATA,
          handler as object,
        ),
      ).toEqual(entry.permissions);
    }
  });

  it('declares the PARENT-PERM-1C action permission inventory', () => {
    expect(PARENT_APP_ACTION_PERMISSION_CASES).toHaveLength(10);

    for (const entry of PARENT_APP_ACTION_PERMISSION_CASES) {
      const handler = (entry.controller.prototype as Record<string, unknown>)[
        entry.method
      ];

      expect(typeof handler).toBe('function');
      expect(
        Reflect.getMetadata(
          REQUIRED_PERMISSIONS_METADATA,
          handler as object,
        ),
      ).toEqual(entry.permissions);
    }
  });

  it('keeps the complete Parent App RBAC route inventory explicit', () => {
    expect(PARENT_APP_ROUTE_PERMISSION_CASES).toHaveLength(68);

    const expectedKnownHandlers = new Set<string>();

    for (const entry of PARENT_APP_ROUTE_PERMISSION_CASES) {
      const key = `${entry.controller.name}.${entry.method}`;
      expect(expectedKnownHandlers.has(key)).toBe(false);
      expectedKnownHandlers.add(key);

      const handler = (entry.controller.prototype as Record<string, unknown>)[
        entry.method
      ];
      expect(typeof handler).toBe('function');
      expect(
        Reflect.getMetadata(
          REQUIRED_PERMISSIONS_METADATA,
          handler as object,
        ),
      ).toEqual(entry.permissions);
    }

    const discoveredRouteHandlers = PARENT_APP_CONTROLLER_CLASSES.flatMap(
      (controller) =>
        Object.getOwnPropertyNames(controller.prototype)
          .filter((method) => method !== 'constructor')
          .filter((method) => {
            const handler = (
              controller.prototype as Record<string, unknown>
            )[method];

            return (
              typeof handler === 'function' &&
              Reflect.hasMetadata(METHOD_METADATA, handler)
            );
          })
          .map((method) => `${controller.name}.${method}`),
    ).sort();

    expect(discoveredRouteHandlers).toEqual(
      Array.from(expectedKnownHandlers).sort(),
    );
  });
});

describe('Parent App ownership foundation (security)', () => {
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

describe('Parent App Home/Children/Profile routes (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let storageService: StorageService | undefined;

  let organizationAId: string;
  let organizationBId: string;
  let schoolAId: string;
  let schoolBId: string;
  let academicYearAId: string;
  let termAId: string;
  let stageAId: string;
  let gradeAId: string;
  let sectionAId: string;
  let classroomAId: string;
  let secondClassroomAId: string;
  let parentEmail: string;
  let adminEmail: string;
  let teacherEmail: string;
  let studentEmail: string;
  let parentUserId: string;
  let adminUserId: string;
  let teacherUserId: string;
  let studentUserId: string;
  let noPermissionParentRoleId: string;
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
  let ownedScheduleEntryAId: string;
  let secondChildScheduleEntryAId: string;
  let crossSchoolScheduleEntryId: string;
  let ownedAssessmentAId: string;
  let draftAssessmentAId: string;
  let positiveBehaviorRecordAId: string;
  let negativeBehaviorRecordAId: string;
  let draftBehaviorRecordAId: string;
  let draftAttendanceEntryAId: string;
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
  let ownedHeroMissionAId: string;
  let hiddenHeroMissionAId: string;
  let ownedHeroBadgeAId: string;
  let ownedRewardAId: string;
  let hiddenRewardAId: string;
  let crossSchoolRewardId: string;
  let ownedRewardRedemptionAId: string;
  let sameSchoolUnlinkedRewardRedemptionAId: string;
  let crossSchoolRewardRedemptionId: string;
  let ownConversationAId: string;
  let ownConversationHiddenMessageAId: string;
  let nonParticipantConversationAId: string;
  let crossSchoolConversationId: string;
  let audienceAnnouncementAId: string;
  let outOfAudienceAnnouncementAId: string;
  let crossSchoolAnnouncementId: string;

  const testSuffix = `parent-app-security-${Date.now()}`;
  const createdUserIds: string[] = [];
  const createdAppDeviceTokenIds: string[] = [];
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
  const createdHeroBadgeIds: string[] = [];
  const createdHeroMissionIds: string[] = [];
  const createdHeroMissionObjectiveIds: string[] = [];
  const createdHeroMissionProgressIds: string[] = [];
  const createdHeroMissionObjectiveProgressIds: string[] = [];
  const createdHeroStudentBadgeIds: string[] = [];
  const createdHeroJourneyEventIds: string[] = [];
  const createdRewardCatalogItemIds: string[] = [];
  const createdRewardRedemptionIds: string[] = [];
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
  const createdRoleIds: string[] = [];

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

    const noPermissionParentRole = await prisma.role.create({
      data: {
        schoolId: schoolAId,
        key: `${testSuffix}-parent-no-permissions`,
        name: `${testSuffix} Parent No Permissions`,
        description: 'Security fixture role with no permissions.',
        isSystem: false,
      },
      select: { id: true },
    });
    noPermissionParentRoleId = noPermissionParentRole.id;
    createdRoleIds.push(noPermissionParentRole.id);

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
    stageAId = academicA.stageId;
    gradeAId = academicA.gradeId;
    sectionAId = academicA.sectionId;
    classroomAId = academicA.classroomId;
    secondClassroomAId = await createClassroom({
      schoolId: schoolAId,
      sectionId: sectionAId,
      marker: 'second-child',
      sortOrder: 2,
    });

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
      classroomId: secondClassroomAId,
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
    draftBehaviorRecordAId = featureFixture.draftBehaviorRecordId;
    ownedScheduleEntryAId = await createParentScheduleFixture({
      schoolId: schoolAId,
      academicYearId: academicYearAId,
      termId: termAId,
      gradeId: gradeAId,
      sectionId: sectionAId,
      classroomId: classroomAId,
      subjectId: subjectAId,
      teacherUserId,
      allocationId: featureFixture.allocationId,
      marker: 'owned-child',
      dayOfWeek: 1,
    });

    const secondChildAllocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId: schoolAId,
        teacherUserId,
        subjectId: subjectAId,
        classroomId: secondClassroomAId,
        termId: termAId,
      },
      select: { id: true },
    });
    createdAllocationIds.push(secondChildAllocation.id);
    secondChildScheduleEntryAId = await createParentScheduleFixture({
      schoolId: schoolAId,
      academicYearId: academicYearAId,
      termId: termAId,
      gradeId: gradeAId,
      sectionId: sectionAId,
      classroomId: secondClassroomAId,
      subjectId: subjectAId,
      teacherUserId,
      allocationId: secondChildAllocation.id,
      marker: 'second-child',
      dayOfWeek: 1,
    });

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
    crossSchoolScheduleEntryId = await createCrossSchoolParentScheduleFixture({
      academicYearId: academicB.academicYearId,
      termId: academicB.termId,
      gradeId: academicB.gradeId,
      sectionId: academicB.sectionId,
      classroomId: academicB.classroomId,
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
    secondOwnedTaskProofFileAId = sprint9EFixture.secondOwnedTaskProofFileId;
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

    const reinforcementReadsFixture =
      await createParentReinforcementReadFixture({
        crossSchoolAcademicYearId: academicB.academicYearId,
        crossSchoolTermId: academicB.termId,
        crossSchoolStageId: academicB.stageId,
      });
    ownedHeroMissionAId = reinforcementReadsFixture.ownedHeroMissionId;
    hiddenHeroMissionAId = reinforcementReadsFixture.hiddenHeroMissionId;
    ownedHeroBadgeAId = reinforcementReadsFixture.ownedHeroBadgeId;
    ownedRewardAId = reinforcementReadsFixture.ownedRewardId;
    hiddenRewardAId = reinforcementReadsFixture.hiddenRewardId;
    crossSchoolRewardId = reinforcementReadsFixture.crossSchoolRewardId;
    ownedRewardRedemptionAId =
      reinforcementReadsFixture.ownedRewardRedemptionId;
    sameSchoolUnlinkedRewardRedemptionAId =
      reinforcementReadsFixture.sameSchoolUnlinkedRewardRedemptionId;
    crossSchoolRewardRedemptionId =
      reinforcementReadsFixture.crossSchoolRewardRedemptionId;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ParentScheduleClock)
      .useValue({
        currentDate: () => parseParentScheduleDate('2026-09-14'),
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
      await prisma.heroMissionObjectiveProgress.deleteMany({
        where: { id: { in: createdHeroMissionObjectiveProgressIds } },
      });
      await prisma.heroStudentBadge.deleteMany({
        where: { id: { in: createdHeroStudentBadgeIds } },
      });
      await prisma.heroJourneyEvent.deleteMany({
        where: { id: { in: createdHeroJourneyEventIds } },
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
      await prisma.rewardRedemption.deleteMany({
        where: { id: { in: createdRewardRedemptionIds } },
      });
      await prisma.rewardCatalogItem.deleteMany({
        where: { id: { in: createdRewardCatalogItemIds } },
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
      await prisma.timetableEntry.deleteMany({
        where: { id: { in: createdTimetableEntryIds } },
      });
      await prisma.timetablePublication.deleteMany({
        where: { id: { in: createdTimetablePublicationIds } },
      });
      await prisma.timetablePeriod.deleteMany({
        where: { id: { in: createdTimetablePeriodIds } },
      });
      await prisma.timetableConfig.deleteMany({
        where: { id: { in: createdTimetableConfigIds } },
      });
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
      await prisma.communicationNotificationDelivery.deleteMany({
        where: {
          notification: {
            recipientUserId: { in: createdUserIds },
          },
        },
      });
      await prisma.communicationNotification.deleteMany({
        where: { recipientUserId: { in: createdUserIds } },
      });
      await prisma.communicationNotificationPreference.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.appDeviceToken.deleteMany({
        where: {
          OR: [
            { id: { in: createdAppDeviceTokenIds } },
            { userId: { in: createdUserIds } },
          ],
        },
      });
      await prisma.membership.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: createdRoleIds } },
      });
      await prisma.role.deleteMany({
        where: { id: { in: createdRoleIds } },
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

  it('linked parent can read owned child today and weekly schedule only', async () => {
    const { accessToken } = await login(parentEmail);

    const today = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/schedule/today`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(today.body).toMatchObject({
      date: '2026-09-14',
      dayOfWeek: 1,
      child: {
        id: ownedStudentAId,
        displayName: 'Sara Child',
      },
      items: [
        expect.objectContaining({
          scheduleId: `timetable-entry:${ownedScheduleEntryAId}:2026-09-14`,
          timetableEntryId: ownedScheduleEntryAId,
          status: 'scheduled',
          needsAttendance: true,
          hasHomework: null,
          isExam: null,
          isBreak: false,
        }),
      ],
    });
    expect(JSON.stringify(today.body)).not.toContain(
      secondChildScheduleEntryAId,
    );
    expect(JSON.stringify(today.body)).not.toContain(
      crossSchoolScheduleEntryId,
    );
    expectSafeParentSchedulePayload(today.body);

    const weekly = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/schedule/weekly`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(weekly.body.weekStartDate).toBe('2026-09-14');
    expect(weekly.body.weekEndDate).toBe('2026-09-20');
    expect(weekly.body.child).toEqual({
      id: ownedStudentAId,
      displayName: 'Sara Child',
    });
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
          scheduleId: `timetable-entry:${ownedScheduleEntryAId}:2026-09-14`,
          timetableEntryId: ownedScheduleEntryAId,
        }),
      ],
    });
    expect(JSON.stringify(weekly.body)).not.toContain(
      secondChildScheduleEntryAId,
    );
    expect(JSON.stringify(weekly.body)).not.toContain(
      crossSchoolScheduleEntryId,
    );
    expectSafeParentSchedulePayload(weekly.body);

    const secondChildToday = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${secondOwnedStudentAId}/schedule/today`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(JSON.stringify(secondChildToday.body)).toContain(
      secondChildScheduleEntryAId,
    );
    expect(JSON.stringify(secondChildToday.body)).not.toContain(
      ownedScheduleEntryAId,
    );
    expectSafeParentSchedulePayload(secondChildToday.body);
  });

  it('parent child schedule hides same-school unlinked and cross-school children', async () => {
    const { accessToken } = await login(parentEmail);

    for (const childId of [
      sameSchoolUnlinkedStudentId,
      crossSchoolLinkedStudentId,
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/parent/children/${childId}/schedule/today`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/parent/children/${childId}/schedule/weekly`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    }
  });

  it('parent actors are denied Teacher and Student schedule routes', async () => {
    const { accessToken } = await login(parentEmail);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/schedule`)
      .query({ date: '2026-09-14' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/schedule/week`)
      .query({ date: '2026-09-14' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/schedule`)
      .query({ date: '2026-09-14' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/schedule/week`)
      .query({ date: '2026-09-14' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
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

  it('returns auth.scope.missing for representative read-only routes when the parent role lacks permission', async () => {
    const membership = await prisma.membership.findFirstOrThrow({
      where: {
        userId: parentUserId,
        schoolId: schoolAId,
        status: MembershipStatus.ACTIVE,
      },
      select: { id: true, roleId: true },
    });

    await prisma.membership.update({
      where: { id: membership.id },
      data: { roleId: noPermissionParentRoleId },
    });

    try {
      const { accessToken } = await login(parentEmail);
      const placeholderId = '11111111-1111-4111-8111-111111111111';

      for (const path of [
        'parent/home',
        'parent/children',
        `parent/children/${ownedStudentAId}`,
        'parent/profile',
        `parent/children/${ownedStudentAId}/grades`,
        `parent/children/${ownedStudentAId}/grades/summary`,
        `parent/children/${ownedStudentAId}/grades/assessments/${ownedAssessmentAId}`,
        `parent/children/${ownedStudentAId}/homeworks`,
        `parent/children/${ownedStudentAId}/homeworks/${placeholderId}`,
        `parent/children/${ownedStudentAId}/behavior`,
        `parent/children/${ownedStudentAId}/behavior/summary`,
        `parent/children/${ownedStudentAId}/discipline`,
        `parent/children/${ownedStudentAId}/progress`,
        `parent/children/${ownedStudentAId}/progress/academic`,
        `parent/children/${ownedStudentAId}/progress/behavior`,
        `parent/children/${ownedStudentAId}/progress/xp`,
        `parent/children/${ownedStudentAId}/reports`,
        `parent/children/${ownedStudentAId}/schedule/today`,
        `parent/children/${ownedStudentAId}/calendar/events`,
        `parent/children/${ownedStudentAId}/calendar/events/${placeholderId}`,
        `parent/children/${ownedStudentAId}/lessons/today?date=2026-09-14`,
        `parent/children/${ownedStudentAId}/lessons/week?date=2026-09-14`,
        `parent/children/${ownedStudentAId}/tasks`,
        `parent/children/${ownedStudentAId}/tasks/${ownedTaskAId}`,
        `parent/children/${ownedStudentAId}/tasks/${ownedTaskAId}/submissions`,
        `parent/children/${ownedStudentAId}/files/${ownedTaskProofFileAId}/download`,
        `parent/children/${ownedStudentAId}/hero`,
        `parent/children/${ownedStudentAId}/hero/progress`,
        `parent/children/${ownedStudentAId}/hero/badges`,
        `parent/children/${ownedStudentAId}/rewards`,
        `parent/children/${ownedStudentAId}/rewards/redemptions`,
        'parent/messages/contacts',
        'parent/messages/conversations',
        `parent/messages/conversations/${ownConversationAId}/messages`,
        `parent/messages/conversations/${ownConversationAId}/messages/${placeholderId}/attachments/${placeholderId}/download`,
        'parent/notifications',
        'parent/notifications/preferences',
        `parent/notifications/${placeholderId}`,
        'parent/announcements',
        `parent/announcements/${audienceAnnouncementAId}/attachments`,
      ]) {
        const response = await request(app.getHttpServer())
          .get(`${GLOBAL_PREFIX}/${path}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(403);

        expect(response.body?.error?.code).toBe('auth.scope.missing');
      }
    } finally {
      await prisma.membership.update({
        where: { id: membership.id },
        data: { roleId: membership.roleId },
      });
    }
  });

  it('returns auth.scope.missing for Parent App action routes when the parent role lacks permission', async () => {
    const membership = await prisma.membership.findFirstOrThrow({
      where: {
        userId: parentUserId,
        schoolId: schoolAId,
        status: MembershipStatus.ACTIVE,
      },
      select: { id: true, roleId: true },
    });

    await prisma.membership.update({
      where: { id: membership.id },
      data: { roleId: noPermissionParentRoleId },
    });

    try {
      const { accessToken } = await login(parentEmail);
      const placeholderId = '11111111-1111-4111-8111-111111111111';
      const actionCases: {
        method: 'post' | 'patch' | 'delete';
        path: string;
        body?: Record<string, unknown>;
        expectedPermission: string;
      }[] = [
        {
          method: 'post',
          path: 'parent/messages/conversations',
          body: {
            contactId: 'teacher:00000000-0000-4000-8000-000000000000',
          },
          expectedPermission: 'communication.conversations.create',
        },
        {
          method: 'post',
          path: `parent/messages/conversations/${ownConversationAId}/messages`,
          body: { body: 'Denied before message send use case' },
          expectedPermission: 'communication.messages.send',
        },
        {
          method: 'post',
          path: `parent/messages/conversations/${ownConversationAId}/read`,
          body: {},
          expectedPermission: 'communication.conversations.read',
        },
        {
          method: 'post',
          path: `parent/announcements/${audienceAnnouncementAId}/read`,
          body: {},
          expectedPermission: 'communication.announcements.read',
        },
        {
          method: 'post',
          path: 'parent/notifications/read-all',
          body: {},
          expectedPermission: 'communication.notifications.read',
        },
        {
          method: 'post',
          path: `parent/notifications/${placeholderId}/read`,
          body: {},
          expectedPermission: 'communication.notifications.read',
        },
        {
          method: 'post',
          path: `parent/notifications/${placeholderId}/archive`,
          body: {},
          expectedPermission: 'communication.notifications.archive',
        },
        {
          method: 'patch',
          path: 'parent/notifications/preferences',
          body: {
            preferences: [
              {
                category: 'message_received',
                inAppEnabled: true,
              },
            ],
          },
          expectedPermission:
            'communication.notifications.preferences.manage',
        },
        {
          method: 'post',
          path: 'parent/notifications/device-tokens',
          body: {
            token: `${testSuffix}-denied-parent-token-value-123456`,
            platform: 'android',
          },
          expectedPermission: 'app.device_tokens.manage',
        },
        {
          method: 'delete',
          path: 'parent/notifications/device-tokens/current',
          body: {
            token: `${testSuffix}-denied-parent-token-value-123456`,
          },
          expectedPermission: 'app.device_tokens.manage',
        },
      ];

      for (const actionCase of actionCases) {
        const call = request(app.getHttpServer())[
          actionCase.method
        ](`${GLOBAL_PREFIX}/${actionCase.path}`).set(
          'Authorization',
          `Bearer ${accessToken}`,
        );
        const response = await call.send(actionCase.body ?? {}).expect(403);

        expect(response.body?.error?.code).toBe('auth.scope.missing');
        expect(response.body?.error?.details?.missingPermissions).toEqual(
          expect.arrayContaining([actionCase.expectedPermission]),
        );
      }
    } finally {
      await prisma.membership.update({
        where: { id: membership.id },
        data: { roleId: membership.roleId },
      });
    }
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
      rating: 'very_good',
      motivationalMessage: 'Very good progress',
      assessmentCount: 1,
      enteredCount: 1,
      missingCount: 0,
      absentCount: 0,
    });
    expect(summary.body.selectedAcademicYear).toMatchObject({
      id: academicYearAId,
    });
    expect(summary.body.selectedTerm).toMatchObject({ id: termAId });
    expect(summary.body.subjects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subjectId: subjectAId,
          totalEarned: 8,
          totalMax: 10,
          percentage: 80,
          rating: 'very_good',
          assessmentCount: 1,
          enteredCount: 1,
          missingCount: 0,
          absentCount: 0,
        }),
      ]),
    );
    assertNoForbiddenParentAppFields(summary.body);
    assertNoAnswerKeysOrCorrectAnswers(summary.body);

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
          attendance: expect.objectContaining({
            status: 'late',
          }),
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
      earlyLeaveCount: 0,
      excusedCount: 0,
      positiveCount: 1,
      negativeCount: 1,
      behaviorPoints: 3,
      totalIncidents: 4,
    });
    expect(JSON.stringify(discipline.body)).not.toContain(
      draftBehaviorRecordAId,
    );
    expect(JSON.stringify(discipline.body)).not.toContain(
      draftAttendanceEntryAId,
    );
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
      totalXp: 35,
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
    expect(xp.body.totalXp).toBe(35);
  });

  it('linked parent can read owned child hero, XP-backed rewards, and redemptions without writes', async () => {
    const { accessToken } = await login(parentEmail);
    const beforeCounts = await readParentReinforcementWriteCounts();

    const hero = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/hero`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(hero.body.child.studentId).toBe(ownedStudentAId);
    expect(hero.body.stats.currentXp).toBe(35);
    expect(hero.body.progress.missions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          missionId: ownedHeroMissionAId,
          status: 'completed',
        }),
      ]),
    );
    expect(JSON.stringify(hero.body)).not.toContain(hiddenHeroMissionAId);
    assertNoForbiddenParentReinforcementFields(hero.body);

    const heroProgress = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/hero/progress`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(heroProgress.body.summary.completed).toBe(1);
    assertNoForbiddenParentReinforcementFields(heroProgress.body);

    const missions = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/hero/missions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(missions.body.missions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ missionId: ownedHeroMissionAId }),
      ]),
    );
    expect(JSON.stringify(missions.body)).not.toContain(hiddenHeroMissionAId);
    assertNoForbiddenParentReinforcementFields(missions.body);

    const missionDetail = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/hero/missions/${ownedHeroMissionAId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(missionDetail.body.missionId).toBe(ownedHeroMissionAId);
    expect(missionDetail.body.objectives).toEqual([
      expect.objectContaining({ isCompleted: true }),
    ]);
    assertNoForbiddenParentReinforcementFields(missionDetail.body);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/hero/missions/${hiddenHeroMissionAId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    const badges = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/hero/badges`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(badges.body.badges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ badgeId: ownedHeroBadgeAId }),
      ]),
    );
    assertNoForbiddenParentReinforcementFields(badges.body);

    const rewards = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/rewards`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(rewards.body.xp.totalEarnedXp).toBe(35);
    expect(rewards.body.rewards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rewardId: ownedRewardAId,
          isRedeemable: true,
          insufficientXp: false,
        }),
      ]),
    );
    expect(JSON.stringify(rewards.body)).not.toContain(hiddenRewardAId);
    expect(JSON.stringify(rewards.body)).not.toContain(crossSchoolRewardId);
    assertNoForbiddenParentReinforcementFields(rewards.body);

    const rewardDetail = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/rewards/${ownedRewardAId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(rewardDetail.body.reward.rewardId).toBe(ownedRewardAId);
    assertNoForbiddenParentReinforcementFields(rewardDetail.body);

    const redemptions = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/rewards/redemptions`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(redemptions.body.redemptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ redemptionId: ownedRewardRedemptionAId }),
      ]),
    );
    expect(JSON.stringify(redemptions.body)).not.toContain(
      sameSchoolUnlinkedRewardRedemptionAId,
    );
    expect(JSON.stringify(redemptions.body)).not.toContain(
      crossSchoolRewardRedemptionId,
    );
    assertNoForbiddenParentReinforcementFields(redemptions.body);

    const redemptionDetail = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/rewards/redemptions/${ownedRewardRedemptionAId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(redemptionDetail.body.redemption.redemptionId).toBe(
      ownedRewardRedemptionAId,
    );
    assertNoForbiddenParentReinforcementFields(redemptionDetail.body);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/children/${ownedStudentAId}/rewards/redemptions/${sameSchoolUnlinkedRewardRedemptionAId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    const afterCounts = await readParentReinforcementWriteCounts();
    expect(afterCounts).toEqual(beforeCounts);
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
            earlyLeaveCount: 0,
            excusedCount: 0,
            positiveCount: 1,
            negativeCount: 1,
            behaviorPoints: 3,
            totalIncidents: 4,
          }),
        }),
      }),
    ]);
    expect(JSON.stringify(list.body)).not.toContain(draftBehaviorRecordAId);
    expect(JSON.stringify(list.body)).not.toContain(draftAttendanceEntryAId);
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
        presentCount: 1,
        absenceCount: 1,
        lateCount: 1,
        disciplinePercentage: 33.33,
        discipline_percentage: 33.33,
      },
      discipline: {
        attendanceIncidentCount: 2,
        absenceCount: 1,
        lateCount: 1,
        earlyLeaveCount: 0,
        excusedCount: 0,
        positiveCount: 1,
        negativeCount: 1,
        behaviorPoints: 3,
        totalIncidents: 4,
      },
      xp: { totalXp: 35 },
      unavailable: {
        reportEngine: { available: false },
        schedule: { available: false },
        homework: { available: false },
        pickup: { available: false },
      },
    });
    expect(JSON.stringify(summary.body)).not.toContain(draftBehaviorRecordAId);
    expect(JSON.stringify(summary.body)).not.toContain(draftAttendanceEntryAId);
    expect(JSON.stringify(summary.body)).not.toContain('disciplineScore');
    expect(JSON.stringify(summary.body)).not.toContain(
      'combinedDisciplinePercentage',
    );
    expect(JSON.stringify(summary.body)).not.toContain('reviewedById');
    expect(JSON.stringify(summary.body)).not.toContain('submittedById');
    expect(JSON.stringify(summary.body)).not.toContain('markedById');
    assertNoForbiddenParentAppFields(summary.body);
  });

  it('linked parent can read owned child tasks and submissions only', async () => {
    const { accessToken } = await login(parentEmail);
    const beforeCounts = await readParentReinforcementWriteCounts();

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
    assertNoForbiddenParentReinforcementFields(list.body);

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
    assertNoForbiddenParentReinforcementFields(summary.body);

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
    assertNoForbiddenParentReinforcementFields(detail.body);

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
    assertNoForbiddenParentReinforcementFields(submissions.body);

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
    assertNoForbiddenParentReinforcementFields(submissionDetail.body);

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

    const afterCounts = await readParentReinforcementWriteCounts();
    expect(afterCounts).toEqual(beforeCounts);
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

    const search = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/messages/conversations/${ownConversationAId}/search`,
      )
      .query({ q: 'Visible parent', page: 1, limit: 10 })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const searchJson = JSON.stringify(search.body);

    expect(search.body).toMatchObject({
      conversationId: ownConversationAId,
      conversation_id: ownConversationAId,
      query: 'Visible parent',
      pagination: expect.objectContaining({
        page: 1,
        limit: 10,
      }),
    });
    expect(searchJson).toContain('Visible parent message');
    expect(searchJson).not.toContain('Hidden message body should not leak');
    expect(searchJson).not.toContain(nonParticipantConversationAId);
    expect(searchJson).not.toContain(crossSchoolConversationId);
    assertNoForbiddenParentAppFields(search.body);

    const hiddenSearch = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/parent/messages/conversations/${ownConversationAId}/search`,
      )
      .query({ q: 'Hidden message body' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(JSON.stringify(hiddenSearch.body)).not.toContain(
      'Hidden message body should not leak',
    );
    expect(hiddenSearch.body.messages).toEqual([]);

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
      .send({ body: 'Parent security reply' })
      .expect(201);

    expect(sent.body.message).toMatchObject({
      body: 'Parent security reply',
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

    const contacts = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/messages/contacts`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(contacts.body.contacts).toEqual(expect.any(Array));
    assertNoForbiddenParentAppFields(contacts.body);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/messages/conversations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ contactId: 'teacher:00000000-0000-4000-8000-000000000000' })
      .expect(404);

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
        .get(
          `${GLOBAL_PREFIX}/parent/messages/conversations/${inaccessibleConversationId}/search`,
        )
        .query({ q: 'Visible parent' })
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
      category: 'security',
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

  it('linked parent can manage only own notification read, archive, and preference state', async () => {
    const { accessToken } = await login(parentEmail);

    const createNotification = async (params: {
      marker: string;
      schoolId: string;
      recipientUserId: string;
    }): Promise<string> => {
      const notification = await prisma.communicationNotification.create({
        data: {
          schoolId: params.schoolId,
          recipientUserId: params.recipientUserId,
          sourceModule: CommunicationNotificationSourceModule.SYSTEM,
          sourceType: 'parent_app_security',
          type: CommunicationNotificationType.SYSTEM_ALERT,
          title: `${testSuffix} ${params.marker}`,
          body: `${testSuffix} ${params.marker} body`,
          priority: CommunicationNotificationPriority.NORMAL,
          status: CommunicationNotificationStatus.UNREAD,
        },
        select: { id: true },
      });

      return notification.id;
    };

    const readNotificationId = await createNotification({
      marker: 'parent notification read',
      schoolId: schoolAId,
      recipientUserId: parentUserId,
    });
    const bulkReadNotificationId = await createNotification({
      marker: 'parent notification read all',
      schoolId: schoolAId,
      recipientUserId: parentUserId,
    });
    const archiveNotificationId = await createNotification({
      marker: 'parent notification archive',
      schoolId: schoolAId,
      recipientUserId: parentUserId,
    });
    const otherUserNotificationId = await createNotification({
      marker: 'teacher notification hidden from parent',
      schoolId: schoolAId,
      recipientUserId: teacherUserId,
    });
    const crossSchoolNotificationId = await createNotification({
      marker: 'cross school parent notification hidden',
      schoolId: schoolBId,
      recipientUserId: parentUserId,
    });

    const list = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/notifications`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(JSON.stringify(list.body)).toContain(readNotificationId);
    expect(JSON.stringify(list.body)).not.toContain(otherUserNotificationId);
    expect(JSON.stringify(list.body)).not.toContain(crossSchoolNotificationId);
    assertNoForbiddenParentAppFields(list.body);

    const detail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/notifications/${readNotificationId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(detail.body.notification).toMatchObject({
      notificationId: readNotificationId,
      status: 'unread',
    });
    assertNoForbiddenParentAppFields(detail.body);

    const read = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/notifications/${readNotificationId}/read`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);

    expect(read.body.notification).toMatchObject({
      notificationId: readNotificationId,
      status: 'read',
      readAt: expect.any(String),
    });
    assertNoForbiddenParentAppFields(read.body);

    const readAll = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/notifications/read-all`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);

    expect(readAll.body.markedCount).toBeGreaterThanOrEqual(1);
    expect(readAll.body.marked_count).toBe(readAll.body.markedCount);
    expect(readAll.body.readAt).toEqual(expect.any(String));
    assertNoForbiddenParentAppFields(readAll.body);

    const bulkReadRow = await prisma.communicationNotification.findUniqueOrThrow(
      {
        where: { id: bulkReadNotificationId },
        select: { status: true, readAt: true },
      },
    );
    expect(bulkReadRow.status).toBe(CommunicationNotificationStatus.READ);
    expect(bulkReadRow.readAt).toBeTruthy();

    const archived = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/parent/notifications/${archiveNotificationId}/archive`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);

    expect(archived.body.notification).toMatchObject({
      notificationId: archiveNotificationId,
      status: 'archived',
      archivedAt: expect.any(String),
    });
    assertNoForbiddenParentAppFields(archived.body);

    const preferences = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/parent/notifications/preferences`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        preferences: [
          {
            category: 'message_received',
            inAppEnabled: false,
            pushEnabled: true,
          },
        ],
      })
      .expect(200);

    expect(preferences.body.preferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'message_received',
          inAppEnabled: false,
          in_app_enabled: false,
          pushEnabled: true,
          push_enabled: true,
        }),
      ]),
    );
    assertNoForbiddenParentAppFields(preferences.body);

    const preferenceRow =
      await prisma.communicationNotificationPreference.findFirstOrThrow({
        where: {
          schoolId: schoolAId,
          userId: parentUserId,
          category: CommunicationNotificationPreferenceCategory.MESSAGE_RECEIVED,
        },
      });
    expect(preferenceRow.inAppEnabled).toBe(false);
    expect(preferenceRow.pushEnabled).toBe(true);

    for (const inaccessibleNotificationId of [
      otherUserNotificationId,
      crossSchoolNotificationId,
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/parent/notifications/${inaccessibleNotificationId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .post(
          `${GLOBAL_PREFIX}/parent/notifications/${inaccessibleNotificationId}/read`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(404);
      await request(app.getHttpServer())
        .post(
          `${GLOBAL_PREFIX}/parent/notifications/${inaccessibleNotificationId}/archive`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
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
        `hero/missions/${ownedHeroMissionAId}`,
        'rewards',
        `rewards/${ownedRewardAId}`,
        'rewards/redemptions',
        `rewards/redemptions/${ownedRewardRedemptionAId}`,
        'reports',
        'reports/summary',
        'schedule/today',
        'schedule/weekly',
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

  it('registers and unregisters parent device tokens without scope or token leaks', async () => {
    const { accessToken } = await login(parentEmail);
    const token = `${testSuffix}-parent-fcm-token-value-1234567890`;

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/notifications/device-tokens`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        token,
        platform: 'android',
        schoolId: schoolBId,
        userId: adminUserId,
      })
      .expect(400);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/notifications/device-tokens`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        token,
        platform: 'android',
        deviceId: `${testSuffix}-parent-device`,
        appVersion: '1.0.0',
        locale: 'en-US',
        timezone: 'Africa/Cairo',
      })
      .expect(201);

    createdAppDeviceTokenIds.push(response.body.deviceTokenId);
    expect(response.body).toMatchObject({
      deviceTokenId: expect.any(String),
      device_token_id: response.body.deviceTokenId,
      platform: 'android',
      appSurface: 'parent',
      app_surface: 'parent',
      isActive: true,
      is_active: true,
    });
    assertNoForbiddenParentAppFields(response.body);
    expect(JSON.stringify(response.body)).not.toContain(token);
    expect(JSON.stringify(response.body)).not.toContain('tokenHash');
    expect(JSON.stringify(response.body)).not.toContain('tokenCiphertext');

    const row = await prisma.appDeviceToken.findUniqueOrThrow({
      where: { id: response.body.deviceTokenId },
    });
    expect(row.schoolId).toBe(schoolAId);
    expect(row.userId).toBe(parentUserId);
    expect(row.tokenHash).not.toBe(token);
    expect(row.tokenCiphertext).not.toContain(token);
    expect(row.isActive).toBe(true);

    const revoked = await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/parent/notifications/device-tokens/current`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ token })
      .expect(200);

    expect(revoked.body).toMatchObject({
      deviceTokenId: response.body.deviceTokenId,
      device_token_id: response.body.deviceTokenId,
      appSurface: 'parent',
      app_surface: 'parent',
      revoked: true,
    });
    assertNoForbiddenParentAppFields(revoked.body);

    const revokedRow = await prisma.appDeviceToken.findUniqueOrThrow({
      where: { id: response.body.deviceTokenId },
    });
    expect(revokedRow.isActive).toBe(false);
    expect(revokedRow.revokedAt).toBeTruthy();

    const unknown = await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/parent/notifications/device-tokens/current`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ token: `${testSuffix}-unknown-parent-token-value-123456` })
      .expect(200);

    expect(unknown.body).toMatchObject({
      deviceTokenId: null,
      device_token_id: null,
      appSurface: 'parent',
      app_surface: 'parent',
      revoked: false,
    });
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
        `children/${ownedStudentAId}/hero/missions/${ownedHeroMissionAId}`,
        `children/${ownedStudentAId}/rewards`,
        `children/${ownedStudentAId}/rewards/${ownedRewardAId}`,
        `children/${ownedStudentAId}/rewards/redemptions`,
        `children/${ownedStudentAId}/rewards/redemptions/${ownedRewardRedemptionAId}`,
        `children/${ownedStudentAId}/reports`,
        `children/${ownedStudentAId}/reports/summary`,
        `children/${ownedStudentAId}/schedule/today`,
        `children/${ownedStudentAId}/schedule/weekly`,
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
      `children/${ownedStudentAId}/hero`,
      `children/${ownedStudentAId}/rewards`,
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
        path: `children/${ownedStudentAId}/attendance/${draftAttendanceEntryAId}`,
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
      {
        method: 'post' as const,
        path: `children/${ownedStudentAId}/hero/missions/${ownedHeroMissionAId}/start`,
      },
      {
        method: 'post' as const,
        path: `children/${ownedStudentAId}/hero/missions/${ownedHeroMissionAId}/complete`,
      },
      {
        method: 'post' as const,
        path: `children/${ownedStudentAId}/hero/missions/${ownedHeroMissionAId}/objectives/f0000000-0000-4000-8000-000000000001/complete`,
      },
      {
        method: 'post' as const,
        path: `children/${ownedStudentAId}/rewards/${ownedRewardAId}/redeem`,
      },
      {
        method: 'post' as const,
        path: `children/${ownedStudentAId}/progress/xp/grants/manual`,
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

    for (const route of [
      `tasks/${ownedTaskAId}/stages/${ownedTaskStageAId}/submit`,
      `hero/missions/${ownedHeroMissionAId}/start`,
      `hero/missions/${ownedHeroMissionAId}/complete`,
      `rewards/${ownedRewardAId}/redeem`,
    ]) {
      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/student/${route}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(403);
    }
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

  async function createParentReinforcementReadFixture(params: {
    crossSchoolAcademicYearId: string;
    crossSchoolTermId: string;
    crossSchoolStageId: string;
  }): Promise<{
    ownedHeroMissionId: string;
    hiddenHeroMissionId: string;
    ownedHeroBadgeId: string;
    ownedRewardId: string;
    hiddenRewardId: string;
    crossSchoolRewardId: string;
    ownedRewardRedemptionId: string;
    sameSchoolUnlinkedRewardRedemptionId: string;
    crossSchoolRewardRedemptionId: string;
  }> {
    const badge = await prisma.heroBadge.create({
      data: {
        schoolId: schoolAId,
        slug: `${testSuffix}-parent-hero-badge`,
        nameEn: `${testSuffix} Parent Hero Badge`,
        descriptionEn: 'Visible parent hero badge',
        isActive: true,
      },
      select: { id: true },
    });
    createdHeroBadgeIds.push(badge.id);

    const mission = await prisma.heroMission.create({
      data: {
        schoolId: schoolAId,
        academicYearId: academicYearAId,
        termId: termAId,
        stageId: stageAId,
        subjectId: subjectAId,
        titleEn: `${testSuffix} Parent Hero Mission`,
        briefEn: 'Visible parent hero mission brief',
        requiredLevel: 1,
        rewardXp: 10,
        badgeRewardId: badge.id,
        status: HeroMissionStatus.PUBLISHED,
        publishedAt: new Date('2026-10-15T08:00:00.000Z'),
        publishedById: teacherUserId,
        createdById: teacherUserId,
      },
      select: { id: true },
    });
    createdHeroMissionIds.push(mission.id);

    const hiddenMission = await prisma.heroMission.create({
      data: {
        schoolId: schoolAId,
        academicYearId: academicYearAId,
        termId: termAId,
        stageId: stageAId,
        subjectId: subjectAId,
        titleEn: `${testSuffix} Hidden Parent Hero Mission`,
        briefEn: 'Hidden draft mission brief',
        requiredLevel: 1,
        rewardXp: 99,
        status: HeroMissionStatus.DRAFT,
        createdById: teacherUserId,
      },
      select: { id: true },
    });
    createdHeroMissionIds.push(hiddenMission.id);

    const crossSchoolMission = await prisma.heroMission.create({
      data: {
        schoolId: schoolBId,
        academicYearId: params.crossSchoolAcademicYearId,
        termId: params.crossSchoolTermId,
        stageId: params.crossSchoolStageId,
        titleEn: `${testSuffix} Cross School Parent Hero Mission`,
        briefEn: 'Cross school mission brief',
        requiredLevel: 1,
        rewardXp: 10,
        status: HeroMissionStatus.PUBLISHED,
        publishedAt: new Date('2026-10-15T08:00:00.000Z'),
      },
      select: { id: true },
    });
    createdHeroMissionIds.push(crossSchoolMission.id);

    const objective = await prisma.heroMissionObjective.create({
      data: {
        schoolId: schoolAId,
        missionId: mission.id,
        type: HeroMissionObjectiveType.MANUAL,
        titleEn: 'Visible parent objective',
        subtitleEn: 'Read-only objective status',
        sortOrder: 1,
        isRequired: true,
      },
      select: { id: true },
    });
    createdHeroMissionObjectiveIds.push(objective.id);

    const progress = await prisma.heroMissionProgress.create({
      data: {
        schoolId: schoolAId,
        missionId: mission.id,
        studentId: ownedStudentAId,
        enrollmentId: ownedEnrollmentAId,
        academicYearId: academicYearAId,
        termId: termAId,
        status: HeroMissionProgressStatus.COMPLETED,
        progressPercent: 100,
        startedAt: new Date('2026-10-15T08:00:00.000Z'),
        completedAt: new Date('2026-10-16T08:00:00.000Z'),
        lastActivityAt: new Date('2026-10-16T08:00:00.000Z'),
      },
      select: { id: true },
    });
    createdHeroMissionProgressIds.push(progress.id);

    const objectiveProgress = await prisma.heroMissionObjectiveProgress.create({
      data: {
        schoolId: schoolAId,
        missionProgressId: progress.id,
        objectiveId: objective.id,
        completedAt: new Date('2026-10-16T08:00:00.000Z'),
        completedById: teacherUserId,
      },
      select: { id: true },
    });
    createdHeroMissionObjectiveProgressIds.push(objectiveProgress.id);

    const studentBadge = await prisma.heroStudentBadge.create({
      data: {
        schoolId: schoolAId,
        studentId: ownedStudentAId,
        badgeId: badge.id,
        missionId: mission.id,
        missionProgressId: progress.id,
        earnedAt: new Date('2026-10-16T08:00:00.000Z'),
      },
      select: { id: true },
    });
    createdHeroStudentBadgeIds.push(studentBadge.id);

    const heroXpLedger = await prisma.xpLedger.create({
      data: {
        schoolId: schoolAId,
        academicYearId: academicYearAId,
        termId: termAId,
        studentId: ownedStudentAId,
        enrollmentId: ownedEnrollmentAId,
        sourceType: XpSourceType.HERO_MISSION,
        sourceId: mission.id,
        amount: 10,
        reason: 'Parent App hero XP fixture',
      },
      select: { id: true },
    });
    createdXpLedgerIds.push(heroXpLedger.id);

    const rewardImageFileId = await createFile({
      marker: 'parent-reward-image',
      schoolId: schoolAId,
      organizationId: organizationAId,
      originalName: `${testSuffix}-parent-reward.png`,
      mimeType: 'image/png',
      sizeBytes: 2048,
    });

    const reward = await prisma.rewardCatalogItem.create({
      data: {
        schoolId: schoolAId,
        academicYearId: academicYearAId,
        termId: termAId,
        titleEn: `${testSuffix} Parent Reward`,
        descriptionEn: 'Visible parent reward',
        type: RewardCatalogItemType.PRIVILEGE,
        status: RewardCatalogItemStatus.PUBLISHED,
        minTotalXp: 10,
        isUnlimited: true,
        imageFileId: rewardImageFileId,
        publishedAt: new Date('2026-10-17T08:00:00.000Z'),
        publishedById: teacherUserId,
        createdById: teacherUserId,
        metadata: { internal: 'hidden-reward-metadata' },
      },
      select: { id: true },
    });
    createdRewardCatalogItemIds.push(reward.id);

    const hiddenReward = await prisma.rewardCatalogItem.create({
      data: {
        schoolId: schoolAId,
        academicYearId: academicYearAId,
        termId: termAId,
        titleEn: `${testSuffix} Hidden Parent Reward`,
        descriptionEn: 'Hidden draft parent reward',
        type: RewardCatalogItemType.PRIVILEGE,
        status: RewardCatalogItemStatus.DRAFT,
        minTotalXp: 1,
        isUnlimited: true,
        createdById: teacherUserId,
      },
      select: { id: true },
    });
    createdRewardCatalogItemIds.push(hiddenReward.id);

    const crossSchoolReward = await prisma.rewardCatalogItem.create({
      data: {
        schoolId: schoolBId,
        academicYearId: params.crossSchoolAcademicYearId,
        termId: params.crossSchoolTermId,
        titleEn: `${testSuffix} Cross School Parent Reward`,
        descriptionEn: 'Cross school reward',
        type: RewardCatalogItemType.PRIVILEGE,
        status: RewardCatalogItemStatus.PUBLISHED,
        minTotalXp: 1,
        isUnlimited: true,
        publishedAt: new Date('2026-10-17T08:00:00.000Z'),
      },
      select: { id: true },
    });
    createdRewardCatalogItemIds.push(crossSchoolReward.id);

    const redemption = await prisma.rewardRedemption.create({
      data: {
        schoolId: schoolAId,
        catalogItemId: reward.id,
        studentId: ownedStudentAId,
        enrollmentId: ownedEnrollmentAId,
        academicYearId: academicYearAId,
        termId: termAId,
        status: RewardRedemptionStatus.REQUESTED,
        requestSource: RewardRedemptionRequestSource.STUDENT_APP,
        requestedById: studentUserId,
        requestedAt: new Date('2026-10-18T08:00:00.000Z'),
        requestNoteEn: 'Visible redemption note',
        eligibilitySnapshot: { internal: 'hidden-eligibility' },
      },
      select: { id: true },
    });
    createdRewardRedemptionIds.push(redemption.id);

    const sameSchoolUnlinkedRedemption = await prisma.rewardRedemption.create({
      data: {
        schoolId: schoolAId,
        catalogItemId: reward.id,
        studentId: sameSchoolUnlinkedStudentId,
        enrollmentId: sameSchoolUnlinkedEnrollmentId,
        academicYearId: academicYearAId,
        termId: termAId,
        status: RewardRedemptionStatus.APPROVED,
        requestSource: RewardRedemptionRequestSource.STUDENT_APP,
        requestedAt: new Date('2026-10-18T09:00:00.000Z'),
      },
      select: { id: true },
    });
    createdRewardRedemptionIds.push(sameSchoolUnlinkedRedemption.id);

    const crossSchoolRedemption = await prisma.rewardRedemption.create({
      data: {
        schoolId: schoolBId,
        catalogItemId: crossSchoolReward.id,
        studentId: crossSchoolLinkedStudentId,
        enrollmentId: crossSchoolLinkedEnrollmentId,
        academicYearId: params.crossSchoolAcademicYearId,
        termId: params.crossSchoolTermId,
        status: RewardRedemptionStatus.REQUESTED,
        requestSource: RewardRedemptionRequestSource.STUDENT_APP,
        requestedAt: new Date('2026-10-18T10:00:00.000Z'),
      },
      select: { id: true },
    });
    createdRewardRedemptionIds.push(crossSchoolRedemption.id);

    return {
      ownedHeroMissionId: mission.id,
      hiddenHeroMissionId: hiddenMission.id,
      ownedHeroBadgeId: badge.id,
      ownedRewardId: reward.id,
      hiddenRewardId: hiddenReward.id,
      crossSchoolRewardId: crossSchoolReward.id,
      ownedRewardRedemptionId: redemption.id,
      sameSchoolUnlinkedRewardRedemptionId: sameSchoolUnlinkedRedemption.id,
      crossSchoolRewardRedemptionId: crossSchoolRedemption.id,
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
            ? 'security-test-hidden'
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
        category: 'security',
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
    stageId: string;
    gradeId: string;
    sectionId: string;
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
      stageId: stage.id,
      gradeId: grade.id,
      sectionId: section.id,
      classroomId: classroom.id,
    };
  }

  async function createClassroom(params: {
    schoolId: string;
    sectionId: string;
    marker: string;
    sortOrder: number;
  }): Promise<string> {
    const classroom = await prisma.classroom.create({
      data: {
        schoolId: params.schoolId,
        sectionId: params.sectionId,
        nameAr: `${testSuffix}-classroom-${params.marker}-ar`,
        nameEn: `${testSuffix}-classroom-${params.marker}`,
        sortOrder: params.sortOrder,
      },
      select: { id: true },
    });
    createdClassroomIds.push(classroom.id);

    return classroom.id;
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
    allocationId: string;
    assessmentId: string;
    draftAssessmentId: string;
    positiveBehaviorRecordId: string;
    negativeBehaviorRecordId: string;
    draftBehaviorRecordId: string;
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
    draftAttendanceEntryAId = await createAttendanceEntry({
      date: new Date('2026-10-12T00:00:00.000Z'),
      periodKey: 'daily-draft-hidden',
      status: AttendanceStatus.ABSENT,
      sessionStatus: AttendanceSessionStatus.DRAFT,
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
        reason: 'Parent App security XP fixture',
      },
      select: { id: true },
    });
    createdXpLedgerIds.push(xpLedger.id);

    return {
      subjectId: subject.id,
      allocationId: allocation.id,
      assessmentId: assessment.id,
      draftAssessmentId: draftAssessment.id,
      positiveBehaviorRecordId: positiveRecord.id,
      negativeBehaviorRecordId: negativeRecord.id,
      draftBehaviorRecordId: draftRecord.id,
    };
  }

  async function createParentScheduleFixture(params: {
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
        name: `${testSuffix}-${params.marker}-parent-schedule-config`,
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

  async function createCrossSchoolParentScheduleFixture(params: {
    academicYearId: string;
    termId: string;
    gradeId: string;
    sectionId: string;
    classroomId: string;
  }): Promise<string> {
    const subject = await prisma.subject.create({
      data: {
        schoolId: schoolBId,
        nameAr: `${testSuffix}-cross-school-schedule-subject-ar`,
        nameEn: `${testSuffix} Cross School Schedule Subject`,
        code: `${testSuffix.toUpperCase()}-CROSS-SCHEDULE`,
        isActive: true,
      },
      select: { id: true },
    });
    createdSubjectIds.push(subject.id);

    const allocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId: schoolBId,
        teacherUserId,
        subjectId: subject.id,
        classroomId: params.classroomId,
        termId: params.termId,
      },
      select: { id: true },
    });
    createdAllocationIds.push(allocation.id);

    return createParentScheduleFixture({
      schoolId: schoolBId,
      academicYearId: params.academicYearId,
      termId: params.termId,
      gradeId: params.gradeId,
      sectionId: params.sectionId,
      classroomId: params.classroomId,
      subjectId: subject.id,
      teacherUserId,
      allocationId: allocation.id,
      marker: 'cross-school',
      dayOfWeek: 1,
    });
  }

  async function createAttendanceEntry(params: {
    date: Date;
    periodKey: string;
    status: AttendanceStatus;
    sessionStatus?: AttendanceSessionStatus;
  }): Promise<string> {
    const sessionStatus =
      params.sessionStatus ?? AttendanceSessionStatus.SUBMITTED;
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
        status: sessionStatus,
        ...(sessionStatus === AttendanceSessionStatus.SUBMITTED
          ? {
              submittedAt: new Date(params.date.getTime() + 60 * 60 * 1000),
              submittedById: teacherUserId,
            }
          : {}),
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

    return entry.id;
  }

  async function login(email: string): Promise<{ accessToken: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: E2E_PASSWORD })
      .expect(200);

    return { accessToken: response.body.accessToken };
  }

  async function readParentReinforcementWriteCounts(): Promise<{
    reinforcementTask: number;
    reinforcementAssignment: number;
    reinforcementStage: number;
    xpLedger: number;
    behaviorPointLedger: number;
    rewardRedemption: number;
    heroMissionProgress: number;
    heroMissionObjectiveProgress: number;
    heroStudentBadge: number;
    heroJourneyEvent: number;
    reinforcementSubmission: number;
    reinforcementReview: number;
    homeworkSubmission: number;
    file: number;
  }> {
    const [
      reinforcementTask,
      reinforcementAssignment,
      reinforcementStage,
      xpLedger,
      behaviorPointLedger,
      rewardRedemption,
      heroMissionProgress,
      heroMissionObjectiveProgress,
      heroStudentBadge,
      heroJourneyEvent,
      reinforcementSubmission,
      reinforcementReview,
      homeworkSubmission,
      file,
    ] = await Promise.all([
      prisma.reinforcementTask.count({ where: { schoolId: schoolAId } }),
      prisma.reinforcementAssignment.count({ where: { schoolId: schoolAId } }),
      prisma.reinforcementTaskStage.count({ where: { schoolId: schoolAId } }),
      prisma.xpLedger.count({ where: { schoolId: schoolAId } }),
      prisma.behaviorPointLedger.count({ where: { schoolId: schoolAId } }),
      prisma.rewardRedemption.count({ where: { schoolId: schoolAId } }),
      prisma.heroMissionProgress.count({ where: { schoolId: schoolAId } }),
      prisma.heroMissionObjectiveProgress.count({
        where: { schoolId: schoolAId },
      }),
      prisma.heroStudentBadge.count({ where: { schoolId: schoolAId } }),
      prisma.heroJourneyEvent.count({ where: { schoolId: schoolAId } }),
      prisma.reinforcementSubmission.count({ where: { schoolId: schoolAId } }),
      prisma.reinforcementReview.count({ where: { schoolId: schoolAId } }),
      prisma.homeworkSubmission.count({ where: { schoolId: schoolAId } }),
      prisma.file.count({ where: { schoolId: schoolAId } }),
    ]);

    return {
      reinforcementTask,
      reinforcementAssignment,
      reinforcementStage,
      xpLedger,
      behaviorPointLedger,
      rewardRedemption,
      heroMissionProgress,
      heroMissionObjectiveProgress,
      heroStudentBadge,
      heroJourneyEvent,
      reinforcementSubmission,
      reinforcementReview,
      homeworkSubmission,
      file,
    };
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

  function assertNoForbiddenParentReinforcementFields(body: unknown): void {
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      'schoolId',
      'organizationId',
      'membershipId',
      'roleId',
      'deletedAt',
      'enrollmentId',
      'enrollment_id',
      'guardianId',
      'parentId',
      'studentGuardianId',
      'assignmentId',
      'assignment_id',
      'submittedById',
      'reviewedById',
      'createdById',
      'updatedById',
      'awardedById',
      'requestedById',
      'approvedById',
      'rejectedById',
      'fulfilledById',
      'cancelledById',
      'xpLedgerId',
      'ledgerEntryId',
      'sourceId',
      'dedupeKey',
      'eligibilitySnapshot',
      'metadata',
      'BehaviorPointLedger',
      'wallet',
      'finance',
      'marketplace',
      'payment',
      'bucket',
      'objectKey',
      'storageKey',
      'signedUrl',
      'unsafe storage URL',
      'hidden-eligibility',
      'hidden-reward-metadata',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  }

  function expectSafeParentSchedulePayload(body: unknown): void {
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      'schoolId',
      'organizationId',
      'academicYearId',
      'termId',
      'teacherSubjectAllocationId',
      'password',
      'passwordHash',
      'session',
      'refreshToken',
      'bucket',
      'objectKey',
      'storageKey',
      'applicationId',
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
