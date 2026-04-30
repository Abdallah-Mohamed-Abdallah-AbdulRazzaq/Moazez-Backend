import {
  BehaviorPointLedgerEntryType,
  BehaviorRecordStatus,
} from '@prisma/client';
import {
  BehaviorDashboardScope,
  buildStudentBehaviorSummaries,
  buildTopBehaviorCategories,
  sortRecentBehaviorActivity,
  summarizeBehaviorCategories,
  summarizeBehaviorPoints,
  summarizeBehaviorRecordStatuses,
  summarizeBehaviorRecordTypes,
  summarizeBehaviorReview,
  summarizeBehaviorSeverity,
  TopBehaviorCategoryRow,
} from '../domain/behavior-dashboard-domain';
import {
  BehaviorDashboardCategoryRecord,
  BehaviorDashboardClassroomRecord,
  BehaviorDashboardEnrollmentRecord,
  BehaviorDashboardPointLedgerRecord,
  BehaviorDashboardRecord,
  BehaviorDashboardStudentRecord,
  BehaviorOverviewDataset,
  ClassroomBehaviorSummaryDataset,
  StudentBehaviorSummaryDataset,
} from '../infrastructure/behavior-dashboard.repository';

export function presentBehaviorOverview(params: {
  scope: BehaviorDashboardScope;
  dataset: BehaviorOverviewDataset;
  includeRecentActivity: boolean;
  includeTopCategories: boolean;
}) {
  const records = {
    ...summarizeBehaviorRecordStatuses(params.dataset.records),
    ...summarizeBehaviorRecordTypes(params.dataset.records),
  };
  const pointSummary = summarizeBehaviorPoints(
    params.dataset.ledgerEntries,
    params.dataset.scopedStudents.length > 0
      ? params.dataset.scopedStudents.length
      : undefined,
  );
  const categorySummary = summarizeBehaviorCategories(
    params.dataset.categories,
  );

  return {
    scope: presentScope(params.scope),
    records,
    severity: summarizeBehaviorSeverity(params.dataset.records),
    review: summarizeBehaviorReview(params.dataset.records),
    points: pointSummary,
    categories: {
      ...categorySummary,
      topCategories: params.includeTopCategories
        ? presentTopCategories(
            buildTopBehaviorCategories({
              records: params.dataset.records,
              ledgerEntries: params.dataset.ledgerEntries,
              categories: params.dataset.categories,
              limit: 10,
            }),
          )
        : [],
    },
    recentActivity: params.includeRecentActivity
      ? presentRecentActivity(params.dataset.records)
      : [],
    topStudents: presentTopStudents(params.dataset.ledgerEntries),
  };
}

export function presentStudentBehaviorSummary(params: {
  scope: BehaviorDashboardScope;
  dataset: StudentBehaviorSummaryDataset;
  includeTimeline: boolean;
  includeCategoryBreakdown: boolean;
  includeLedger: boolean;
}) {
  return {
    student: presentStudent(params.dataset.student),
    scope: presentScope(params.scope),
    records: {
      ...summarizeBehaviorRecordStatuses(params.dataset.records),
      ...summarizeBehaviorRecordTypes(params.dataset.records),
    },
    severity: summarizeBehaviorSeverity(params.dataset.records),
    points: presentStudentPoints(
      summarizeBehaviorPoints(params.dataset.ledgerEntries, 1),
    ),
    review: summarizeBehaviorReview(params.dataset.records),
    categoryBreakdown: params.includeCategoryBreakdown
      ? presentCategoryBreakdown(params.dataset)
      : [],
    timeline: params.includeTimeline
      ? presentRecentActivity(params.dataset.records)
      : [],
    ledger: params.includeLedger
      ? params.dataset.ledgerEntries.map((entry) => presentLedgerEntry(entry))
      : [],
  };
}

