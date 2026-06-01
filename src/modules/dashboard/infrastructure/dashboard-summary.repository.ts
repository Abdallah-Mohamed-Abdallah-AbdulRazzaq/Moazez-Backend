import { Injectable } from '@nestjs/common';
import {
  AdmissionApplicationStatus,
  AttendanceExcuseStatus,
  AttendanceSessionStatus,
  AttendanceStatus,
  BehaviorRecordStatus,
  BehaviorRecordType,
  CommunicationAnnouncementStatus,
  CommunicationConversationStatus,
  CommunicationMessageStatus,
  CommunicationReportStatus,
  CurriculumStatus,
  GradeAnswerCorrectionStatus,
  GradeAssessmentApprovalStatus,
  GradeSubmissionStatus,
  HomeworkAssignmentStatus,
  HomeworkSubmissionStatus,
  InterviewStatus,
  LessonPlanStatus,
  PlacementTestStatus,
  Prisma,
  ReinforcementSubmissionStatus,
  ReinforcementTaskStatus,
  RewardRedemptionStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  TimetableEntryStatus,
  TimetablePublicationStatus,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DashboardScope } from '../dashboard-context';

export interface DashboardSummaryDateWindow {
  now: Date;
  todayStart: Date;
  last7DaysStart: Date;
  last30DaysStart: Date;
}

export interface DashboardSchoolSnapshot {
  name: string | null;
  timezone: string | null;
  locale: string | null;
}

export interface DashboardAcademicContextSnapshot {
  academicYear: { id: string; name: string } | null;
  term: { id: string; name: string; academicYearId: string } | null;
}

export interface DashboardSummarySnapshot {
  generatedAt: Date;
  school: DashboardSchoolSnapshot;
  academicContext: DashboardAcademicContextSnapshot;
  cards: {
    admissions: DashboardAdmissionsSnapshot;
    students: DashboardStudentsSnapshot;
    academics: DashboardAcademicsSnapshot;
    attendance: DashboardAttendanceSnapshot;
    grades: DashboardGradesSnapshot;
    homework: DashboardHomeworkSnapshot;
    behavior: DashboardBehaviorSnapshot;
    reinforcement: DashboardReinforcementSnapshot;
    communication: DashboardCommunicationSnapshot;
  };
}

export interface DashboardAdmissionsSnapshot {
  totalLeads: number;
  openApplications: number;
  submittedApplications: number;
  acceptedApplications: number;
  pendingTests: number;
  pendingInterviews: number;
  recentDecisions: number;
}

export interface DashboardStudentsSnapshot {
  activeStudents: number;
  activeEnrollments: number;
  guardians: number;
  newEnrollmentsLast30Days: number;
  withdrawnEnrollments: number;
}

export interface DashboardAcademicsSnapshot {
  activeAcademicYears: number;
  hasCurrentAcademicYear: boolean;
  terms: number;
  stages: number;
  grades: number;
  sections: number;
  classrooms: number;
  subjects: number;
  rooms: number;
  teacherAllocations: number;
  curricula: number;
  lessonPlans: number;
  timetableEntries: number;
  publishedTimetablePublications: number;
}

export interface DashboardAttendanceSnapshot {
  todaySessions: number;
  submittedSessionsToday: number;
  pendingSessionsToday: number;
  absentEntriesToday: number;
  lateEntriesToday: number;
  pendingExcuses: number;
}

export interface DashboardGradesSnapshot {
  activeAssessments: number;
  draftAssessments: number;
  publishedAssessments: number;
  approvedAssessments: number;
  lockedAssessments: number;
  gradeItems: number;
  pendingSubmissions: number;
  pendingAnswerReviews: number;
}

export interface DashboardHomeworkSnapshot {
  draftAssignments: number;
  publishedAssignments: number;
  closedAssignments: number;
  submissionsWaitingReview: number;
  reviewedSubmissions: number;
  gradeSyncLinkedAssignments: number;
  gradeSyncPendingAssignments: number;
}

export interface DashboardBehaviorSnapshot {
  recentRecords: number;
  pendingReviewRecords: number;
  positiveRecords: number;
  negativeRecords: number;
}

