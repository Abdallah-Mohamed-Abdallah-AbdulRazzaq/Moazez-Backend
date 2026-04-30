import {
  AuditOutcome,
  Prisma,
  RewardCatalogItemStatus,
} from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { FilesNotFoundException } from '../../../files/uploads/domain/file-upload.exceptions';
import { ReinforcementScope } from '../../reinforcement-context';
import {
  assertRewardMinXpValid,
  assertRewardStockValid,
  assertRewardTitlePresent,
  hasOwn,
  normalizeNullableText,
  normalizeRewardCatalogStatus,
  normalizeRewardCatalogType,
} from '../domain/reward-catalog-domain';
import {
  CreateRewardCatalogItemDto,
  ListRewardCatalogQueryDto,
  UpdateRewardCatalogItemDto,
} from '../dto/reward-catalog.dto';
import {
  CreateRewardCatalogItemInput,
  ListRewardCatalogFilters,
  RewardCatalogItemRecord,
  RewardCatalogRepository,
  UpdateRewardCatalogItemInput,
} from '../infrastructure/reward-catalog.repository';

export function normalizeCatalogListFilters(
  query: ListRewardCatalogQueryDto,
): ListRewardCatalogFilters {
  return {
    ...(query.academicYearId ? { academicYearId: query.academicYearId } : {}),
    ...(query.termId ? { termId: query.termId } : {}),
    ...(query.status
      ? { status: normalizeRewardCatalogStatus(query.status) }
      : {}),
    ...(query.type ? { type: normalizeRewardCatalogType(query.type) } : {}),
    ...(query.search ? { search: query.search } : {}),
    includeArchived: query.includeArchived ?? false,
    includeDeleted: query.includeDeleted ?? false,
    onlyAvailable: query.onlyAvailable ?? false,
    ...(query.limit !== undefined ? { limit: query.limit } : {}),
    ...(query.offset !== undefined ? { offset: query.offset } : {}),
  };
}

export async function buildCreateCatalogItemInput(params: {
  scope: ReinforcementScope;
  repository: RewardCatalogRepository;
  command: CreateRewardCatalogItemDto;
}): Promise<CreateRewardCatalogItemInput> {
  await validateRewardCatalogReferences({
    repository: params.repository,
    academicYearId: params.command.academicYearId ?? null,
    termId: params.command.termId ?? null,
    imageFileId: params.command.imageFileId ?? null,
  });

  const titleEn = normalizeNullableText(params.command.titleEn);
  const titleAr = normalizeNullableText(params.command.titleAr);
  assertRewardTitlePresent({ titleEn, titleAr });

  const isUnlimited = params.command.isUnlimited ?? true;
  const stock = normalizeStockForWrite({
    isUnlimited,
    stockQuantity: params.command.stockQuantity ?? null,
    stockRemaining: params.command.stockRemaining ?? null,
  });

  return {
    schoolId: params.scope.schoolId,
    item: {
      academicYearId: params.command.academicYearId ?? null,
      termId: params.command.termId ?? null,
      titleEn,
      titleAr,
      descriptionEn: normalizeNullableText(params.command.descriptionEn),
      descriptionAr: normalizeNullableText(params.command.descriptionAr),
      type: normalizeRewardCatalogType(params.command.type),
      status: RewardCatalogItemStatus.DRAFT,
      minTotalXp: assertRewardMinXpValid(params.command.minTotalXp),
      isUnlimited,
      stockQuantity: stock.stockQuantity,
      stockRemaining: stock.stockRemaining,
      imageFileId: params.command.imageFileId ?? null,
      sortOrder: params.command.sortOrder ?? 0,
      createdById: params.scope.actorId,
      metadata: toNullableJson(params.command.metadata),
    },
  };
}

