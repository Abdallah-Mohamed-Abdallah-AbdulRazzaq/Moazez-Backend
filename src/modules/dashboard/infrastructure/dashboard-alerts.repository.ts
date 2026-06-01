import { Injectable } from '@nestjs/common';
import {
  AdmissionApplicationStatus,
  AttendanceExcuseStatus,
  AttendanceSessionStatus,
  AttendanceStatus,
  BehaviorRecordStatus,
  BehaviorRecordType,
  CommunicationAnnouncementStatus,
  CommunicationReportStatus,
  GradeAnswerCorrectionStatus,
  GradeAssessmentApprovalStatus,
  GradeSubmissionStatus,
  HomeworkAssignmentStatus,
  HomeworkSubmissionStatus,
  HomeworkTargetStatus,
  InterviewStatus,
  LessonPlanStatus,
  PlacementTestStatus,
  Prisma,
  ReinforcementSubmissionStatus,
  ReinforcementTaskStatus,
  SchoolEmailConnectionStatus,
  SchoolLoginSettingsStatus,
  TimetableEntryStatus,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DashboardScope } from '../dashboard-context';

export interface DashboardAlertsDateWindow {
  now: Date;
  todayStart: Date;
  last30DaysStart: Date;
  next7DaysEnd: Date;
}

export interface DashboardAlertAcademicContextSnapshot {
  academicYear: { id: string; name: string } | null;
  term: { id: string; name: string; academicYearId: string } | null;
}

export interface DashboardAlertSignals {
  generatedAt: Date;
  academicContext: DashboardAlertAcademicContextSnapshot;
  admissions: {
    applicationsWaitingDecision: number;
    testsPending: number;
    interviewsPending: number;
  };
  academics: {
    missingActiveAcademicYear: number;
    missingActiveTerm: number;
    draftTimetableEntries: number;
    lessonPlansPendingActivation: number;
  };
  attendance: {
    todaySessionsPendingSubmission: number;
    todayAbsentEntries: number;
    todayLateEntries: number;
    pendingExcuses: number;
  };
  grades: {
    draftAssessments: number;
    publishedAssessmentsPendingApproval: number;
    pendingSubmissions: number;
    pendingAnswerReviews: number;
  };
  homework: {
    submissionsWaitingReview: number;
    gradedAssignmentsMissingSyncLink: number;
    pastDueMissingSubmissions: number;
  };
  behavior: {
    pendingReviews: number;
    recentNegativeRecords: number;
  };
  reinforcement: {
    pendingReviews: number;
    overdueActiveTasks: number;
  };
  communication: {
    pendingModerationReports: number;
    activeAnnouncementsExpiringSoon: number;
  };
  settings: {
    missingLoginIdentity: number;
    missingActiveEmailConnection: number;
  };
}

