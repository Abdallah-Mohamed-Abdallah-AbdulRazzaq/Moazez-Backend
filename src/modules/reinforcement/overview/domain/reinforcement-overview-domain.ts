import {
  ReinforcementSource,
  ReinforcementSubmissionStatus,
  ReinforcementTaskStatus,
  XpSourceType,
} from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';

export interface OverviewDateRange {
  dateFrom?: Date;
  dateTo?: Date;
}

export interface ReinforcementOverviewScope {
  academicYearId: string;
  yearId: string;
  termId: string;
  stageId: string | null;
  gradeId: string | null;
  sectionId: string | null;
  classroomId: string | null;
  studentId: string | null;
  source: ReinforcementSource | null;
}

export interface AssignmentStatusSummary {
  total: number;
  notCompleted: number;
  inProgress: number;
  underReview: number;
  completed: number;
  cancelled: number;
  completionRate: number;
}

export interface TaskStatusSummary {
  total: number;
  active: number;
  cancelled: number;
  bySource: Array<{ source: ReinforcementSource; count: number }>;
  byStatus: Array<{ status: ReinforcementTaskStatus; count: number }>;
}

export interface ReviewStatusSummary {
  submitted: number;
  approved: number;
  rejected: number;
  pendingReview: number;
}

export interface XpSourceSummary {
  sourceType: XpSourceType;
  count: number;
  totalXp: number;
}

export interface XpSummary {
  totalXp: number;
  studentsWithXp: number;
  averageXp: number;
  bySourceType: XpSourceSummary[];
}

export interface TopStudentInput {
  studentId: string;
  student?: {
    id: string;
    firstName: string;
    lastName: string;
    nameAr?: string | null;
    code?: string | null;
    admissionNo?: string | null;
  } | null;
  status?: ReinforcementTaskStatus | string;
  amount?: number;
}

export interface TopStudentRow {
  studentId: string;
  student: {
    id: string;
    firstName: string;
    lastName: string;
    name: string;
    nameAr: string | null;
    code: string | null;
    admissionNo: string | null;
  };
  totalXp: number;
  completedAssignments: number;
  assignmentsTotal: number;
  completionRate: number;
}

const TASK_STATUSES = Object.values(ReinforcementTaskStatus);
const REINFORCEMENT_SOURCES = Object.values(ReinforcementSource);
const XP_SOURCE_TYPES = Object.values(XpSourceType);

const SOURCE_ALIASES: Record<string, ReinforcementSource> = {
  teacher: ReinforcementSource.TEACHER,
  parent: ReinforcementSource.PARENT,
  system: ReinforcementSource.SYSTEM,
};

export function calculateCompletionRate(
  completedAssignments: number,
  totalAssignments: number,
): number {
  if (totalAssignments <= 0) return 0;
  return round4(completedAssignments / totalAssignments);
}

export function summarizeAssignmentStatuses(
  assignments: Array<{ status: ReinforcementTaskStatus | string }>,
): AssignmentStatusSummary {
  const summary = {
    total: assignments.length,
    notCompleted: 0,
    inProgress: 0,
    underReview: 0,
    completed: 0,
    cancelled: 0,
    completionRate: 0,
  };

  for (const assignment of assignments) {
    const status = normalizeTaskStatus(assignment.status);
    if (status === ReinforcementTaskStatus.NOT_COMPLETED) {
      summary.notCompleted += 1;
    } else if (status === ReinforcementTaskStatus.IN_PROGRESS) {
      summary.inProgress += 1;
    } else if (status === ReinforcementTaskStatus.UNDER_REVIEW) {
      summary.underReview += 1;
    } else if (status === ReinforcementTaskStatus.COMPLETED) {
      summary.completed += 1;
    } else if (status === ReinforcementTaskStatus.CANCELLED) {
      summary.cancelled += 1;
    }
  }

  summary.completionRate = calculateCompletionRate(
    summary.completed,
    summary.total,
  );

  return summary;
}

export function summarizeTaskStatuses(
  tasks: Array<{
    source: ReinforcementSource | string;
    status: ReinforcementTaskStatus | string;
  }>,
): TaskStatusSummary {
  const sourceCounts = new Map<ReinforcementSource, number>(
    REINFORCEMENT_SOURCES.map((source) => [source, 0]),
  );
  const statusCounts = new Map<ReinforcementTaskStatus, number>(
    TASK_STATUSES.map((status) => [status, 0]),
  );

  for (const task of tasks) {
    const source = normalizeOverviewSource(task.source);
    const status = normalizeTaskStatus(task.status);
    sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
  }

  const cancelled = statusCounts.get(ReinforcementTaskStatus.CANCELLED) ?? 0;

  return {
    total: tasks.length,
    active: tasks.length - cancelled,
    cancelled,
    bySource: REINFORCEMENT_SOURCES.map((source) => ({
      source,
      count: sourceCounts.get(source) ?? 0,
    })),
    byStatus: TASK_STATUSES.map((status) => ({
      status,
      count: statusCounts.get(status) ?? 0,
    })),
  };
}

