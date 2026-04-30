import { summarizeRedemptionStatusCounts } from '../domain/reward-redemptions-domain';
import { RewardRedemptionRecord } from '../infrastructure/reward-redemptions.repository';

export function presentRewardRedemptionList(params: {
  items: RewardRedemptionRecord[];
  total: number;
  statusCounts: Partial<Record<string, number>>;
  limit?: number | null;
  offset?: number | null;
}) {
  const statusCounts = summarizeRedemptionStatusCounts(params.statusCounts);

  return {
    items: params.items.map((item) => presentRewardRedemptionDetail(item)),
    summary: {
      total: params.total,
      ...statusCounts,
    },
    limit: params.limit ?? null,
    offset: params.offset ?? null,
  };
}

export function presentRewardRedemptionDetail(
  redemption: RewardRedemptionRecord,
) {
  return {
    id: redemption.id,
    catalogItemId: redemption.catalogItemId,
    studentId: redemption.studentId,
    enrollmentId: redemption.enrollmentId,
    academicYearId: redemption.academicYearId,
    termId: redemption.termId,
    status: presentEnum(redemption.status),
    requestSource: presentEnum(redemption.requestSource),
    requestedById: redemption.requestedById,
    reviewedById: redemption.reviewedById,
    fulfilledById: redemption.fulfilledById,
    cancelledById: redemption.cancelledById,
    requestedAt: redemption.requestedAt.toISOString(),
    reviewedAt: presentNullableDate(redemption.reviewedAt),
    fulfilledAt: presentNullableDate(redemption.fulfilledAt),
    cancelledAt: presentNullableDate(redemption.cancelledAt),
    requestNoteEn: redemption.requestNoteEn,
    requestNoteAr: redemption.requestNoteAr,
    reviewNoteEn: redemption.reviewNoteEn,
    reviewNoteAr: redemption.reviewNoteAr,
    fulfillmentNoteEn: redemption.fulfillmentNoteEn,
    fulfillmentNoteAr: redemption.fulfillmentNoteAr,
    cancellationReasonEn: redemption.cancellationReasonEn,
    cancellationReasonAr: redemption.cancellationReasonAr,
    eligibilitySnapshot: presentJsonObject(redemption.eligibilitySnapshot),
    createdAt: redemption.createdAt.toISOString(),
    updatedAt: redemption.updatedAt.toISOString(),
    catalogItem: presentCatalogItemSummary(redemption.catalogItem),
    student: presentStudentSummary(redemption.student),
    enrollment: redemption.enrollment
      ? presentEnrollmentSummary(redemption.enrollment)
      : null,
    academicYear: redemption.academicYear
      ? presentAcademicYearSummary(redemption.academicYear)
      : null,
    term: redemption.term ? presentTermSummary(redemption.term) : null,
  };
}

function presentCatalogItemSummary(
  catalogItem: RewardRedemptionRecord['catalogItem'],
) {
  return {
    id: catalogItem.id,
    titleEn: catalogItem.titleEn,
    titleAr: catalogItem.titleAr,
    type: presentEnum(catalogItem.type),
    status: presentEnum(catalogItem.status),
    minTotalXp: catalogItem.minTotalXp,
    isUnlimited: catalogItem.isUnlimited,
    stockRemaining: catalogItem.stockRemaining,
    imageFileId: catalogItem.imageFileId,
  };
}

function presentStudentSummary(student: RewardRedemptionRecord['student']) {
  return {
    id: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    nameAr: null,
    code: null,
    admissionNo: null,
  };
}

function presentEnrollmentSummary(
  enrollment: NonNullable<RewardRedemptionRecord['enrollment']>,
) {
  return {
    id: enrollment.id,
    academicYearId: enrollment.academicYearId,
    termId: enrollment.termId,
    classroomId: enrollment.classroomId,
    sectionId: enrollment.classroom.sectionId,
    gradeId: enrollment.classroom.section.gradeId,
    stageId: enrollment.classroom.section.grade.stageId,
  };
}

function presentAcademicYearSummary(
  academicYear: NonNullable<RewardRedemptionRecord['academicYear']>,
) {
  return {
    id: academicYear.id,
    nameEn: academicYear.nameEn,
    nameAr: academicYear.nameAr,
    isActive: academicYear.isActive,
  };
}

function presentTermSummary(term: NonNullable<RewardRedemptionRecord['term']>) {
  return {
    id: term.id,
    academicYearId: term.academicYearId,
    nameEn: term.nameEn,
    nameAr: term.nameAr,
    isActive: term.isActive,
  };
}

function presentEnum(value: string): string {
  return value.toLowerCase();
}

function presentNullableDate(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

function presentJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
