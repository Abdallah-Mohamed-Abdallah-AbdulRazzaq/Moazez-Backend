import {
  AuditOutcome,
  BehaviorRecordType,
  BehaviorSeverity,
  Prisma,
} from '@prisma/client';
import { ValidationDomainException } from '../../../common/exceptions/domain-exception';
import { BehaviorScope } from '../behavior-context';
import {
  assertBehaviorCategoryNamePresent,
  assertBehaviorCategoryPointsCompatible,
  hasOwn,
  normalizeBehaviorCategoryCode,
  normalizeBehaviorRecordType,
  normalizeBehaviorSeverity,
  normalizeNullableText,
} from '../domain/behavior-category-domain';
import {
  BehaviorCategoryRecord,
  BehaviorCategoriesRepository,
  CreateBehaviorCategoryInput,
  ListBehaviorCategoriesFilters,
  UpdateBehaviorCategoryInput,
} from '../infrastructure/behavior-categories.repository';
import {
  CreateBehaviorCategoryDto,
  ListBehaviorCategoriesQueryDto,
  UpdateBehaviorCategoryDto,
} from '../dto/behavior-category.dto';

export function normalizeBehaviorCategoryListFilters(
  query: ListBehaviorCategoriesQueryDto,
): ListBehaviorCategoriesFilters {
  return {
    ...(query.type ? { type: normalizeBehaviorRecordType(query.type) } : {}),
    ...(query.severity
      ? { severity: normalizeBehaviorSeverity(query.severity) }
      : {}),
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    ...(query.search ? { search: query.search } : {}),
    includeDeleted: query.includeDeleted ?? false,
    ...(query.limit !== undefined ? { limit: query.limit } : {}),
    ...(query.offset !== undefined ? { offset: query.offset } : {}),
  };
}

export async function buildCreateBehaviorCategoryInput(params: {
  scope: BehaviorScope;
  repository: BehaviorCategoriesRepository;
  command: CreateBehaviorCategoryDto;
}): Promise<CreateBehaviorCategoryInput> {
  const code = normalizeBehaviorCategoryCode(params.command.code);
  await assertUniqueBehaviorCategoryCode({
    repository: params.repository,
    code,
  });

  const nameEn = normalizeNullableText(params.command.nameEn);
  const nameAr = normalizeNullableText(params.command.nameAr);
  const type = normalizeBehaviorRecordType(params.command.type);
  const defaultSeverity = normalizeBehaviorSeverity(
    params.command.defaultSeverity,
  );
  const defaultPoints = params.command.defaultPoints ?? 0;

  assertBehaviorCategoryNamePresent({ nameEn, nameAr });
  assertBehaviorCategoryPointsCompatible({ type, defaultPoints });

  return {
    schoolId: params.scope.schoolId,
    category: {
      code,
      nameEn,
      nameAr,
      descriptionEn: normalizeNullableText(params.command.descriptionEn),
      descriptionAr: normalizeNullableText(params.command.descriptionAr),
      type,
      defaultSeverity,
      defaultPoints,
      isActive: params.command.isActive ?? true,
      sortOrder: params.command.sortOrder ?? 0,
      createdById: params.scope.actorId,
      metadata: toNullableJson(params.command.metadata),
    },
  };
}

