import { BehaviorCategoryRecord } from '../infrastructure/behavior-categories.repository';

export function presentBehaviorCategoryList(params: {
  items: BehaviorCategoryRecord[];
  total: number;
  limit?: number | null;
  offset?: number | null;
  includeDeleted?: boolean;
}) {
  return {
    items: params.items.map((category) =>
      presentBehaviorCategory(category, {
        includeDeleted: params.includeDeleted ?? false,
      }),
    ),
    total: params.total,
    limit: params.limit ?? null,
    offset: params.offset ?? null,
  };
}

export function presentBehaviorCategory(
  category: BehaviorCategoryRecord,
  options?: { includeDeleted?: boolean },
) {
  return {
    id: category.id,
    code: category.code,
    nameEn: category.nameEn,
    nameAr: category.nameAr,
    descriptionEn: category.descriptionEn,
    descriptionAr: category.descriptionAr,
    type: presentEnum(category.type),
    defaultSeverity: presentEnum(category.defaultSeverity),
    defaultPoints: category.defaultPoints,
    isActive: category.isActive,
    sortOrder: category.sortOrder,
    createdById: category.createdById,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
    ...(options?.includeDeleted
      ? { deletedAt: presentNullableDate(category.deletedAt) }
      : {}),
  };
}

function presentEnum(value: string): string {
  return value.toLowerCase();
}

function presentNullableDate(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}