export function presentClassroomBehaviorSummary(params: {
  scope: BehaviorDashboardScope;
  dataset: ClassroomBehaviorSummaryDataset;
  includeStudents: boolean;
  includeCategoryBreakdown: boolean;
  includeRecentActivity: boolean;
}) {
  const pointSummary = summarizeBehaviorPoints(
    params.dataset.ledgerEntries,
    params.dataset.activeEnrollments.length,
  );
  const studentsWithBehaviorRecords = new Set(
    params.dataset.records.map((record) => record.studentId),
  ).size;

  return {
    classroom: presentClassroom(params.dataset.classroom),
    scope: presentScope(params.scope),
    students: {
      totalEnrolledStudents: params.dataset.activeEnrollments.length,
      studentsWithBehaviorRecords,
      studentsWithPoints: pointSummary.studentsWithPoints,
    },
    records: {
      ...summarizeBehaviorRecordStatuses(params.dataset.records),
      ...summarizeBehaviorRecordTypes(params.dataset.records),
    },
    severity: summarizeBehaviorSeverity(params.dataset.records),
    points: {
      totalPoints: pointSummary.totalPoints,
      positivePoints: pointSummary.positivePoints,
      negativePoints: pointSummary.negativePoints,
      averagePointsPerStudent: pointSummary.averagePointsPerStudent,
    },
    review: summarizeBehaviorReview(params.dataset.records),
    categoryBreakdown: params.includeCategoryBreakdown
      ? presentCategoryBreakdown(params.dataset)
      : [],
    studentSummaries: params.includeStudents
      ? buildStudentBehaviorSummaries({
          students: params.dataset.activeEnrollments.map(
            (enrollment) => enrollment.student,
          ),
          records: params.dataset.records,
          ledgerEntries: params.dataset.ledgerEntries,
        }).map((row) => ({
          student: presentStudent(row.student),
          records: row.records,
          review: row.review,
          points: presentStudentPoints(row.points),
        }))
      : [],
    recentActivity: params.includeRecentActivity
      ? presentRecentActivity(params.dataset.records)
      : [],
  };
}

function presentScope(scope: BehaviorDashboardScope) {
  return {
    academicYearId: scope.academicYearId,
    termId: scope.termId,
    studentId: scope.studentId,
    classroomId: scope.classroomId,
    occurredFrom: scope.occurredFrom ? scope.occurredFrom.toISOString() : null,
    occurredTo: scope.occurredTo ? scope.occurredTo.toISOString() : null,
  };
}

function presentStudent(
  student:
    | BehaviorDashboardStudentRecord
    | {
        id: string;
        firstName: string;
        lastName: string;
        nameAr?: string | null;
        code?: string | null;
        admissionNo?: string | null;
      },
) {
  return {
    id: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    displayName: `${student.firstName} ${student.lastName}`.trim(),
    nameAr: 'nameAr' in student ? (student.nameAr ?? null) : null,
    code: 'code' in student ? (student.code ?? null) : null,
    admissionNo:
      'admissionNo' in student ? (student.admissionNo ?? null) : null,
  };
}

function presentClassroom(classroom: BehaviorDashboardClassroomRecord) {
  return {
    id: classroom.id,
    name: classroom.nameEn,
    nameAr: classroom.nameAr,
    code: null,
    section: classroom.section
      ? {
          id: classroom.section.id,
          name: classroom.section.nameEn,
          nameAr: classroom.section.nameAr,
          code: null,
        }
      : null,
    grade: classroom.section?.grade
      ? {
          id: classroom.section.grade.id,
          name: classroom.section.grade.nameEn,
          nameAr: classroom.section.grade.nameAr,
          code: null,
        }
      : null,
    stage: classroom.section?.grade?.stage
      ? {
          id: classroom.section.grade.stage.id,
          name: classroom.section.grade.stage.nameEn,
          nameAr: classroom.section.grade.stage.nameAr,
          code: null,
        }
      : null,
  };
}