export function summarizeReviewStatuses(
  submissions: Array<{
    status: ReinforcementSubmissionStatus | string;
    submittedAt?: Date | string | null;
  }>,
): ReviewStatusSummary {
  const summary: ReviewStatusSummary = {
    submitted: 0,
    approved: 0,
    rejected: 0,
    pendingReview: 0,
  };

  for (const submission of submissions) {
    const status = normalizeSubmissionStatus(submission.status);
    if (status !== ReinforcementSubmissionStatus.PENDING && submission.submittedAt) {
      summary.submitted += 1;
    }
    if (status === ReinforcementSubmissionStatus.SUBMITTED) {
      summary.pendingReview += 1;
    } else if (status === ReinforcementSubmissionStatus.APPROVED) {
      summary.approved += 1;
    } else if (status === ReinforcementSubmissionStatus.REJECTED) {
      summary.rejected += 1;
    }
  }

  return summary;
}

export function summarizeXpBySource(
  entries: Array<{
    sourceType: XpSourceType | string;
    amount: number;
    studentId: string;
  }>,
): XpSummary {
  const bySource = new Map<XpSourceType, { count: number; totalXp: number }>(
    XP_SOURCE_TYPES.map((sourceType) => [sourceType, { count: 0, totalXp: 0 }]),
  );
  const studentIds = new Set<string>();
  let totalXp = 0;

  for (const entry of entries) {
    const sourceType = normalizeXpSourceType(entry.sourceType);
    const current = bySource.get(sourceType) ?? { count: 0, totalXp: 0 };
    current.count += 1;
    current.totalXp += entry.amount;
    bySource.set(sourceType, current);
    studentIds.add(entry.studentId);
    totalXp += entry.amount;
  }

  return {
    totalXp,
    studentsWithXp: studentIds.size,
    averageXp: calculateAverageXp(totalXp, studentIds.size),
    bySourceType: XP_SOURCE_TYPES.map((sourceType) => ({
      sourceType,
      count: bySource.get(sourceType)?.count ?? 0,
      totalXp: bySource.get(sourceType)?.totalXp ?? 0,
    })),
  };
}

export function calculateAverageXp(totalXp: number, studentsCount: number): number {
  if (studentsCount <= 0) return 0;
  return round4(totalXp / studentsCount);
}

export function buildTopStudents(params: {
  assignments: TopStudentInput[];
  xpEntries: TopStudentInput[];
  limit?: number;
}): TopStudentRow[] {
  const rows = new Map<string, TopStudentRow>();

  for (const entry of [...params.assignments, ...params.xpEntries]) {
    const row = getOrCreateTopStudentRow(rows, entry);
    if (entry.amount) {
      row.totalXp += entry.amount;
    }
    if (entry.status) {
      row.assignmentsTotal += 1;
      if (normalizeTaskStatus(entry.status) === ReinforcementTaskStatus.COMPLETED) {
        row.completedAssignments += 1;
      }
    }
    row.completionRate = calculateCompletionRate(
      row.completedAssignments,
      row.assignmentsTotal,
    );
  }

  return [...rows.values()]
    .sort((left, right) => {
      if (right.totalXp !== left.totalXp) return right.totalXp - left.totalXp;
      if (right.completedAssignments !== left.completedAssignments) {
        return right.completedAssignments - left.completedAssignments;
      }
      const nameCompare = left.student.name.localeCompare(right.student.name);
      return nameCompare !== 0
        ? nameCompare
        : left.studentId.localeCompare(right.studentId);
    })
    .slice(0, params.limit ?? 10);
}

export function normalizeOverviewScope(input: {
  academicYearId: string;
  termId: string;
  stageId?: string | null;
  gradeId?: string | null;
  sectionId?: string | null;
  classroomId?: string | null;
  studentId?: string | null;
  source?: ReinforcementSource | string | null;
}): ReinforcementOverviewScope {
  return {
    academicYearId: input.academicYearId,
    yearId: input.academicYearId,
    termId: input.termId,
    stageId: input.stageId ?? null,
    gradeId: input.gradeId ?? null,
    sectionId: input.sectionId ?? null,
    classroomId: input.classroomId ?? null,
    studentId: input.studentId ?? null,
    source: input.source ? normalizeOverviewSource(input.source) : null,
  };
}

