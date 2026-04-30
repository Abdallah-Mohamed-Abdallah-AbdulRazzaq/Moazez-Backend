import {
  BehaviorPointLedgerEntryType,
  BehaviorRecordStatus,
  BehaviorRecordType,
  BehaviorSeverity,
} from '@prisma/client';
import { ValidationDomainException } from '../../../common/exceptions/domain-exception';
import {
  normalizeBehaviorRecordStatus,
  normalizeBehaviorRecordType,
  normalizeBehaviorSeverity,
  normalizeNullableText,
} from './behavior-records-domain';

export interface BehaviorDashboardScope {
  academicYearId: string | null;
  termId: string | null;
  studentId: string | null;
  classroomId: string | null;
  occurredFrom: Date | null;
  occurredTo: Date | null;
}

export interface BehaviorDashboardRecordInput {
  id: string;
  studentId: string;
  categoryId: string | null;
  status: BehaviorRecordStatus | string;
  type: BehaviorRecordType | string;
  severity: BehaviorSeverity | string;
  points: number;
  occurredAt: Date;
  createdAt: Date;
  submittedAt?: Date | null;
  reviewedAt?: Date | null;
  cancelledAt?: Date | null;
  category?: BehaviorDashboardCategoryInput | null;
  student?: BehaviorDashboardStudentInput | null;
}

export interface BehaviorDashboardLedgerInput {
  id: string;
  studentId: string;
  recordId: string;
  categoryId: string | null;
  entryType: BehaviorPointLedgerEntryType | string;
  amount: number;
  occurredAt: Date;
  actorId?: string | null;
  student?: BehaviorDashboardStudentInput | null;
}

export interface BehaviorDashboardCategoryInput {
  id: string;
  code: string;
  nameEn?: string | null;
  nameAr?: string | null;
  type?: BehaviorRecordType | string;
  isActive?: boolean;
}

export interface BehaviorDashboardStudentInput {
  id: string;
  firstName: string;
  lastName: string;
  nameAr?: string | null;
  code?: string | null;
  admissionNo?: string | null;
}

export interface BehaviorStatusSummary {
  total: number;
  draft: number;
  submitted: number;
  approved: number;
  rejected: number;
  cancelled: number;
}

export interface BehaviorTypeSummary {
  positive: number;
  negative: number;
}

export interface BehaviorSeveritySummary {
  low: number;
  medium: number;
  high: number;
  critical: number;
}

export interface BehaviorReviewSummary {
  pendingReview: number;
  reviewed: number;
  approvalRate: number;
  rejectionRate: number;
}

export interface BehaviorPointSummary {
  totalPoints: number;
  positivePoints: number;
  negativePoints: number;
  awardEntries: number;
  penaltyEntries: number;
  studentsWithPoints: number;
  averagePointsPerStudent: number;
}

export interface BehaviorCategorySummary {
  totalCategories: number;
  activeCategories: number;
  inactiveCategories: number;
}

export interface TopBehaviorCategoryRow {
  categoryId: string;
  code: string | null;
  nameEn: string | null;
  nameAr: string | null;
  type: BehaviorRecordType | string | null;
  totalRecords: number;
  approvedRecords: number;
  totalPoints: number;
}

export interface StudentBehaviorSummaryRow {
  studentId: string;
  student: BehaviorDashboardStudentInput;
  records: BehaviorStatusSummary & BehaviorTypeSummary;
  review: BehaviorReviewSummary;
  points: BehaviorPointSummary;
}

const LEDGER_ENTRY_ALIASES: Record<string, BehaviorPointLedgerEntryType> = {
  award: BehaviorPointLedgerEntryType.AWARD,
  penalty: BehaviorPointLedgerEntryType.PENALTY,
  reversal: BehaviorPointLedgerEntryType.REVERSAL,
};

export function assertValidBehaviorDashboardDateRange(range: {
  occurredFrom?: Date | null;
  occurredTo?: Date | null;
}): void {
  if (
    range.occurredFrom &&
    range.occurredTo &&
    range.occurredFrom > range.occurredTo
  ) {
    throw new ValidationDomainException(
      'Behavior dashboard date range start must be before or equal to end',
      {
        occurredFrom: range.occurredFrom.toISOString(),
        occurredTo: range.occurredTo.toISOString(),
      },
    );
  }
}

export function summarizeBehaviorRecordStatuses(
  records: Array<{ status: BehaviorRecordStatus | string }>,
): BehaviorStatusSummary {
  const summary: BehaviorStatusSummary = {
    total: records.length,
    draft: 0,
    submitted: 0,
    approved: 0,
    rejected: 0,
    cancelled: 0,
  };

  for (const record of records) {
    const status = normalizeBehaviorRecordStatus(record.status);
    if (status === BehaviorRecordStatus.DRAFT) summary.draft += 1;
    if (status === BehaviorRecordStatus.SUBMITTED) summary.submitted += 1;
    if (status === BehaviorRecordStatus.APPROVED) summary.approved += 1;
    if (status === BehaviorRecordStatus.REJECTED) summary.rejected += 1;
    if (status === BehaviorRecordStatus.CANCELLED) summary.cancelled += 1;
  }

  return summary;
}