function presentRecentActivity(records: BehaviorDashboardRecord[]) {
  return sortRecentBehaviorActivity(records)
    .slice(0, 15)
    .map((record) => ({
      id: record.id,
      status: presentEnum(record.status),
      type: presentEnum(record.type),
      severity: presentEnum(record.severity),
      studentId: record.studentId,
      categoryId: record.categoryId,
      points: record.points,
      occurredAt: record.occurredAt.toISOString(),
      submittedAt: presentNullableDate(record.submittedAt),
      reviewedAt: presentNullableDate(record.reviewedAt),
      cancelledAt: presentNullableDate(record.cancelledAt),
    }));
}

function presentLedgerEntry(entry: BehaviorDashboardPointLedgerRecord) {
  return {
    id: entry.id,
    entryType: presentEnum(entry.entryType),
    amount: entry.amount,
    occurredAt: entry.occurredAt.toISOString(),
    recordId: entry.recordId,
    categoryId: entry.categoryId,
    actorId: entry.actorId,
  };
}

function presentTopCategories(rows: TopBehaviorCategoryRow[]) {
  return rows.map((row) => ({
    categoryId: row.categoryId,
    code: row.code,
    nameEn: row.nameEn,
    nameAr: row.nameAr,
    type: row.type ? presentEnum(row.type) : null,
    totalRecords: row.totalRecords,
    approvedRecords: row.approvedRecords,
    totalPoints: row.totalPoints,
  }));
}

function presentCategoryBreakdown(dataset: {
  records: BehaviorDashboardRecord[];
  ledgerEntries: BehaviorDashboardPointLedgerRecord[];
  categories: BehaviorDashboardCategoryRecord[];
}) {
  const categoriesById = new Map(
    dataset.categories.map((category) => [category.id, category]),
  );
  const rows = new Map<
    string,
    {
      categoryId: string;
      category: BehaviorDashboardCategoryRecord | null;
      total: number;
      draft: number;
      submitted: number;
      approved: number;
      rejected: number;
      cancelled: number;
      positive: number;
      negative: number;
      totalPoints: number;
    }
  >();

  for (const record of dataset.records) {
    if (!record.categoryId) continue;
    const row = getOrCreateCategoryBreakdownRow(
      rows,
      record.categoryId,
      categoriesById,
    );
    row.total += 1;
    incrementRecordStatus(row, record.status);
    if (presentEnum(record.type) === 'positive') row.positive += 1;
    if (presentEnum(record.type) === 'negative') row.negative += 1;
  }

  for (const entry of dataset.ledgerEntries) {
    if (!entry.categoryId) continue;
    if (
      entry.entryType !== BehaviorPointLedgerEntryType.AWARD &&
      entry.entryType !== BehaviorPointLedgerEntryType.PENALTY
    ) {
      continue;
    }
    const row = getOrCreateCategoryBreakdownRow(
      rows,
      entry.categoryId,
      categoriesById,
    );
    row.totalPoints += entry.amount;
  }

  return [...rows.values()]
    .sort((left, right) => {
      if (right.total !== left.total) return right.total - left.total;
      if (right.approved !== left.approved)
        return right.approved - left.approved;
      const pointsDiff =
        Math.abs(right.totalPoints) - Math.abs(left.totalPoints);
      if (pointsDiff !== 0) return pointsDiff;
      return categoryName(left).localeCompare(categoryName(right));
    })
    .map((row) => ({
      categoryId: row.categoryId,
      code: row.category?.code ?? null,
      nameEn: row.category?.nameEn ?? null,
      nameAr: row.category?.nameAr ?? null,
      type: row.category ? presentEnum(row.category.type) : null,
      records: {
        total: row.total,
        draft: row.draft,
        submitted: row.submitted,
        approved: row.approved,
        rejected: row.rejected,
        cancelled: row.cancelled,
        positive: row.positive,
        negative: row.negative,
      },
      points: {
        totalPoints: row.totalPoints,
      },
    }));
}