export function assertValidDateRange(range: OverviewDateRange): void {
  if (range.dateFrom && range.dateTo && range.dateFrom > range.dateTo) {
    throw new ValidationDomainException(
      'Reinforcement overview date range start must be before or equal to end',
      {
        dateFrom: range.dateFrom.toISOString(),
        dateTo: range.dateTo.toISOString(),
      },
    );
  }
}

export function parseOptionalOverviewDate(
  value: string | null | undefined,
  field: string,
): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationDomainException('Date value is invalid', {
      field,
      value,
    });
  }

  return date;
}

export function normalizeOverviewSource(
  input: ReinforcementSource | string | null | undefined,
): ReinforcementSource {
  return normalizeEnumValue({
    input,
    aliases: SOURCE_ALIASES,
    values: REINFORCEMENT_SOURCES,
    field: 'source',
  });
}

function getOrCreateTopStudentRow(
  rows: Map<string, TopStudentRow>,
  input: TopStudentInput,
): TopStudentRow {
  const existing = rows.get(input.studentId);
  if (existing) return existing;

  const student = input.student ?? {
    id: input.studentId,
    firstName: '',
    lastName: '',
    nameAr: null,
    code: null,
    admissionNo: null,
  };
  const name = `${student.firstName} ${student.lastName}`.trim();
  const row: TopStudentRow = {
    studentId: input.studentId,
    student: {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      name,
      nameAr: student.nameAr ?? null,
      code: student.code ?? null,
      admissionNo: student.admissionNo ?? null,
    },
    totalXp: 0,
    completedAssignments: 0,
    assignmentsTotal: 0,
    completionRate: 0,
  };
  rows.set(input.studentId, row);
  return row;
}

function normalizeTaskStatus(
  input: ReinforcementTaskStatus | string,
): ReinforcementTaskStatus {
  return normalizeEnumValue({
    input,
    aliases: {
      pending: ReinforcementTaskStatus.NOT_COMPLETED,
      not_completed: ReinforcementTaskStatus.NOT_COMPLETED,
      notcompleted: ReinforcementTaskStatus.NOT_COMPLETED,
      in_progress: ReinforcementTaskStatus.IN_PROGRESS,
      inprogress: ReinforcementTaskStatus.IN_PROGRESS,
      under_review: ReinforcementTaskStatus.UNDER_REVIEW,
      underreview: ReinforcementTaskStatus.UNDER_REVIEW,
      completed: ReinforcementTaskStatus.COMPLETED,
      cancel: ReinforcementTaskStatus.CANCELLED,
      cancelled: ReinforcementTaskStatus.CANCELLED,
    },
    values: TASK_STATUSES,
    field: 'status',
  });
}

function normalizeSubmissionStatus(
  input: ReinforcementSubmissionStatus | string,
): ReinforcementSubmissionStatus {
  return normalizeEnumValue({
    input,
    aliases: {
      pending: ReinforcementSubmissionStatus.PENDING,
      submitted: ReinforcementSubmissionStatus.SUBMITTED,
      approved: ReinforcementSubmissionStatus.APPROVED,
      rejected: ReinforcementSubmissionStatus.REJECTED,
    },
    values: Object.values(ReinforcementSubmissionStatus),
    field: 'submissionStatus',
  });
}

function normalizeXpSourceType(input: XpSourceType | string): XpSourceType {
  return normalizeEnumValue({
    input,
    aliases: {
      reinforcement_task: XpSourceType.REINFORCEMENT_TASK,
      reinforcementtask: XpSourceType.REINFORCEMENT_TASK,
      reinforcement_review: XpSourceType.REINFORCEMENT_TASK,
      manual_bonus: XpSourceType.MANUAL_BONUS,
      manualbonus: XpSourceType.MANUAL_BONUS,
      behavior: XpSourceType.BEHAVIOR,
      grade: XpSourceType.GRADE,
      attendance: XpSourceType.ATTENDANCE,
      system: XpSourceType.SYSTEM,
    },
    values: XP_SOURCE_TYPES,
    field: 'sourceType',
  });
}

function normalizeEnumValue<TEnum extends string>(params: {
  input: TEnum | string | null | undefined;
  aliases: Record<string, TEnum>;
  values: TEnum[];
  field: string;
}): TEnum {
  const normalized =
    params.input === undefined || params.input === null
      ? ''
      : String(params.input).trim();
  if (!normalized) {
    throw new ValidationDomainException('Enum value is required', {
      field: params.field,
    });
  }

  const aliasKey = normalized.replace(/[-\s]/g, '_').toLowerCase();
  const alias = params.aliases[aliasKey] ?? params.aliases[aliasKey.replace(/_/g, '')];
  if (alias) return alias;

  const enumValue = normalized.toUpperCase() as TEnum;
  if (params.values.includes(enumValue)) return enumValue;

  throw new ValidationDomainException('Enum value is invalid', {
    field: params.field,
    value: params.input,
  });
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}