export function summarizeBehaviorRecordTypes(
  records: Array<{ type: BehaviorRecordType | string }>,
): BehaviorTypeSummary {
  const summary: BehaviorTypeSummary = { positive: 0, negative: 0 };

  for (const record of records) {
    const type = normalizeBehaviorRecordType(record.type);
    if (type === BehaviorRecordType.POSITIVE) summary.positive += 1;
    if (type === BehaviorRecordType.NEGATIVE) summary.negative += 1;
  }

  return summary;
}

export function summarizeBehaviorSeverity(
  records: Array<{ severity: BehaviorSeverity | string }>,
): BehaviorSeveritySummary {
  const summary: BehaviorSeveritySummary = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  for (const record of records) {
    const severity = normalizeBehaviorSeverity(record.severity);
    if (severity === BehaviorSeverity.LOW) summary.low += 1;
    if (severity === BehaviorSeverity.MEDIUM) summary.medium += 1;
    if (severity === BehaviorSeverity.HIGH) summary.high += 1;
    if (severity === BehaviorSeverity.CRITICAL) summary.critical += 1;
  }

  return summary;
}

export function summarizeBehaviorReview(
  records: Array<{ status: BehaviorRecordStatus | string }>,
): BehaviorReviewSummary {
  const statuses = summarizeBehaviorRecordStatuses(records);
  const reviewed = statuses.approved + statuses.rejected;

  return {
    pendingReview: statuses.submitted,
    reviewed,
    approvalRate: calculateApprovalRate(statuses.approved, reviewed),
    rejectionRate: calculateRejectionRate(statuses.rejected, reviewed),
  };
}

export function calculateApprovalRate(
  approved: number,
  reviewed: number,
): number {
  if (reviewed <= 0) return 0;
  return round4(approved / reviewed);
}

export function calculateRejectionRate(
  rejected: number,
  reviewed: number,
): number {
  if (reviewed <= 0) return 0;
  return round4(rejected / reviewed);
}

export function summarizeBehaviorPoints(
  entries: BehaviorDashboardLedgerInput[],
  averageDenominator?: number,
): BehaviorPointSummary {
  let positivePoints = 0;
  let negativePoints = 0;
  let awardEntries = 0;
  let penaltyEntries = 0;
  const studentsWithPoints = new Set<string>();

  for (const entry of entries) {
    const entryType = normalizeLedgerEntryType(entry.entryType);
    if (entryType === BehaviorPointLedgerEntryType.AWARD) {
      positivePoints += entry.amount;
      awardEntries += 1;
      studentsWithPoints.add(entry.studentId);
    }
    if (entryType === BehaviorPointLedgerEntryType.PENALTY) {
      negativePoints += entry.amount;
      penaltyEntries += 1;
      studentsWithPoints.add(entry.studentId);
    }
  }

  const totalPoints = positivePoints + negativePoints;
  const denominator = averageDenominator ?? studentsWithPoints.size;

  return {
    totalPoints,
    positivePoints,
    negativePoints,
    awardEntries,
    penaltyEntries,
    studentsWithPoints: studentsWithPoints.size,
    averagePointsPerStudent: calculateAveragePointsPerStudent(
      totalPoints,
      denominator,
    ),
  };
}

export function calculateAveragePointsPerStudent(
  totalPoints: number,
  studentsCount: number,
): number {
  if (studentsCount <= 0) return 0;
  return round4(totalPoints / studentsCount);
}

export function summarizeBehaviorCategories(
  categories: Array<{ isActive: boolean }>,
): BehaviorCategorySummary {
  let activeCategories = 0;
  let inactiveCategories = 0;

  for (const category of categories) {
    if (category.isActive) activeCategories += 1;
    else inactiveCategories += 1;
  }

  return {
    totalCategories: categories.length,
    activeCategories,
    inactiveCategories,
  };
}

export function buildTopBehaviorCategories(params: {
  records: BehaviorDashboardRecordInput[];
  ledgerEntries: BehaviorDashboardLedgerInput[];
  categories: BehaviorDashboardCategoryInput[];
  limit?: number;
}): TopBehaviorCategoryRow[] {
  const rows = new Map<string, TopBehaviorCategoryRow>();
  const categoriesById = new Map(
    params.categories.map((category) => [category.id, category]),
  );

  for (const record of params.records) {
    if (!record.categoryId) continue;
    const row = getOrCreateCategoryRow(rows, record.categoryId, categoriesById);
    row.totalRecords += 1;
    if (
      normalizeBehaviorRecordStatus(record.status) ===
      BehaviorRecordStatus.APPROVED
    ) {
      row.approvedRecords += 1;
    }
  }

  for (const entry of params.ledgerEntries) {
    if (!entry.categoryId) continue;
    const entryType = normalizeLedgerEntryType(entry.entryType);
    if (
      entryType !== BehaviorPointLedgerEntryType.AWARD &&
      entryType !== BehaviorPointLedgerEntryType.PENALTY
    ) {
      continue;
    }
    const row = getOrCreateCategoryRow(rows, entry.categoryId, categoriesById);
    row.totalPoints += entry.amount;
  }

  return sortTopBehaviorCategories([...rows.values()]).slice(
    0,
    params.limit ?? 10,
  );
}

