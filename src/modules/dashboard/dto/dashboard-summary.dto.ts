export class DashboardSummaryResponseDto {
  generatedAt!: string;
  school!: DashboardSchoolSummaryDto;
  academicContext!: DashboardAcademicContextDto;
  cards!: DashboardSummaryCardsDto;
  alertsPreview!: DashboardAlertPreviewDto[];
  deferred!: DashboardDeferredFeaturesDto;
}

export class DashboardSchoolSummaryDto {
  name!: string | null;
  timezone!: string | null;
  locale!: string | null;
}

export class DashboardAcademicContextDto {
  academicYear!: DashboardAcademicContextRecordDto | null;
  term!: DashboardAcademicContextRecordDto | null;
}

export class DashboardAcademicContextRecordDto {
  id!: string;
  name!: string;
}

export class DashboardSummaryCardsDto {
  admissions!: DashboardAdmissionsCardDto;
  students!: DashboardStudentsCardDto;
  academics!: DashboardAcademicsCardDto;
  attendance!: DashboardAttendanceCardDto;
  grades!: DashboardGradesCardDto;
  homework!: DashboardHomeworkCardDto;
  behavior!: DashboardBehaviorCardDto;
  reinforcement!: DashboardReinforcementCardDto;
  communication!: DashboardCommunicationCardDto;
}

export class DashboardAdmissionsCardDto {
  totalLeads!: number;
  openApplications!: number;
  submittedApplications!: number;
  acceptedApplications!: number;
  pendingTests!: number;
  pendingInterviews!: number;
  recentDecisions!: number;
}

export class DashboardStudentsCardDto {
  activeStudents!: number;
  activeEnrollments!: number;
  guardians!: number;
  newEnrollmentsLast30Days!: number;
  withdrawnEnrollments!: number;
}

export class DashboardAcademicsCardDto {
  activeAcademicYears!: number;
  hasCurrentAcademicYear!: boolean;
  terms!: number;
  stages!: number;
  grades!: number;
  sections!: number;
  classrooms!: number;
  subjects!: number;
  rooms!: number;
  teacherAllocations!: number;
  curricula!: number;
  lessonPlans!: number;
  timetableEntries!: number;
  publishedTimetablePublications!: number;
}

export class DashboardAttendanceCardDto {
  todaySessions!: number;
  submittedSessionsToday!: number;
  pendingSessionsToday!: number;
  absentEntriesToday!: number;
  lateEntriesToday!: number;
  pendingExcuses!: number;
}

export class DashboardGradesCardDto {
  activeAssessments!: number;
  draftAssessments!: number;
  publishedAssessments!: number;
  approvedAssessments!: number;
  lockedAssessments!: number;
  gradeItems!: number;
  pendingSubmissions!: number;
  pendingAnswerReviews!: number;
}

export class DashboardHomeworkCardDto {
  draftAssignments!: number;
  publishedAssignments!: number;
  closedAssignments!: number;
  submissionsWaitingReview!: number;
  reviewedSubmissions!: number;
  gradeSyncLinkedAssignments!: number;
  gradeSyncPendingAssignments!: number;
}

export class DashboardBehaviorCardDto {
  recentRecords!: number;
  pendingReviewRecords!: number;
  positiveRecords!: number;
  negativeRecords!: number;
}

export class DashboardReinforcementCardDto {
  activeTasks!: number;
  pendingReviews!: number;
  completedAssignments!: number;
  recentXpLedgerEntries!: number;
  rewardsPending!: number;
}

export class DashboardCommunicationCardDto {
  activeAnnouncements!: number;
  recentMessages!: number;
  activeConversations!: number;
  pendingModerationReports!: number;
}

export class DashboardAlertPreviewDto {
  key!: string;
  severity!: 'info' | 'warning' | 'critical';
  title!: string;
  count!: number;
  source!: string;
}

export class DashboardDeferredFeaturesDto {
  activityFeed!: 'deferred';
  alertsEngine!: 'deferred';
  analyticsBuilder!: 'out_of_scope_v1';
}