function getOrCreateCategoryBreakdownRow(
  rows: Map<
    string,
    {
      categoryId: string;
      category: BehaviorDashboardCategoryRecord | null;
      total: number;
      draft: number;
      submitted: number;
      approved: number;
      rejected: number;
      cancelled: number;
      positive: number;
      negative: number;
      totalPoints: number;
    }
  >,
  categoryId: string,
  categoriesById: Map<string, BehaviorDashboardCategoryRecord>,
) {
  const existing = rows.get(categoryId);
  if (existing) return existing;

  const row = {
    categoryId,
    category: categoriesById.get(categoryId) ?? null,
    total: 0,
    draft: 0,
    submitted: 0,
    approved: 0,
    rejected: 0,
    cancelled: 0,
    positive: 0,
    negative: 0,
    totalPoints: 0,
  };
  rows.set(categoryId, row);
  return row;
}

function incrementRecordStatus(
  row: {
    draft: number;
    submitted: number;
    approved: number;
    rejected: number;
    cancelled: number;
  },
  status: BehaviorRecordStatus | string,
) {
  const normalized = presentEnum(status);
  if (normalized === 'draft') row.draft += 1;
  if (normalized === 'submitted') row.submitted += 1;
  if (normalized === 'approved') row.approved += 1;
  if (normalized === 'rejected') row.rejected += 1;
  if (normalized === 'cancelled') row.cancelled += 1;
}

function presentStudentPoints(points: {
  totalPoints: number;
  positivePoints: number;
  negativePoints: number;
  awardEntries: number;
  penaltyEntries: number;
}) {
  return {
    totalPoints: points.totalPoints,
    positivePoints: points.positivePoints,
    negativePoints: points.negativePoints,
    awardEntries: points.awardEntries,
    penaltyEntries: points.penaltyEntries,
  };
}

function presentTopStudents(entries: BehaviorDashboardPointLedgerRecord[]) {
  const rows = new Map<
    string,
    {
      student: BehaviorDashboardStudentRecord | null;
      totalPoints: number;
      positivePoints: number;
      negativePoints: number;
    }
  >();

  for (const entry of entries) {
    if (
      entry.entryType !== BehaviorPointLedgerEntryType.AWARD &&
      entry.entryType !== BehaviorPointLedgerEntryType.PENALTY
    ) {
      continue;
    }

    const current = rows.get(entry.studentId) ?? {
      student: entry.student ?? null,
      totalPoints: 0,
      positivePoints: 0,
      negativePoints: 0,
    };
    current.totalPoints += entry.amount;
    if (entry.entryType === BehaviorPointLedgerEntryType.AWARD) {
      current.positivePoints += entry.amount;
    }
    if (entry.entryType === BehaviorPointLedgerEntryType.PENALTY) {
      current.negativePoints += entry.amount;
    }
    rows.set(entry.studentId, current);
  }

  return [...rows.entries()]
    .sort(([leftId, left], [rightId, right]) => {
      if (right.totalPoints !== left.totalPoints) {
        return right.totalPoints - left.totalPoints;
      }
      const nameCompare = studentName(left.student).localeCompare(
        studentName(right.student),
      );
      return nameCompare !== 0 ? nameCompare : leftId.localeCompare(rightId);
    })
    .slice(0, 10)
    .map(([studentId, row]) => ({
      studentId,
      student: row.student ? presentStudent(row.student) : null,
      totalPoints: row.totalPoints,
      positivePoints: row.positivePoints,
      negativePoints: row.negativePoints,
    }));
}

function categoryName(row: {
  category: BehaviorDashboardCategoryRecord | null;
}) {
  return (
    row.category?.nameEn ?? row.category?.nameAr ?? row.category?.code ?? ''
  );
}

function studentName(student: BehaviorDashboardStudentRecord | null) {
  return student ? `${student.firstName} ${student.lastName}`.trim() : '';
}

function presentEnum(value: string): string {
  return value.toLowerCase();
}

function presentNullableDate(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}
