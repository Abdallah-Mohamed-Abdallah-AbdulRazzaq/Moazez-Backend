import {
  ReinforcementReviewOutcome,
  ReinforcementSubmissionStatus,
  ReinforcementTaskStatus,
} from '@prisma/client';
import {
  buildTopStudents,
  calculateCompletionRate,
  summarizeAssignmentStatuses,
  summarizeReviewStatuses,
  summarizeTaskStatuses,
  summarizeXpBySource,
  TopStudentRow,
} from '../domain/reinforcement-overview-domain';
import {
  ClassroomSummaryDataset,
  ReinforcementOverviewDataset,
  OverviewAssignmentRecord,
  OverviewClassroomRecord,
  OverviewEnrollmentRecord,
  OverviewReviewRecord,
  OverviewStudentRecord,
  OverviewSubmissionRecord,
  OverviewTaskRecord,
  OverviewXpLedgerRecord,
  StudentProgressDataset,
} from '../infrastructure/reinforcement-overview.repository';
import { ReinforcementOverviewScope } from '../domain/reinforcement-overview-domain';

export function presentReinforcementOverview(params: {
  scope: ReinforcementOverviewScope;
  dataset: ReinforcementOverviewDataset;
}) {
  return {
    scope: presentScope(params.scope),
    tasks: presentTaskSummary(params.dataset.tasks),
    assignments: summarizeAssignmentStatuses(params.dataset.assignments),
    reviewQueue: summarizeReviewStatuses(params.dataset.submissions),
    xp: presentXpSummary(params.dataset.xpLedger),
    topStudents: presentTopStudents(
      buildTopStudents({
        assignments: params.dataset.assignments.map((assignment) => ({
          studentId: assignment.studentId,
          student: assignment.student,
          status: assignment.status,
        })),
        xpEntries: params.dataset.xpLedger.map((entry) => ({
          studentId: entry.studentId,
          student: entry.student,
          amount: entry.amount,
        })),
        limit: 10,
      }),
    ),
    recentActivity: buildRecentActivity({
      submissions: params.dataset.submissions,
      reviews: params.dataset.reviews,
      xpLedger: params.dataset.xpLedger,
      limit: 15,
    }),
  };
}

export function presentStudentReinforcementProgress(
  dataset: StudentProgressDataset,
) {
  const xpSummary = summarizeXpBySource(dataset.xpLedger);

  return {
    student: presentStudent(dataset.student),
    enrollment: dataset.enrollment ? presentEnrollment(dataset.enrollment) : null,
    assignments: summarizeAssignmentStatuses(dataset.assignments),
    tasks: dataset.assignments
      .filter((assignment) => isActiveTaskAssignment(assignment))
      .map((assignment) => presentStudentTaskRow(assignment)),
    submissions: summarizeReviewStatuses(dataset.submissions),
    xp: {
      totalXp: xpSummary.totalXp,
      bySourceType: xpSummary.bySourceType.map((row) => ({
        sourceType: presentEnum(row.sourceType),
        count: row.count,
        totalXp: row.totalXp,
      })),
      recentLedgerEntries: dataset.xpLedger
        .slice(0, 10)
        .map((entry) => presentXpLedgerEntry(entry)),
    },
    recentReviews: dataset.reviews
      .slice(0, 10)
      .map((review) => presentReview(review)),
  };
}

export function presentClassroomReinforcementSummary(
  dataset: ClassroomSummaryDataset,
) {
  const studentRows = buildClassroomStudentRows(dataset);

  return {
    classroom: presentClassroom(dataset.classroom),
    studentsCount: dataset.enrollments.length,
    assignments: summarizeAssignmentStatuses(dataset.assignments),
    reviewQueue: summarizeReviewStatuses(dataset.submissions),
    xp: presentXpSummary(dataset.xpLedger),
    topStudents: presentTopStudents(
      buildTopStudents({
        assignments: dataset.assignments.map((assignment) => ({
          studentId: assignment.studentId,
          student: assignment.student,
          status: assignment.status,
        })),
        xpEntries: dataset.xpLedger.map((entry) => ({
          studentId: entry.studentId,
          student: entry.student,
          amount: entry.amount,
        })),
        limit: 10,
      }),
    ),
    students: studentRows,
  };
}

function presentScope(scope: ReinforcementOverviewScope) {
  return {
    academicYearId: scope.academicYearId,
    yearId: scope.yearId,
    termId: scope.termId,
    stageId: scope.stageId,
    gradeId: scope.gradeId,
    sectionId: scope.sectionId,
    classroomId: scope.classroomId,
    studentId: scope.studentId,
    source: scope.source ? presentEnum(scope.source) : null,
  };
}

