import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REQUIRED_PERMISSIONS_METADATA } from '../../src/common/decorators/required-permissions.decorator';
import { SCHOOL_SCOPED_MODELS } from '../../src/infrastructure/database/school-scope.extension';
import { DashboardController } from '../../src/modules/dashboard/controller/dashboard.controller';
import { presentDashboardSummary } from '../../src/modules/dashboard/presenters/dashboard-summary.presenter';

describe('Dashboard summary tenancy/security contracts', () => {
  it('registers one school dashboard route guarded by dashboard.summary.view', () => {
    expect(controllerMethods(DashboardController)).toEqual(['getSummary']);
    expect(readPermissions('getSummary')).toEqual(['dashboard.summary.view']);
  });

  it('keeps source domains behind school-scoped models', () => {
    expect([...SCHOOL_SCOPED_MODELS]).toEqual(
      expect.arrayContaining([
        'Application',
        'Student',
        'Enrollment',
        'AttendanceSession',
        'GradeAssessment',
        'HomeworkAssignment',
        'BehaviorRecord',
        'ReinforcementTask',
        'CommunicationConversation',
        'CommunicationMessageReport',
      ]),
    );
  });

  it('keeps teacher, parent, and student system role seeds out of the dashboard permission', () => {
    const rolesSeed = readFileSync(
      join(process.cwd(), 'prisma/seeds/02-system-roles.seed.ts'),
      'utf8',
    );

    expect(extractArrayLiteral(rolesSeed, 'TEACHER_PERMISSIONS')).not.toContain(
      'dashboard.summary.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'PARENT_PERMISSIONS')).not.toContain(
      'dashboard.summary.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'STUDENT_PERMISSIONS')).not.toContain(
      'dashboard.summary.view',
    );
  });

  it('does not expose tenant fields in the dashboard response presenter', () => {
    const response = presentDashboardSummary({
      generatedAt: new Date('2026-06-01T09:00:00.000Z'),
      school: { name: 'School A', timezone: 'Africa/Cairo', locale: null },
      academicContext: {
        academicYear: { id: 'year-a', name: 'Year A' },
        term: { id: 'term-a', name: 'Term A', academicYearId: 'year-a' },
      },
      cards: {
        admissions: zeroAdmissions(),
        students: zeroStudents(),
        academics: zeroAcademics(),
        attendance: zeroAttendance(),
        grades: zeroGrades(),
        homework: zeroHomework(),
        behavior: zeroBehavior(),
        reinforcement: zeroReinforcement(),
        communication: zeroCommunication(),
      },
    });

    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
  });
});

function readPermissions(methodName: string): string[] | undefined {
  return Reflect.getMetadata(
    REQUIRED_PERMISSIONS_METADATA,
    DashboardController.prototype[methodName],
  );
}

function controllerMethods(controller: Function): string[] {
  return Object.getOwnPropertyNames(controller.prototype).filter(
    (method) => method !== 'constructor',
  );
}

function extractArrayLiteral(source: string, arrayName: string): string {
  const match = source.match(
    new RegExp(`const ${arrayName} = \\[([\\s\\S]*?)\\];`),
  );
  return match?.[1] ?? '';
}

function zeroAdmissions() {
  return {
    totalLeads: 0,
    openApplications: 0,
    submittedApplications: 0,
    acceptedApplications: 0,
    pendingTests: 0,
    pendingInterviews: 0,
    recentDecisions: 0,
  };
}

function zeroStudents() {
  return {
    activeStudents: 0,
    activeEnrollments: 0,
    guardians: 0,
    newEnrollmentsLast30Days: 0,
    withdrawnEnrollments: 0,
  };
}

function zeroAcademics() {
  return {
    activeAcademicYears: 0,
    hasCurrentAcademicYear: false,
    terms: 0,
    stages: 0,
    grades: 0,
    sections: 0,
    classrooms: 0,
    subjects: 0,
    rooms: 0,
    teacherAllocations: 0,
    curricula: 0,
    lessonPlans: 0,
    timetableEntries: 0,
    publishedTimetablePublications: 0,
  };
}

function zeroAttendance() {
  return {
    todaySessions: 0,
    submittedSessionsToday: 0,
    pendingSessionsToday: 0,
    absentEntriesToday: 0,
    lateEntriesToday: 0,
    pendingExcuses: 0,
  };
}

function zeroGrades() {
  return {
    activeAssessments: 0,
    draftAssessments: 0,
    publishedAssessments: 0,
    approvedAssessments: 0,
    lockedAssessments: 0,
    gradeItems: 0,
    pendingSubmissions: 0,
    pendingAnswerReviews: 0,
  };
}

function zeroHomework() {
  return {
    draftAssignments: 0,
    publishedAssignments: 0,
    closedAssignments: 0,
    submissionsWaitingReview: 0,
    reviewedSubmissions: 0,
    gradeSyncLinkedAssignments: 0,
    gradeSyncPendingAssignments: 0,
  };
}

function zeroBehavior() {
  return {
    recentRecords: 0,
    pendingReviewRecords: 0,
    positiveRecords: 0,
    negativeRecords: 0,
  };
}

function zeroReinforcement() {
  return {
    activeTasks: 0,
    pendingReviews: 0,
    completedAssignments: 0,
    recentXpLedgerEntries: 0,
    rewardsPending: 0,
  };
}

function zeroCommunication() {
  return {
    activeAnnouncements: 0,
    recentMessages: 0,
    activeConversations: 0,
    pendingModerationReports: 0,
  };
}