export async function buildUpdateBehaviorCategoryInput(params: {
  scope: BehaviorScope;
  repository: BehaviorCategoriesRepository;
  existing: BehaviorCategoryRecord;
  command: UpdateBehaviorCategoryDto;
}): Promise<UpdateBehaviorCategoryInput> {
  const data: Prisma.BehaviorCategoryUncheckedUpdateManyInput = {};

  const nextCode = hasOwn(params.command, 'code')
    ? normalizeBehaviorCategoryCode(params.command.code)
    : params.existing.code;
  const nextType = hasOwn(params.command, 'type')
    ? normalizeBehaviorRecordType(params.command.type)
    : params.existing.type;
  const nextDefaultPoints = hasOwn(params.command, 'defaultPoints')
    ? (params.command.defaultPoints ?? 0)
    : params.existing.defaultPoints;

  if (hasOwn(params.command, 'code')) data.code = nextCode;
  if (hasOwn(params.command, 'type')) data.type = nextType;
  if (hasOwn(params.command, 'defaultSeverity')) {
    data.defaultSeverity = normalizeBehaviorSeverity(
      params.command.defaultSeverity,
    );
  }
  if (hasOwn(params.command, 'defaultPoints')) {
    data.defaultPoints = nextDefaultPoints;
  }

  const nextNameEn = hasOwn(params.command, 'nameEn')
    ? normalizeNullableText(params.command.nameEn)
    : params.existing.nameEn;
  const nextNameAr = hasOwn(params.command, 'nameAr')
    ? normalizeNullableText(params.command.nameAr)
    : params.existing.nameAr;
  assertBehaviorCategoryNamePresent({ nameEn: nextNameEn, nameAr: nextNameAr });
  assertBehaviorCategoryPointsCompatible({
    type: nextType,
    defaultPoints: nextDefaultPoints,
  });

  if (hasOwn(params.command, 'nameEn')) data.nameEn = nextNameEn;
  if (hasOwn(params.command, 'nameAr')) data.nameAr = nextNameAr;
  if (hasOwn(params.command, 'descriptionEn')) {
    data.descriptionEn = normalizeNullableText(params.command.descriptionEn);
  }
  if (hasOwn(params.command, 'descriptionAr')) {
    data.descriptionAr = normalizeNullableText(params.command.descriptionAr);
  }
  if (hasOwn(params.command, 'isActive')) {
    data.isActive = params.command.isActive ?? params.existing.isActive;
  }
  if (hasOwn(params.command, 'sortOrder')) {
    data.sortOrder = params.command.sortOrder ?? params.existing.sortOrder;
  }
  if (hasOwn(params.command, 'metadata')) {
    data.metadata = toNullableJson(params.command.metadata);
  }

  if (data.code && data.code !== params.existing.code) {
    await assertUniqueBehaviorCategoryCode({
      repository: params.repository,
      code: data.code as string,
      excludeCategoryId: params.existing.id,
    });
  }

  return {
    schoolId: params.scope.schoolId,
    categoryId: params.existing.id,
    data,
  };
}

export function resolveBehaviorCategoryIdentityChanges(params: {
  existing: BehaviorCategoryRecord;
  command: UpdateBehaviorCategoryDto;
}): {
  changedFields: string[];
  nextCode: string;
  nextType: BehaviorRecordType;
} {
  const nextCode = hasOwn(params.command, 'code')
    ? normalizeBehaviorCategoryCode(params.command.code)
    : params.existing.code;
  const nextType = hasOwn(params.command, 'type')
    ? normalizeBehaviorRecordType(params.command.type)
    : params.existing.type;

  const changedFields: string[] = [];
  if (nextCode !== params.existing.code) changedFields.push('code');
  if (nextType !== params.existing.type) changedFields.push('type');

  return { changedFields, nextCode, nextType };
}

export function buildBehaviorCategoryAuditEntry(params: {
  scope: BehaviorScope;
  action:
    | 'behavior.category.create'
    | 'behavior.category.update'
    | 'behavior.category.delete';
  category: BehaviorCategoryRecord;
  before?: BehaviorCategoryRecord | null;
  usage?: { recordsCount: number; pointLedgerEntriesCount: number };
}) {
  const after = {
    ...summarizeBehaviorCategoryForAudit(params.category),
    ...(params.usage ? { usage: params.usage } : {}),
  };

  const entry = {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'behavior',
    action: params.action,
    resourceType: 'behavior_category',
    resourceId: params.category.id,
    outcome: AuditOutcome.SUCCESS,
    after,
  };

  return params.before
    ? { ...entry, before: summarizeBehaviorCategoryForAudit(params.before) }
    : entry;
}

export function summarizeBehaviorCategoryForAudit(
  category: BehaviorCategoryRecord,
) {
  return {
    code: category.code,
    type: category.type,
    defaultSeverity: category.defaultSeverity,
    defaultPoints: category.defaultPoints,
    isActive: category.isActive,
    sortOrder: category.sortOrder,
    deletedAt: category.deletedAt ? category.deletedAt.toISOString() : null,
  };
}

async function assertUniqueBehaviorCategoryCode(params: {
  repository: BehaviorCategoriesRepository;
  code: string;
  excludeCategoryId?: string;
}): Promise<void> {
  const existing = await params.repository.findCategoryByCode(params.code, {
    includeDeleted: true,
  });
  if (existing && existing.id !== params.excludeCategoryId) {
    throw new ValidationDomainException(
      'Behavior category code already exists',
      {
        field: 'code',
        code: params.code,
      },
    );
  }
}

function toNullableJson(
  value: unknown,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}
