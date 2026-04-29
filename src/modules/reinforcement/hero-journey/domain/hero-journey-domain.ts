import { HttpStatus } from '@nestjs/common';
import {
  HeroMissionObjectiveType,
  HeroMissionStatus,
} from '@prisma/client';
import {
  DomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';

export interface HeroMissionObjectiveInput {
  type?: HeroMissionObjectiveType | string | null;
  titleEn?: string | null;
  titleAr?: string | null;
  subtitleEn?: string | null;
  subtitleAr?: string | null;
  linkedAssessmentId?: string | null;
  linkedLessonRef?: string | null;
  sortOrder?: number | null;
  isRequired?: boolean | null;
  metadata?: unknown;
}

export interface NormalizedHeroMissionObjective {
  type: HeroMissionObjectiveType;
  titleEn: string | null;
  titleAr: string | null;
  subtitleEn: string | null;
  subtitleAr: string | null;
  linkedAssessmentId: string | null;
  linkedLessonRef: string | null;
  sortOrder: number;
  isRequired: boolean;
  metadata?: unknown;
}

export class HeroBadgeDuplicateSlugException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'reinforcement.hero.badge.duplicate_slug',
      message: 'A Hero badge with this slug already exists',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class HeroBadgeInUseException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'validation.failed',
      message: 'Hero badge is used by an active mission',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class HeroMissionInvalidStatusTransitionException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'reinforcement.hero.mission.invalid_status_transition',
      message: 'Hero mission status transition is invalid',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class HeroMissionArchivedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'reinforcement.hero.mission.archived',
      message: 'Hero mission is archived',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class HeroMissionPointsInvalidException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'reinforcement.hero.mission.points_invalid',
      message: 'Hero mission XP points are invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class HeroObjectiveInvalidOrderException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'reinforcement.hero.objective.invalid_order',
      message: 'Hero mission objective order is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

const MISSION_STATUS_ALIASES: Record<string, HeroMissionStatus> = {
  draft: HeroMissionStatus.DRAFT,
  published: HeroMissionStatus.PUBLISHED,
  archived: HeroMissionStatus.ARCHIVED,
};

const OBJECTIVE_TYPE_ALIASES: Record<string, HeroMissionObjectiveType> = {
  manual: HeroMissionObjectiveType.MANUAL,
  lesson: HeroMissionObjectiveType.LESSON,
  quiz: HeroMissionObjectiveType.QUIZ,
  assessment: HeroMissionObjectiveType.ASSESSMENT,
  task: HeroMissionObjectiveType.TASK,
  custom: HeroMissionObjectiveType.CUSTOM,
};

const BADGE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeHeroMissionStatus(
  input: HeroMissionStatus | string | null | undefined,
): HeroMissionStatus {
  return normalizeEnumValue({
    input,
    aliases: MISSION_STATUS_ALIASES,
    values: Object.values(HeroMissionStatus),
    field: 'status',
  });
}

export function normalizeObjectiveType(
  input: HeroMissionObjectiveType | string | null | undefined,
): HeroMissionObjectiveType {
  return normalizeEnumValue({
    input,
    aliases: OBJECTIVE_TYPE_ALIASES,
    values: Object.values(HeroMissionObjectiveType),
    fallback: HeroMissionObjectiveType.MANUAL,
    field: 'objectives.type',
  });
}

export function normalizeBadgeSlug(value: unknown): string {
  const slug = normalizeNullableText(value)?.toLowerCase() ?? '';
  assertValidBadgeSlug(slug);
  return slug;
}

export function assertValidBadgeSlug(slug: string): void {
  if (!slug || slug.length > 100 || !BADGE_SLUG_PATTERN.test(slug)) {
    throw new ValidationDomainException('Badge slug is invalid', {
      field: 'slug',
      pattern: BADGE_SLUG_PATTERN.source,
    });
  }
}

export function assertBadgeNamePresent(input: {
  nameEn?: string | null;
  nameAr?: string | null;
}): void {
  if (!normalizeNullableText(input.nameEn) && !normalizeNullableText(input.nameAr)) {
    throw new ValidationDomainException('Badge name is required', {
      field: 'nameEn',
      aliases: ['nameAr'],
    });
  }
}

export function assertMissionTitlePresent(input: {
  titleEn?: string | null;
  titleAr?: string | null;
}): void {
  if (!normalizeNullableText(input.titleEn) && !normalizeNullableText(input.titleAr)) {
    throw new ValidationDomainException('Mission title is required', {
      field: 'titleEn',
      aliases: ['titleAr'],
    });
  }
}

export function assertRewardXpValid(value: unknown): number {
  const rewardXp = Number(value ?? 0);
  if (!Number.isInteger(rewardXp) || rewardXp < 0) {
    throw new HeroMissionPointsInvalidException({
      field: 'rewardXp',
      value,
    });
  }

  return rewardXp;
}

export function assertRequiredLevelValid(value: unknown): number {
  const requiredLevel = Number(value ?? 1);
  if (!Number.isInteger(requiredLevel) || requiredLevel < 1) {
    throw new ValidationDomainException('Required level is invalid', {
      field: 'requiredLevel',
      value,
    });
  }

  return requiredLevel;
}

export function buildDefaultObjectiveSortOrder(index: number): number {
  return index + 1;
}

export function assertValidObjectiveOrder(
  objectives: HeroMissionObjectiveInput[],
): void {
  const seen = new Set<number>();
  for (const objective of objectives) {
    if (objective.sortOrder === undefined || objective.sortOrder === null) {
      continue;
    }

    const sortOrder = Number(objective.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 1) {
      throw new HeroObjectiveInvalidOrderException({
        field: 'objectives.sortOrder',
        sortOrder: objective.sortOrder,
      });
    }
    if (seen.has(sortOrder)) {
      throw new HeroObjectiveInvalidOrderException({
        field: 'objectives.sortOrder',
        sortOrder,
      });
    }
    seen.add(sortOrder);
  }
}

export function normalizeMissionObjectives(params: {
  objectives: HeroMissionObjectiveInput[];
  requireNonEmpty?: boolean;
}): NormalizedHeroMissionObjective[] {
  if (params.requireNonEmpty && params.objectives.length === 0) {
    throw new ValidationDomainException('Mission objectives are required', {
      field: 'objectives',
    });
  }

  assertValidObjectiveOrder(params.objectives);

  return params.objectives
    .map((objective, index) => ({
      objective,
      originalIndex: index,
      sortKey:
        objective.sortOrder === undefined || objective.sortOrder === null
          ? Number.MAX_SAFE_INTEGER
          : Number(objective.sortOrder),
    }))
    .sort((left, right) => {
      if (left.sortKey !== right.sortKey) return left.sortKey - right.sortKey;
      return left.originalIndex - right.originalIndex;
    })
    .map(({ objective }, index) => ({
      type: normalizeObjectiveType(objective.type),
      titleEn: normalizeNullableText(objective.titleEn),
      titleAr: normalizeNullableText(objective.titleAr),
      subtitleEn: normalizeNullableText(objective.subtitleEn),
      subtitleAr: normalizeNullableText(objective.subtitleAr),
      linkedAssessmentId: normalizeNullableText(objective.linkedAssessmentId),
      linkedLessonRef: normalizeNullableText(objective.linkedLessonRef),
      sortOrder: buildDefaultObjectiveSortOrder(index),
      isRequired: objective.isRequired ?? true,
      ...(objective.metadata === undefined
        ? {}
        : { metadata: objective.metadata }),
    }));
}

export function assertMissionEditable(params: {
  mission: { id: string; status: HeroMissionStatus | string };
  protectedChangedFields?: string[];
}): void {
  const status = normalizeHeroMissionStatus(params.mission.status);
  if (status === HeroMissionStatus.ARCHIVED) {
    throw new HeroMissionArchivedException({ missionId: params.mission.id });
  }

  if (
    status === HeroMissionStatus.PUBLISHED &&
    params.protectedChangedFields &&
    params.protectedChangedFields.length > 0
  ) {
    throw new HeroMissionInvalidStatusTransitionException({
      missionId: params.mission.id,
      changedFields: params.protectedChangedFields,
    });
  }
}

export function assertMissionPublishable(mission: {
  id: string;
  status: HeroMissionStatus | string;
  titleEn?: string | null;
  titleAr?: string | null;
  rewardXp: number;
  objectives: Array<{ isRequired: boolean; deletedAt?: Date | null }>;
}): void {
  const status = normalizeHeroMissionStatus(mission.status);
  if (status === HeroMissionStatus.ARCHIVED) {
    throw new HeroMissionArchivedException({ missionId: mission.id });
  }
  if (status !== HeroMissionStatus.DRAFT) {
    throw new HeroMissionInvalidStatusTransitionException({
      missionId: mission.id,
      status,
      expected: HeroMissionStatus.DRAFT,
    });
  }

  assertMissionTitlePresent(mission);
  assertRewardXpValid(mission.rewardXp);

  const activeRequiredCount = mission.objectives.filter(
    (objective) => objective.isRequired && !objective.deletedAt,
  ).length;
  if (activeRequiredCount === 0) {
    throw new HeroObjectiveInvalidOrderException({
      missionId: mission.id,
      reason: 'required_objective_missing',
    });
  }
}

export function assertMissionArchivable(mission: {
  id: string;
  status: HeroMissionStatus | string;
}): void {
  if (normalizeHeroMissionStatus(mission.status) === HeroMissionStatus.ARCHIVED) {
    throw new HeroMissionArchivedException({ missionId: mission.id });
  }
}

export function assertMissionDeletable(params: {
  mission: { id: string; status: HeroMissionStatus | string };
  progressCount: number;
}): void {
  const status = normalizeHeroMissionStatus(params.mission.status);
  if (status === HeroMissionStatus.DRAFT) return;

  if (status === HeroMissionStatus.PUBLISHED) {
    throw new HeroMissionInvalidStatusTransitionException({
      missionId: params.mission.id,
      status,
      reason: 'archive_before_delete',
    });
  }

  if (params.progressCount > 0) {
    throw new HeroMissionInvalidStatusTransitionException({
      missionId: params.mission.id,
      status,
      progressCount: params.progressCount,
    });
  }
}

export function summarizeMissionObjectives(
  objectives: Array<{ isRequired: boolean }>,
): { total: number; required: number; optional: number } {
  const required = objectives.filter((objective) => objective.isRequired).length;
  return {
    total: objectives.length,
    required,
    optional: objectives.length - required,
  };
}

export function normalizeNullableText(value: unknown): string | null {
  if (value === undefined || value === null) return null;

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

export function hasOwn<T extends object>(
  value: T,
  key: keyof T | string,
): boolean {
  return (
    Object.prototype.hasOwnProperty.call(value, key) &&
    (value as Record<string, unknown>)[String(key)] !== undefined
  );
}

export function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002',
  );
}

function normalizeEnumValue<TEnum extends string>(params: {
  input: TEnum | string | null | undefined;
  aliases: Record<string, TEnum>;
  values: TEnum[];
  fallback?: TEnum;
  field: string;
}): TEnum {
  const normalized = normalizeNullableText(params.input);
  if (!normalized) {
    if (params.fallback) return params.fallback;
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