function presentTaskSummary(tasks: OverviewTaskRecord[]) {
  const summary = summarizeTaskStatuses(tasks);

  return {
    total: summary.total,
    active: summary.active,
    cancelled: summary.cancelled,
    bySource: summary.bySource.map((row) => ({
      source: presentEnum(row.source),
      count: row.count,
    })),
    byStatus: summary.byStatus.map((row) => ({
      status: presentEnum(row.status),
      count: row.count,
    })),
  };
}

function presentXpSummary(entries: OverviewXpLedgerRecord[]) {
  const summary = summarizeXpBySource(entries);

  return {
    totalXp: summary.totalXp,
    studentsWithXp: summary.studentsWithXp,
    averageXp: summary.averageXp,
    bySourceType: summary.bySourceType.map((row) => ({
      sourceType: presentEnum(row.sourceType),
      count: row.count,
      totalXp: row.totalXp,
    })),
  };
}

function presentTopStudents(rows: TopStudentRow[]) {
  return rows.map((row) => ({
    studentId: row.studentId,
    student: row.student,
    totalXp: row.totalXp,
    completedAssignments: row.completedAssignments,
    completionRate: row.completionRate,
  }));
}

function buildClassroomStudentRows(dataset: ClassroomSummaryDataset) {
  const xpByStudent = new Map<string, number>();
  const assignmentsByStudent = new Map<
    string,
    { total: number; completed: number }
  >();
  const pendingReviewsByStudent = new Map<string, number>();

  for (const entry of dataset.xpLedger) {
    xpByStudent.set(
      entry.studentId,
      (xpByStudent.get(entry.studentId) ?? 0) + entry.amount,
    );
  }

  for (const assignment of dataset.assignments) {
    const row = assignmentsByStudent.get(assignment.studentId) ?? {
      total: 0,
      completed: 0,
    };
    row.total += 1;
    if (assignment.status === ReinforcementTaskStatus.COMPLETED) {
      row.completed += 1;
    }
    assignmentsByStudent.set(assignment.studentId, row);
  }

  for (const submission of dataset.submissions) {
    if (submission.status === ReinforcementSubmissionStatus.SUBMITTED) {
      pendingReviewsByStudent.set(
        submission.studentId,
        (pendingReviewsByStudent.get(submission.studentId) ?? 0) + 1,
      );
    }
  }

  return dataset.enrollments.map((enrollment) => {
    const assignmentSummary = assignmentsByStudent.get(enrollment.studentId) ?? {
      total: 0,
      completed: 0,
    };

    return {
      studentId: enrollment.studentId,
      name: buildStudentName(enrollment.student),
      totalXp: xpByStudent.get(enrollment.studentId) ?? 0,
      assignmentsTotal: assignmentSummary.total,
      assignmentsCompleted: assignmentSummary.completed,
      completionRate: calculateCompletionRate(
        assignmentSummary.completed,
        assignmentSummary.total,
      ),
      pendingReviews: pendingReviewsByStudent.get(enrollment.studentId) ?? 0,
    };
  });
}

function buildRecentActivity(params: {
  submissions: OverviewSubmissionRecord[];
  reviews: OverviewReviewRecord[];
  xpLedger: OverviewXpLedgerRecord[];
  limit: number;
}) {
  const submissionActivities = params.submissions
    .filter((submission) => Boolean(submission.submittedAt))
    .map((submission) => ({
      id: submission.id,
      type: 'submission',
      timestamp: presentNullableDate(submission.submittedAt),
      student: presentStudent(submission.student),
      task: presentCompactTask(submission.task),
      stage: {
        id: submission.stage.id,
        titleEn: submission.stage.titleEn,
        titleAr: submission.stage.titleAr,
      },
      status: presentEnum(submission.status),
    }));

  const reviewActivities = params.reviews.map((review) => ({
    id: review.id,
    type: 'review',
    timestamp: presentDate(review.reviewedAt),
    student: presentStudent(review.student),
    task: presentCompactTask(review.task),
    stage: {
      id: review.stage.id,
      titleEn: review.stage.titleEn,
      titleAr: review.stage.titleAr,
    },
    outcome: presentReviewOutcome(review.outcome),
  }));

  const xpActivities = params.xpLedger.map((entry) => ({
    id: entry.id,
    type: 'xp_ledger',
    timestamp: presentDate(entry.occurredAt),
    student: presentStudent(entry.student),
    sourceType: presentEnum(entry.sourceType),
    sourceId: entry.sourceId,
    amount: entry.amount,
    reason: entry.reason,
  }));

  return [...submissionActivities, ...reviewActivities, ...xpActivities]
    .filter((activity) => Boolean(activity.timestamp))
    .sort((left, right) =>
      String(right.timestamp).localeCompare(String(left.timestamp)),
    )
    .slice(0, params.limit);
}