export function sortTopBehaviorCategories(
  rows: TopBehaviorCategoryRow[],
): TopBehaviorCategoryRow[] {
  return [...rows].sort((left, right) => {
    if (right.totalRecords !== left.totalRecords) {
      return right.totalRecords - left.totalRecords;
    }
    if (right.approvedRecords !== left.approvedRecords) {
      return right.approvedRecords - left.approvedRecords;
    }
    const pointsDiff = Math.abs(right.totalPoints) - Math.abs(left.totalPoints);
    if (pointsDiff !== 0) return pointsDiff;

    const leftName = categorySortName(left);
    const rightName = categorySortName(right);
    const nameCompare = leftName.localeCompare(rightName);
    return nameCompare !== 0
      ? nameCompare
      : left.categoryId.localeCompare(right.categoryId);
  });
}

export function sortRecentBehaviorActivity<
  T extends { occurredAt: Date; createdAt: Date; id: string },
>(records: T[]): T[] {
  return [...records].sort((left, right) => {
    const occurredDiff = right.occurredAt.getTime() - left.occurredAt.getTime();
    if (occurredDiff !== 0) return occurredDiff;

    const createdDiff = right.createdAt.getTime() - left.createdAt.getTime();
    if (createdDiff !== 0) return createdDiff;

    return left.id.localeCompare(right.id);
  });
}

export function buildStudentBehaviorSummaries(params: {
  students: BehaviorDashboardStudentInput[];
  records: BehaviorDashboardRecordInput[];
  ledgerEntries: BehaviorDashboardLedgerInput[];
}): StudentBehaviorSummaryRow[] {
  return params.students.map((student) => {
    const records = params.records.filter(
      (record) => record.studentId === student.id,
    );
    const ledgerEntries = params.ledgerEntries.filter(
      (entry) => entry.studentId === student.id,
    );
    const statuses = summarizeBehaviorRecordStatuses(records);
    const types = summarizeBehaviorRecordTypes(records);

    return {
      studentId: student.id,
      student,
      records: { ...statuses, ...types },
      review: summarizeBehaviorReview(records),
      points: summarizeBehaviorPoints(ledgerEntries, 1),
    };
  });
}

export function normalizeBehaviorDashboardScope(input: {
  academicYearId?: string | null;
  termId?: string | null;
  studentId?: string | null;
  classroomId?: string | null;
  occurredFrom?: Date | null;
  occurredTo?: Date | null;
}): BehaviorDashboardScope {
  return {
    academicYearId: input.academicYearId ?? null,
    termId: input.termId ?? null,
    studentId: input.studentId ?? null,
    classroomId: input.classroomId ?? null,
    occurredFrom: input.occurredFrom ?? null,
    occurredTo: input.occurredTo ?? null,
  };
}

function getOrCreateCategoryRow(
  rows: Map<string, TopBehaviorCategoryRow>,
  categoryId: string,
  categoriesById: Map<string, BehaviorDashboardCategoryInput>,
): TopBehaviorCategoryRow {
  const existing = rows.get(categoryId);
  if (existing) return existing;

  const category = categoriesById.get(categoryId);
  const row: TopBehaviorCategoryRow = {
    categoryId,
    code: category?.code ?? null,
    nameEn: normalizeNullableText(category?.nameEn),
    nameAr: normalizeNullableText(category?.nameAr),
    type: category?.type ?? null,
    totalRecords: 0,
    approvedRecords: 0,
    totalPoints: 0,
  };
  rows.set(categoryId, row);
  return row;
}

function categorySortName(row: TopBehaviorCategoryRow): string {
  return (
    normalizeNullableText(row.nameEn) ??
    normalizeNullableText(row.nameAr) ??
    normalizeNullableText(row.code) ??
    row.categoryId
  );
}

function normalizeLedgerEntryType(
  input: BehaviorPointLedgerEntryType | string,
): BehaviorPointLedgerEntryType {
  const normalized = String(input).trim();
  const aliasKey = normalized.replace(/[-\s]/g, '_').toLowerCase();
  const alias =
    LEDGER_ENTRY_ALIASES[aliasKey] ??
    LEDGER_ENTRY_ALIASES[aliasKey.replace(/_/g, '')];
  if (alias) return alias;

  const enumValue = normalized.toUpperCase() as BehaviorPointLedgerEntryType;
  if (Object.values(BehaviorPointLedgerEntryType).includes(enumValue)) {
    return enumValue;
  }

  throw new ValidationDomainException('Enum value is invalid', {
    field: 'entryType',
    value: input,
  });
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}
