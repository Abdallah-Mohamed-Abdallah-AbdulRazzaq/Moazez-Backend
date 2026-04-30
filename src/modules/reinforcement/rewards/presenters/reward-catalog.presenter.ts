import { isRewardCatalogAvailable } from '../domain/reward-catalog-domain';
import { RewardCatalogItemRecord } from '../infrastructure/reward-catalog.repository';

export function presentRewardCatalogList(params: {
  items: RewardCatalogItemRecord[];
  total: number;
  limit?: number | null;
  offset?: number | null;
}) {
  return {
    items: params.items.map((item) => presentRewardCatalogItem(item)),
    total: params.total,
    limit: params.limit ?? null,
    offset: params.offset ?? null,
  };
}

export function presentRewardCatalogItem(item: RewardCatalogItemRecord) {
  return {
    id: item.id,
    academicYearId: item.academicYearId,
    termId: item.termId,
    titleEn: item.titleEn,
    titleAr: item.titleAr,
    descriptionEn: item.descriptionEn,
    descriptionAr: item.descriptionAr,
    type: presentEnum(item.type),
    status: presentEnum(item.status),
    minTotalXp: item.minTotalXp,
    stockQuantity: item.stockQuantity,
    stockRemaining: item.stockRemaining,
    isUnlimited: item.isUnlimited,
    isAvailable: isRewardCatalogAvailable(item),
    imageFileId: item.imageFileId,
    sortOrder: item.sortOrder,
    publishedAt: presentNullableDate(item.publishedAt),
    publishedById: item.publishedById,
    archivedAt: presentNullableDate(item.archivedAt),
    archivedById: item.archivedById,
    createdById: item.createdById,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    academicYear: item.academicYear
      ? presentAcademicYearSummary(item.academicYear)
      : null,
    term: item.term ? presentTermSummary(item.term) : null,
    imageFile: item.imageFile ? presentImageFileSummary(item.imageFile) : null,
  };
}

function presentAcademicYearSummary(
  academicYear: NonNullable<RewardCatalogItemRecord['academicYear']>,
) {
  return {
    id: academicYear.id,
    nameEn: academicYear.nameEn,
    nameAr: academicYear.nameAr,
    isActive: academicYear.isActive,
  };
}

function presentTermSummary(term: NonNullable<RewardCatalogItemRecord['term']>) {
  return {
    id: term.id,
    academicYearId: term.academicYearId,
    nameEn: term.nameEn,
    nameAr: term.nameAr,
    isActive: term.isActive,
  };
}

function presentImageFileSummary(
  file: NonNullable<RewardCatalogItemRecord['imageFile']>,
) {
  return {
    id: file.id,
    originalName: file.originalName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes.toString(),
    visibility: presentEnum(file.visibility),
    createdAt: file.createdAt.toISOString(),
  };
}

function presentEnum(value: string): string {
  return value.toLowerCase();
}

function presentNullableDate(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}