export interface DashboardReinforcementSnapshot {
  activeTasks: number;
  pendingReviews: number;
  completedAssignments: number;
  recentXpLedgerEntries: number;
  rewardsPending: number;
}

export interface DashboardCommunicationSnapshot {
  activeAnnouncements: number;
  recentMessages: number;
  activeConversations: number;
  pendingModerationReports: number;
}

@Injectable()
export class DashboardSummaryRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async loadSummarySnapshot(
    scope: DashboardScope,
    window: DashboardSummaryDateWindow,
  ): Promise<DashboardSummarySnapshot> {
    const [school, academicContext] = await Promise.all([
      this.loadSchoolSnapshot(scope),
      this.loadAcademicContextSnapshot(),
    ]);

    const [
      admissions,
      students,
      academics,
      attendance,
      grades,
      homework,
      behavior,
      reinforcement,
      communication,
    ] = await Promise.all([
      this.loadAdmissionsSnapshot(window),
      this.loadStudentsSnapshot(academicContext, window),
      this.loadAcademicsSnapshot(academicContext),
      this.loadAttendanceSnapshot(academicContext, window),
      this.loadGradesSnapshot(academicContext),
      this.loadHomeworkSnapshot(academicContext),
      this.loadBehaviorSnapshot(academicContext, window),
      this.loadReinforcementSnapshot(academicContext, window),
      this.loadCommunicationSnapshot(window),
    ]);

    return {
      generatedAt: window.now,
      school,
      academicContext,
      cards: {
        admissions,
        students,
        academics,
        attendance,
        grades,
        homework,
        behavior,
        reinforcement,
        communication,
      },
    };
  }

  private async loadSchoolSnapshot(
    scope: DashboardScope,
  ): Promise<DashboardSchoolSnapshot> {
    const [profile, school] = await Promise.all([
      this.scopedPrisma.schoolProfile.findFirst({
        select: {
          schoolName: true,
          shortName: true,
          timezone: true,
        },
      }),
      this.prisma.school.findFirst({
        where: {
          id: scope.schoolId,
          organizationId: scope.organizationId,
          deletedAt: null,
        },
        select: {
          name: true,
        },
      }),
    ]);

    return {
      name: profile?.schoolName ?? profile?.shortName ?? school?.name ?? null,
      timezone: profile?.timezone ?? null,
      locale: null,
    };
  }

  private async loadAcademicContextSnapshot(): Promise<DashboardAcademicContextSnapshot> {
    const academicYear = await this.scopedPrisma.academicYear.findFirst({
      where: {
        isActive: true,
      },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        nameEn: true,
        nameAr: true,
      },
    });

    const term = await this.scopedPrisma.term.findFirst({
      where: {
        isActive: true,
        ...(academicYear ? { academicYearId: academicYear.id } : {}),
      },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        academicYearId: true,
        nameEn: true,
        nameAr: true,
      },
    });

    return {
      academicYear: academicYear
        ? {
            id: academicYear.id,
            name: presentName(academicYear.nameEn, academicYear.nameAr),
          }
        : null,
      term: term
        ? {
            id: term.id,
            academicYearId: term.academicYearId,
            name: presentName(term.nameEn, term.nameAr),
          }
        : null,
    };
  }

  private async loadAdmissionsSnapshot(
    window: DashboardSummaryDateWindow,
  ): Promise<DashboardAdmissionsSnapshot> {
    const openApplicationStatuses = [
      AdmissionApplicationStatus.SUBMITTED,
      AdmissionApplicationStatus.DOCUMENTS_PENDING,
      AdmissionApplicationStatus.UNDER_REVIEW,
      AdmissionApplicationStatus.WAITLISTED,
    ];
    const recentDecisionStatuses = [
      AdmissionApplicationStatus.ACCEPTED,
      AdmissionApplicationStatus.REJECTED,
      AdmissionApplicationStatus.WAITLISTED,
    ];

    const [
      totalLeads,
      openApplications,
      submittedApplications,
      acceptedApplications,
      pendingTests,
      pendingInterviews,
      recentDecisions,
    ] = await Promise.all([
      this.scopedPrisma.lead.count(),
      this.scopedPrisma.application.count({
        where: { status: { in: openApplicationStatuses } },
      }),
      this.scopedPrisma.application.count({
        where: { status: AdmissionApplicationStatus.SUBMITTED },
      }),
      this.scopedPrisma.application.count({
        where: { status: AdmissionApplicationStatus.ACCEPTED },
      }),
      this.scopedPrisma.placementTest.count({
        where: { status: PlacementTestStatus.SCHEDULED },
      }),
      this.scopedPrisma.interview.count({
        where: { status: InterviewStatus.SCHEDULED },
      }),
      this.scopedPrisma.application.count({
        where: {
          status: { in: recentDecisionStatuses },
          updatedAt: { gte: window.last30DaysStart },
        },
      }),
    ]);

    return {
      totalLeads,
      openApplications,
      submittedApplications,
      acceptedApplications,
      pendingTests,
      pendingInterviews,
      recentDecisions,
    };
  }

  private async loadStudentsSnapshot(
    academicContext: DashboardAcademicContextSnapshot,
    window: DashboardSummaryDateWindow,
  ): Promise<DashboardStudentsSnapshot> {
    const enrollmentWhere =
      this.withAcademicContext<Prisma.EnrollmentWhereInput>(
        {},
        academicContext,
        { includeTerm: false },
      );

    const [
      activeStudents,
      activeEnrollments,
      guardians,
      newEnrollmentsLast30Days,
      withdrawnEnrollments,
    ] = await Promise.all([
      this.scopedPrisma.student.count({
        where: { status: StudentStatus.ACTIVE },
      }),
      this.scopedPrisma.enrollment.count({
        where: {
          ...enrollmentWhere,
          status: StudentEnrollmentStatus.ACTIVE,
        },
      }),
      this.scopedPrisma.guardian.count(),
      this.scopedPrisma.enrollment.count({
        where: {
          ...enrollmentWhere,
          enrolledAt: { gte: window.last30DaysStart },
        },
      }),
      this.scopedPrisma.enrollment.count({
        where: {
          ...enrollmentWhere,
          status: StudentEnrollmentStatus.WITHDRAWN,
        },
      }),
    ]);

    return {
      activeStudents,
      activeEnrollments,
      guardians,
      newEnrollmentsLast30Days,
      withdrawnEnrollments,
    };
  }

  private async loadAcademicsSnapshot(
    academicContext: DashboardAcademicContextSnapshot,
  ): Promise<DashboardAcademicsSnapshot> {
    const termWhere = this.withAcademicContext<Prisma.TermWhereInput>(
      {},
      academicContext,
      { includeTerm: false },
    );
    const academicWhere = this.withAcademicContext<Record<string, string>>(
      {},
      academicContext,
    );

    const [
      activeAcademicYears,
      terms,
      stages,
      grades,
      sections,
      classrooms,
      subjects,
      rooms,
      teacherAllocations,
      curricula,
      lessonPlans,
      timetableEntries,
      publishedTimetablePublications,
    ] = await Promise.all([
      this.scopedPrisma.academicYear.count({
        where: { isActive: true },
      }),
      this.scopedPrisma.term.count({ where: termWhere }),
      this.scopedPrisma.stage.count(),
      this.scopedPrisma.grade.count(),
      this.scopedPrisma.section.count(),
      this.scopedPrisma.classroom.count(),
      this.scopedPrisma.subject.count(),
      this.scopedPrisma.room.count(),
      this.scopedPrisma.teacherSubjectAllocation.count(),
      this.scopedPrisma.curriculum.count({
        where: {
          ...academicWhere,
          status: CurriculumStatus.ACTIVE,
        },
      }),
      this.scopedPrisma.lessonPlan.count({
        where: {
          ...academicWhere,
          status: LessonPlanStatus.ACTIVE,
        },
      }),
      this.scopedPrisma.timetableEntry.count({
        where: {
          ...academicWhere,
          status: TimetableEntryStatus.ACTIVE,
        },
      }),
      this.scopedPrisma.timetablePublication.count({
        where: {
          ...academicWhere,
          status: TimetablePublicationStatus.PUBLISHED,
        },
      }),
    ]);

    return {
      activeAcademicYears,
      hasCurrentAcademicYear: academicContext.academicYear !== null,
      terms,
      stages,
      grades,
      sections,
      classrooms,
      subjects,
      rooms,
      teacherAllocations,
      curricula,
      lessonPlans,
      timetableEntries,
      publishedTimetablePublications,
    };
  }

  private async loadAttendanceSnapshot(
    academicContext: DashboardAcademicContextSnapshot,
    window: DashboardSummaryDateWindow,
  ): Promise<DashboardAttendanceSnapshot> {
    const attendanceWhere =
      this.withAcademicContext<Prisma.AttendanceSessionWhereInput>(
        {},
        academicContext,
      );
    const todaySessionWhere: Prisma.AttendanceSessionWhereInput = {
      ...attendanceWhere,
      date: window.todayStart,
    };
    const todayEntryWhere: Prisma.AttendanceEntryWhereInput = {
      session: todaySessionWhere,
    };

    const [
      todaySessions,
      submittedSessionsToday,
      pendingSessionsToday,
      absentEntriesToday,
      lateEntriesToday,
      pendingExcuses,
    ] = await Promise.all([
      this.scopedPrisma.attendanceSession.count({
        where: todaySessionWhere,
      }),
      this.scopedPrisma.attendanceSession.count({
        where: {
          ...todaySessionWhere,
          status: AttendanceSessionStatus.SUBMITTED,
        },
      }),
      this.scopedPrisma.attendanceSession.count({
        where: {
          ...todaySessionWhere,
          status: AttendanceSessionStatus.DRAFT,
        },
      }),
      this.scopedPrisma.attendanceEntry.count({
        where: {
          ...todayEntryWhere,
          status: AttendanceStatus.ABSENT,
        },
      }),
      this.scopedPrisma.attendanceEntry.count({
        where: {
          ...todayEntryWhere,
          status: AttendanceStatus.LATE,
        },
      }),
      this.scopedPrisma.attendanceExcuseRequest.count({
        where: {
          ...this.withAcademicContext<Prisma.AttendanceExcuseRequestWhereInput>(
            {},
            academicContext,
            { includeAcademicYear: false },
          ),
          status: AttendanceExcuseStatus.PENDING,
        },
      }),
    ]);

    return {
      todaySessions,
      submittedSessionsToday,
      pendingSessionsToday,
      absentEntriesToday,
      lateEntriesToday,
      pendingExcuses,
    };
  }

  private async loadGradesSnapshot(
    academicContext: DashboardAcademicContextSnapshot,
  ): Promise<DashboardGradesSnapshot> {
    const assessmentWhere =
      this.withAcademicContext<Prisma.GradeAssessmentWhereInput>(
        {},
        academicContext,
      );
    const termWhere = this.withAcademicContext<Record<string, string>>(
      {},
      academicContext,
      { includeAcademicYear: false },
    );
    const submissionWhere =
      this.withAcademicContext<Prisma.GradeSubmissionWhereInput>(
        {},
        academicContext,
        { includeAcademicYear: false },
      );

    const [
      activeAssessments,
      draftAssessments,
      publishedAssessments,
      approvedAssessments,
      lockedAssessments,
      gradeItems,
      pendingSubmissions,
      pendingAnswerReviews,
    ] = await Promise.all([
      this.scopedPrisma.gradeAssessment.count({
        where: assessmentWhere,
      }),
      this.scopedPrisma.gradeAssessment.count({
        where: {
          ...assessmentWhere,
          approvalStatus: GradeAssessmentApprovalStatus.DRAFT,
        },
      }),
      this.scopedPrisma.gradeAssessment.count({
        where: {
          ...assessmentWhere,
          approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
        },
      }),
      this.scopedPrisma.gradeAssessment.count({
        where: {
          ...assessmentWhere,
          approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
        },
      }),
      this.scopedPrisma.gradeAssessment.count({
        where: {
          ...assessmentWhere,
          lockedAt: { not: null },
        },
      }),
      this.scopedPrisma.gradeItem.count({
        where: termWhere,
      }),
      this.scopedPrisma.gradeSubmission.count({
        where: {
          ...submissionWhere,
          status: GradeSubmissionStatus.SUBMITTED,
        },
      }),
      this.scopedPrisma.gradeSubmissionAnswer.count({
        where: {
          submission: submissionWhere,
          correctionStatus: GradeAnswerCorrectionStatus.PENDING,
        },
      }),
    ]);

    return {
      activeAssessments,
      draftAssessments,
      publishedAssessments,
      approvedAssessments,
      lockedAssessments,
      gradeItems,
      pendingSubmissions,
      pendingAnswerReviews,
    };
  }

  private async loadHomeworkSnapshot(
    academicContext: DashboardAcademicContextSnapshot,
  ): Promise<DashboardHomeworkSnapshot> {
    const homeworkWhere =
      this.withAcademicContext<Prisma.HomeworkAssignmentWhereInput>(
        {},
        academicContext,
      );
    const homeworkSubmissionWhere: Prisma.HomeworkSubmissionWhereInput =
      academicContext.academicYear || academicContext.term
        ? { homeworkAssignment: homeworkWhere }
        : {};

    const [
      draftAssignments,
      publishedAssignments,
      closedAssignments,
      submissionsWaitingReview,
      reviewedSubmissions,
      gradeSyncLinkedAssignments,
      gradeSyncPendingAssignments,
    ] = await Promise.all([
      this.scopedPrisma.homeworkAssignment.count({
        where: {
          ...homeworkWhere,
          status: HomeworkAssignmentStatus.DRAFT,
        },
      }),
      this.scopedPrisma.homeworkAssignment.count({
        where: {
          ...homeworkWhere,
          status: HomeworkAssignmentStatus.PUBLISHED,
        },
      }),
      this.scopedPrisma.homeworkAssignment.count({
        where: {
          ...homeworkWhere,
          status: HomeworkAssignmentStatus.CLOSED,
        },
      }),
      this.scopedPrisma.homeworkSubmission.count({
        where: {
          ...homeworkSubmissionWhere,
          status: {
            in: [
              HomeworkSubmissionStatus.SUBMITTED,
              HomeworkSubmissionStatus.LATE,
            ],
          },
        },
      }),
      this.scopedPrisma.homeworkSubmission.count({
        where: {
          ...homeworkSubmissionWhere,
          status: HomeworkSubmissionStatus.REVIEWED,
        },
      }),
      this.scopedPrisma.homeworkAssignment.count({
        where: {
          ...homeworkWhere,
          gradeAssessmentId: { not: null },
        },
      }),
      this.scopedPrisma.homeworkAssignment.count({
        where: {
          ...homeworkWhere,
          isGraded: true,
          gradeAssessmentId: null,
        },
      }),
    ]);

    return {
      draftAssignments,
      publishedAssignments,
      closedAssignments,
      submissionsWaitingReview,
      reviewedSubmissions,
      gradeSyncLinkedAssignments,
      gradeSyncPendingAssignments,
    };
  }

  private async loadBehaviorSnapshot(
    academicContext: DashboardAcademicContextSnapshot,
    window: DashboardSummaryDateWindow,
  ): Promise<DashboardBehaviorSnapshot> {
    const behaviorWhere =
      this.withAcademicContext<Prisma.BehaviorRecordWhereInput>(
        {},
        academicContext,
      );
    const recentBehaviorWhere = {
      ...behaviorWhere,
      occurredAt: { gte: window.last30DaysStart },
    };

    const [
      recentRecords,
      pendingReviewRecords,
      positiveRecords,
      negativeRecords,
    ] = await Promise.all([
      this.scopedPrisma.behaviorRecord.count({
        where: recentBehaviorWhere,
      }),
      this.scopedPrisma.behaviorRecord.count({
        where: {
          ...behaviorWhere,
          status: BehaviorRecordStatus.SUBMITTED,
        },
      }),
      this.scopedPrisma.behaviorRecord.count({
        where: {
          ...recentBehaviorWhere,
          type: BehaviorRecordType.POSITIVE,
        },
      }),
      this.scopedPrisma.behaviorRecord.count({
        where: {
          ...recentBehaviorWhere,
          type: BehaviorRecordType.NEGATIVE,
        },
      }),
    ]);

    return {
      recentRecords,
      pendingReviewRecords,
      positiveRecords,
      negativeRecords,
    };
  }

  private async loadReinforcementSnapshot(
    academicContext: DashboardAcademicContextSnapshot,
    window: DashboardSummaryDateWindow,
  ): Promise<DashboardReinforcementSnapshot> {
    const reinforcementWhere =
      this.withAcademicContext<Prisma.ReinforcementTaskWhereInput>(
        {},
        academicContext,
      );
    const assignmentWhere =
      this.withAcademicContext<Prisma.ReinforcementAssignmentWhereInput>(
        {},
        academicContext,
      );
    const submissionWhere: Prisma.ReinforcementSubmissionWhereInput =
      academicContext.academicYear || academicContext.term
        ? {
            assignment: assignmentWhere,
          }
        : {};
    const xpWhere = this.withAcademicContext<Prisma.XpLedgerWhereInput>(
      {},
      academicContext,
    );
    const rewardWhere =
      this.withAcademicContext<Prisma.RewardRedemptionWhereInput>(
        {},
        academicContext,
      );

    const [
      activeTasks,
      pendingReviews,
      completedAssignments,
      recentXpLedgerEntries,
      rewardsPending,
    ] = await Promise.all([
      this.scopedPrisma.reinforcementTask.count({
        where: {
          ...reinforcementWhere,
          status: {
            in: [
              ReinforcementTaskStatus.NOT_COMPLETED,
              ReinforcementTaskStatus.IN_PROGRESS,
              ReinforcementTaskStatus.UNDER_REVIEW,
            ],
          },
        },
      }),
      this.scopedPrisma.reinforcementSubmission.count({
        where: {
          ...submissionWhere,
          status: ReinforcementSubmissionStatus.SUBMITTED,
        },
      }),
      this.scopedPrisma.reinforcementAssignment.count({
        where: {
          ...assignmentWhere,
          status: ReinforcementTaskStatus.COMPLETED,
        },
      }),
      this.scopedPrisma.xpLedger.count({
        where: {
          ...xpWhere,
          occurredAt: { gte: window.last30DaysStart },
        },
      }),
      this.scopedPrisma.rewardRedemption.count({
        where: {
          ...rewardWhere,
          status: RewardRedemptionStatus.REQUESTED,
        },
      }),
    ]);

    return {
      activeTasks,
      pendingReviews,
      completedAssignments,
      recentXpLedgerEntries,
      rewardsPending,
    };
  }

  private async loadCommunicationSnapshot(
    window: DashboardSummaryDateWindow,
  ): Promise<DashboardCommunicationSnapshot> {
    const [
      activeAnnouncements,
      recentMessages,
      activeConversations,
      pendingModerationReports,
    ] = await Promise.all([
      this.scopedPrisma.communicationAnnouncement.count({
        where: {
          status: CommunicationAnnouncementStatus.PUBLISHED,
          OR: [{ expiresAt: null }, { expiresAt: { gt: window.now } }],
        },
      }),
      this.scopedPrisma.communicationMessage.count({
        where: {
          status: CommunicationMessageStatus.SENT,
          sentAt: { gte: window.last7DaysStart },
        },
      }),
      this.scopedPrisma.communicationConversation.count({
        where: { status: CommunicationConversationStatus.ACTIVE },
      }),
      this.scopedPrisma.communicationMessageReport.count({
        where: {
          status: {
            in: [
              CommunicationReportStatus.OPEN,
              CommunicationReportStatus.IN_REVIEW,
            ],
          },
        },
      }),
    ]);

    return {
      activeAnnouncements,
      recentMessages,
      activeConversations,
      pendingModerationReports,
    };
  }

  private withAcademicContext<T extends Record<string, unknown>>(
    where: T,
    academicContext: DashboardAcademicContextSnapshot,
    options?: {
      includeAcademicYear?: boolean;
      includeTerm?: boolean;
    },
  ): T {
    const includeAcademicYear = options?.includeAcademicYear ?? true;
    const includeTerm = options?.includeTerm ?? true;

    return {
      ...where,
      ...(includeAcademicYear && academicContext.academicYear
        ? { academicYearId: academicContext.academicYear.id }
        : {}),
      ...(includeTerm && academicContext.term
        ? { termId: academicContext.term.id }
        : {}),
    };
  }
}

function presentName(nameEn: string | null, nameAr: string | null): string {
  return nameEn ?? nameAr ?? '';
}