export async function buildUpdateCatalogItemInput(params: {
  scope: ReinforcementScope;
  repository: RewardCatalogRepository;
  existing: RewardCatalogItemRecord;
  command: UpdateRewardCatalogItemDto;
}): Promise<UpdateRewardCatalogItemInput> {
  const data: Prisma.RewardCatalogItemUncheckedUpdateManyInput = {};

  const nextAcademicYearId = hasOwn(params.command, 'academicYearId')
    ? params.command.academicYearId ?? null
    : params.existing.academicYearId;
  const nextTermId = hasOwn(params.command, 'termId')
    ? params.command.termId ?? null
    : params.existing.termId;

  if (hasOwn(params.command, 'academicYearId')) {
    data.academicYearId = nextAcademicYearId;
  }
  if (hasOwn(params.command, 'termId')) data.termId = nextTermId;

  if (
    hasOwn(params.command, 'academicYearId') ||
    hasOwn(params.command, 'termId') ||
    hasOwn(params.command, 'imageFileId')
  ) {
    await validateRewardCatalogReferences({
      repository: params.repository,
      academicYearId: nextAcademicYearId,
      termId: nextTermId,
      imageFileId: hasOwn(params.command, 'imageFileId')
        ? params.command.imageFileId ?? null
        : params.existing.imageFileId,
    });
  }

  const nextTitleEn = hasOwn(params.command, 'titleEn')
    ? normalizeNullableText(params.command.titleEn)
    : params.existing.titleEn;
  const nextTitleAr = hasOwn(params.command, 'titleAr')
    ? normalizeNullableText(params.command.titleAr)
    : params.existing.titleAr;
  assertRewardTitlePresent({ titleEn: nextTitleEn, titleAr: nextTitleAr });

  if (hasOwn(params.command, 'titleEn')) data.titleEn = nextTitleEn;
  if (hasOwn(params.command, 'titleAr')) data.titleAr = nextTitleAr;
  if (hasOwn(params.command, 'descriptionEn')) {
    data.descriptionEn = normalizeNullableText(params.command.descriptionEn);
  }
  if (hasOwn(params.command, 'descriptionAr')) {
    data.descriptionAr = normalizeNullableText(params.command.descriptionAr);
  }
  if (hasOwn(params.command, 'type')) {
    data.type = normalizeRewardCatalogType(params.command.type);
  }
  if (hasOwn(params.command, 'minTotalXp')) {
    data.minTotalXp = assertRewardMinXpValid(params.command.minTotalXp);
  }
  if (hasOwn(params.command, 'imageFileId')) {
    data.imageFileId = params.command.imageFileId ?? null;
  }
  if (params.command.sortOrder !== undefined && params.command.sortOrder !== null) {
    data.sortOrder = params.command.sortOrder;
  }
  if (hasOwn(params.command, 'metadata')) {
    data.metadata = toNullableJson(params.command.metadata);
  }

  const stockFieldsChanged =
    hasOwn(params.command, 'isUnlimited') ||
    hasOwn(params.command, 'stockQuantity') ||
    hasOwn(params.command, 'stockRemaining');
  if (stockFieldsChanged) {
    const nextIsUnlimited = hasOwn(params.command, 'isUnlimited')
      ? params.command.isUnlimited ?? params.existing.isUnlimited
      : params.existing.isUnlimited;
    const nextStockQuantity = hasOwn(params.command, 'stockQuantity')
      ? params.command.stockQuantity ?? null
      : params.existing.stockQuantity;
    const nextStockRemaining = hasOwn(params.command, 'stockRemaining')
      ? params.command.stockRemaining ?? null
      : params.existing.stockRemaining;

    const stock = normalizeStockForWrite({
      isUnlimited: nextIsUnlimited,
      stockQuantity: nextStockQuantity,
      stockRemaining: nextStockRemaining,
    });

    data.isUnlimited = nextIsUnlimited;
    data.stockQuantity = stock.stockQuantity;
    data.stockRemaining = stock.stockRemaining;
  }

  return {
    schoolId: params.scope.schoolId,
    rewardId: params.existing.id,
    data,
  };
}

export function protectedPublishedCatalogChanges(
  command: UpdateRewardCatalogItemDto,
): string[] {
  const protectedFields = ['academicYearId', 'termId', 'type'];
  return protectedFields.filter((field) => hasOwn(command, field));
}

export function buildRewardCatalogAuditEntry(params: {
  scope: ReinforcementScope;
  action: string;
  item: RewardCatalogItemRecord;
  before?: RewardCatalogItemRecord | null;
  afterMetadata?: Record<string, unknown>;
}) {
  const entry = {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'reinforcement.rewards',
    action: params.action,
    resourceType: 'reward_catalog_item',
    resourceId: params.item.id,
    outcome: AuditOutcome.SUCCESS,
    after: {
      ...summarizeRewardCatalogForAudit(params.item),
      ...(params.afterMetadata ?? {}),
    },
  };

  return params.before
    ? { ...entry, before: summarizeRewardCatalogForAudit(params.before) }
    : entry;
}

export function summarizeRewardCatalogForAudit(item: RewardCatalogItemRecord) {
  return {
    status: item.status,
    type: item.type,
    minTotalXp: item.minTotalXp,
    isUnlimited: item.isUnlimited,
    stockQuantity: item.stockQuantity,
    stockRemaining: item.stockRemaining,
    academicYearId: item.academicYearId,
    termId: item.termId,
    imageFileId: item.imageFileId,
  };
}

async function validateRewardCatalogReferences(params: {
  repository: RewardCatalogRepository;
  academicYearId?: string | null;
  termId?: string | null;
  imageFileId?: string | null;
}): Promise<void> {
  const [academicYear, term, imageFile] = await Promise.all([
    params.academicYearId
      ? params.repository.findAcademicYear(params.academicYearId)
      : Promise.resolve(null),
    params.termId ? params.repository.findTerm(params.termId) : Promise.resolve(null),
    params.imageFileId
      ? params.repository.findFile(params.imageFileId)
      : Promise.resolve(null),
  ]);

  if (params.academicYearId && !academicYear) {
    throw new NotFoundDomainException('Academic year not found', {
      academicYearId: params.academicYearId,
    });
  }

  if (params.termId && !term) {
    throw new NotFoundDomainException('Term not found', {
      termId: params.termId,
    });
  }

  if (
    params.academicYearId &&
    params.termId &&
    term &&
    term.academicYearId !== params.academicYearId
  ) {
    throw new NotFoundDomainException('Term not found', {
      academicYearId: params.academicYearId,
      termId: params.termId,
    });
  }

  if (params.imageFileId && !imageFile) {
    throw new FilesNotFoundException({ fileId: params.imageFileId });
  }
}

function normalizeStockForWrite(input: {
  isUnlimited: boolean;
  stockQuantity?: number | null;
  stockRemaining?: number | null;
}): { stockQuantity: number | null; stockRemaining: number | null } {
  assertRewardStockValid(input);

  if (input.isUnlimited) {
    return { stockQuantity: null, stockRemaining: null };
  }

  return {
    stockQuantity: input.stockQuantity as number,
    stockRemaining: input.stockRemaining as number,
  };
}

function toNullableJson(
  value: unknown,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}