function presentStudentTaskRow(assignment: OverviewAssignmentRecord) {
  return {
    taskId: assignment.taskId,
    assignmentId: assignment.id,
    status: presentEnum(assignment.status),
    progress: assignment.progress,
    assignedAt: presentDate(assignment.assignedAt),
    startedAt: presentNullableDate(assignment.startedAt),
    completedAt: presentNullableDate(assignment.completedAt),
    cancelledAt: presentNullableDate(assignment.cancelledAt),
    task: presentCompactTask(assignment.task),
  };
}

function presentCompactTask(task: OverviewTaskRecord) {
  return {
    id: task.id,
    academicYearId: task.academicYearId,
    termId: task.termId,
    subjectId: task.subjectId,
    titleEn: task.titleEn,
    titleAr: task.titleAr,
    source: presentEnum(task.source),
    status: presentEnum(task.status),
    dueDate: presentNullableDate(task.dueDate),
    assignedById: task.assignedById,
    assignedByName: task.assignedByName,
    createdAt: presentDate(task.createdAt),
    updatedAt: presentDate(task.updatedAt),
  };
}

function presentReview(review: OverviewReviewRecord) {
  return {
    id: review.id,
    submissionId: review.submissionId,
    assignmentId: review.assignmentId,
    taskId: review.taskId,
    stageId: review.stageId,
    outcome: presentReviewOutcome(review.outcome),
    note: review.note,
    noteAr: review.noteAr,
    reviewedById: review.reviewedById,
    reviewedAt: presentDate(review.reviewedAt),
  };
}

function presentXpLedgerEntry(entry: OverviewXpLedgerRecord) {
  return {
    id: entry.id,
    academicYearId: entry.academicYearId,
    termId: entry.termId,
    studentId: entry.studentId,
    enrollmentId: entry.enrollmentId,
    assignmentId: entry.assignmentId,
    policyId: entry.policyId,
    sourceType: presentEnum(entry.sourceType),
    sourceId: entry.sourceId,
    amount: entry.amount,
    reason: entry.reason,
    reasonAr: entry.reasonAr,
    actorUserId: entry.actorUserId,
    occurredAt: presentDate(entry.occurredAt),
    createdAt: presentDate(entry.createdAt),
  };
}

function presentStudent(student: OverviewStudentRecord | null) {
  if (!student) {
    return {
      id: null,
      firstName: null,
      lastName: null,
      name: null,
      nameAr: null,
      code: null,
      admissionNo: null,
    };
  }

  return {
    id: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    name: buildStudentName(student),
    nameAr: null,
    code: null,
    admissionNo: null,
  };
}

function presentEnrollment(enrollment: OverviewEnrollmentRecord) {
  return {
    enrollmentId: enrollment.id,
    classroomId: enrollment.classroomId,
    sectionId: enrollment.classroom.sectionId,
    gradeId: enrollment.classroom.section.gradeId,
    stageId: enrollment.classroom.section.grade.stageId,
  };
}

function presentClassroom(classroom: OverviewClassroomRecord) {
  return {
    classroomId: classroom.id,
    classroomName: deriveName(classroom.nameAr, classroom.nameEn),
    sectionId: classroom.sectionId,
    sectionName: deriveName(classroom.section.nameAr, classroom.section.nameEn),
    gradeId: classroom.section.gradeId,
    gradeName: deriveName(
      classroom.section.grade.nameAr,
      classroom.section.grade.nameEn,
    ),
    stageId: classroom.section.grade.stageId,
    stageName: deriveName(
      classroom.section.grade.stage.nameAr,
      classroom.section.grade.stage.nameEn,
    ),
  };
}

function isActiveTaskAssignment(assignment: OverviewAssignmentRecord): boolean {
  return (
    assignment.status !== ReinforcementTaskStatus.CANCELLED &&
    assignment.task.status !== ReinforcementTaskStatus.CANCELLED
  );
}

export function presentEnum(value: string): string {
  return value.toLowerCase();
}

function presentReviewOutcome(outcome: ReinforcementReviewOutcome): string {
  return presentEnum(outcome);
}

function presentDate(date: Date): string {
  return date.toISOString();
}

function presentNullableDate(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

function deriveName(nameAr: string, nameEn: string): string {
  return nameEn.trim().length > 0 ? nameEn : nameAr;
}

function buildStudentName(student: Pick<OverviewStudentRecord, 'firstName' | 'lastName'>) {
  return `${student.firstName} ${student.lastName}`.trim();
}