@Injectable()
export class DashboardAlertsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async loadAlertSignals(
    _scope: DashboardScope,
    window: DashboardAlertsDateWindow,
  ): Promise<DashboardAlertSignals> {
    const academicContext = await this.loadAcademicContextSnapshot();

    const [
      admissions,
      academics,
      attendance,
      grades,
      homework,
      behavior,
      reinforcement,
      communication,
      settings,
    ] = await Promise.all([
      this.loadAdmissionsSignals(),
      this.loadAcademicsSignals(academicContext),
      this.loadAttendanceSignals(academicContext, window),
      this.loadGradesSignals(academicContext),
      this.loadHomeworkSignals(academicContext, window),
      this.loadBehaviorSignals(academicContext, window),
      this.loadReinforcementSignals(academicContext, window),
      this.loadCommunicationSignals(window),
      this.loadSettingsSignals(),
    ]);

    return {
      generatedAt: window.now,
      academicContext,
      admissions,
      academics,
      attendance,
      grades,
      homework,
      behavior,
      reinforcement,
      communication,
      settings,
    };
  }

  private async loadAcademicContextSnapshot(): Promise<DashboardAlertAcademicContextSnapshot> {
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

  private async loadAdmissionsSignals(): Promise<
    DashboardAlertSignals['admissions']
  > {
    const decisionWaitingStatuses = [
      AdmissionApplicationStatus.SUBMITTED,
      AdmissionApplicationStatus.DOCUMENTS_PENDING,
      AdmissionApplicationStatus.UNDER_REVIEW,
      AdmissionApplicationStatus.WAITLISTED,
    ];

    const [applicationsWaitingDecision, testsPending, interviewsPending] =
      await Promise.all([
        this.scopedPrisma.application.count({
          where: { status: { in: decisionWaitingStatuses } },
        }),
        this.scopedPrisma.placementTest.count({
          where: { status: PlacementTestStatus.SCHEDULED },
        }),
        this.scopedPrisma.interview.count({
          where: { status: InterviewStatus.SCHEDULED },
        }),
      ]);

    return {
      applicationsWaitingDecision,
      testsPending,
      interviewsPending,
    };
  }

  private async loadAcademicsSignals(
    academicContext: DashboardAlertAcademicContextSnapshot,
  ): Promise<DashboardAlertSignals['academics']> {
    const academicWhere = this.withAcademicContext<Record<string, string>>(
      {},
      academicContext,
    );

    const [
      activeAcademicYears,
      activeTerms,
      draftTimetableEntries,
      lessonPlansPendingActivation,
    ] = await Promise.all([
      this.scopedPrisma.academicYear.count({ where: { isActive: true } }),
      this.scopedPrisma.term.count({
        where: {
          isActive: true,
          ...(academicContext.academicYear
            ? { academicYearId: academicContext.academicYear.id }
            : {}),
        },
      }),
      this.scopedPrisma.timetableEntry.count({
        where: {
          ...academicWhere,
          status: TimetableEntryStatus.DRAFT,
        },
      }),
      this.scopedPrisma.lessonPlan.count({
        where: {
          ...academicWhere,
          status: LessonPlanStatus.DRAFT,
        },
      }),
    ]);

    return {
      missingActiveAcademicYear: activeAcademicYears === 0 ? 1 : 0,
      missingActiveTerm: activeTerms === 0 ? 1 : 0,
      draftTimetableEntries,
      lessonPlansPendingActivation,
    };
  }

  private async loadAttendanceSignals(
    academicContext: DashboardAlertAcademicContextSnapshot,
    window: DashboardAlertsDateWindow,
  ): Promise<DashboardAlertSignals['attendance']> {
    const todaySessionWhere: Prisma.AttendanceSessionWhereInput = {
      ...this.withAcademicContext<Prisma.AttendanceSessionWhereInput>(
        {},
        academicContext,
      ),
      date: window.todayStart,
    };

    const [
      todaySessionsPendingSubmission,
      todayAbsentEntries,
      todayLateEntries,
      pendingExcuses,
    ] = await Promise.all([
      this.scopedPrisma.attendanceSession.count({
        where: {
          ...todaySessionWhere,
          status: AttendanceSessionStatus.DRAFT,
        },
      }),
      this.scopedPrisma.attendanceEntry.count({
        where: {
          session: todaySessionWhere,
          status: AttendanceStatus.ABSENT,
        },
      }),
      this.scopedPrisma.attendanceEntry.count({
        where: {
          session: todaySessionWhere,
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
      todaySessionsPendingSubmission,
      todayAbsentEntries,
      todayLateEntries,
      pendingExcuses,
    };
  }

  private async loadGradesSignals(
    academicContext: DashboardAlertAcademicContextSnapshot,
  ): Promise<DashboardAlertSignals['grades']> {
    const assessmentWhere =
      this.withAcademicContext<Prisma.GradeAssessmentWhereInput>(
        {},
        academicContext,
      );
    const submissionWhere =
      this.withAcademicContext<Prisma.GradeSubmissionWhereInput>(
        {},
        academicContext,
        { includeAcademicYear: false },
      );

    const [
      draftAssessments,
      publishedAssessmentsPendingApproval,
      pendingSubmissions,
      pendingAnswerReviews,
    ] = await Promise.all([
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
      draftAssessments,
      publishedAssessmentsPendingApproval,
      pendingSubmissions,
      pendingAnswerReviews,
    };
  }

  private async loadHomeworkSignals(
    academicContext: DashboardAlertAcademicContextSnapshot,
    window: DashboardAlertsDateWindow,
  ): Promise<DashboardAlertSignals['homework']> {
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
      submissionsWaitingReview,
      gradedAssignmentsMissingSyncLink,
      pastDueMissingSubmissions,
    ] = await Promise.all([
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
      this.scopedPrisma.homeworkAssignment.count({
        where: {
          ...homeworkWhere,
          isGraded: true,
          gradeAssessmentId: null,
        },
      }),
      this.scopedPrisma.homeworkTarget.count({
        where: {
          status: HomeworkTargetStatus.MISSING,
          homeworkAssignment: {
            ...homeworkWhere,
            status: HomeworkAssignmentStatus.PUBLISHED,
            dueAt: { lt: window.now },
          },
        },
      }),
    ]);

    return {
      submissionsWaitingReview,
      gradedAssignmentsMissingSyncLink,
      pastDueMissingSubmissions,
    };
  }

  private async loadBehaviorSignals(
    academicContext: DashboardAlertAcademicContextSnapshot,
    window: DashboardAlertsDateWindow,
  ): Promise<DashboardAlertSignals['behavior']> {
    const behaviorWhere =
      this.withAcademicContext<Prisma.BehaviorRecordWhereInput>(
        {},
        academicContext,
      );

    const [pendingReviews, recentNegativeRecords] = await Promise.all([
      this.scopedPrisma.behaviorRecord.count({
        where: {
          ...behaviorWhere,
          status: BehaviorRecordStatus.SUBMITTED,
        },
      }),
      this.scopedPrisma.behaviorRecord.count({
        where: {
          ...behaviorWhere,
          type: BehaviorRecordType.NEGATIVE,
          occurredAt: { gte: window.last30DaysStart },
        },
      }),
    ]);

    return {
      pendingReviews,
      recentNegativeRecords,
    };
  }

  private async loadReinforcementSignals(
    academicContext: DashboardAlertAcademicContextSnapshot,
    window: DashboardAlertsDateWindow,
  ): Promise<DashboardAlertSignals['reinforcement']> {
    const taskWhere =
      this.withAcademicContext<Prisma.ReinforcementTaskWhereInput>(
        {},
        academicContext,
      );
    const submissionWhere: Prisma.ReinforcementSubmissionWhereInput =
      academicContext.academicYear || academicContext.term
        ? { task: taskWhere }
        : {};

    const [pendingReviews, overdueActiveTasks] = await Promise.all([
      this.scopedPrisma.reinforcementSubmission.count({
        where: {
          ...submissionWhere,
          status: ReinforcementSubmissionStatus.SUBMITTED,
        },
      }),
      this.scopedPrisma.reinforcementTask.count({
        where: {
          ...taskWhere,
          dueDate: { lt: window.now },
          status: {
            in: [
              ReinforcementTaskStatus.NOT_COMPLETED,
              ReinforcementTaskStatus.IN_PROGRESS,
              ReinforcementTaskStatus.UNDER_REVIEW,
            ],
          },
        },
      }),
    ]);

    return {
      pendingReviews,
      overdueActiveTasks,
    };
  }

  private async loadCommunicationSignals(
    window: DashboardAlertsDateWindow,
  ): Promise<DashboardAlertSignals['communication']> {
    const [pendingModerationReports, activeAnnouncementsExpiringSoon] =
      await Promise.all([
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
        this.scopedPrisma.communicationAnnouncement.count({
          where: {
            status: CommunicationAnnouncementStatus.PUBLISHED,
            expiresAt: {
              gte: window.now,
              lte: window.next7DaysEnd,
            },
          },
        }),
      ]);

    return {
      pendingModerationReports,
      activeAnnouncementsExpiringSoon,
    };
  }

  private async loadSettingsSignals(): Promise<
    DashboardAlertSignals['settings']
  > {
    const [loginSettings, activeEmailConnection] = await Promise.all([
      this.scopedPrisma.schoolLoginSettings.findFirst({
        where: { status: SchoolLoginSettingsStatus.ACTIVE },
        select: { id: true },
      }),
      this.scopedPrisma.schoolEmailConnection.findFirst({
        where: {
          status: {
            in: [
              SchoolEmailConnectionStatus.ACTIVE,
              SchoolEmailConnectionStatus.VERIFIED,
            ],
          },
        },
        select: { id: true },
      }),
    ]);

    return {
      missingLoginIdentity: loginSettings ? 0 : 1,
      missingActiveEmailConnection: activeEmailConnection ? 0 : 1,
    };
  }

  private withAcademicContext<T extends Record<string, unknown>>(
    where: T,
    academicContext: DashboardAlertAcademicContextSnapshot,
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
