import { HttpStatus } from '@nestjs/common';
import {
  ReinforcementProofType,
  ReinforcementRewardType,
  ReinforcementSource,
  ReinforcementTargetScope,
  ReinforcementTaskStatus,
} from '@prisma/client';
import {
  DomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';

export interface ReinforcementTargetInput {
  scopeType: ReinforcementTargetScope | string;
  scopeId?: string | null;
}

export interface NormalizedReinforcementTarget {
  scopeType: ReinforcementTargetScope;
  scopeKey: string;
  stageId: string | null;
  gradeId: string | null;
  sectionId: string | null;
  classroomId: string | null;
  studentId: string | null;
}

export interface ReinforcementStageInput {
  sortOrder?: number | null;
  titleEn?: string | null;
  titleAr?: string | null;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  proofType?: ReinforcementProofType | string | null;
  requiresApproval?: boolean | null;
  metadata?: unknown;
}

export interface NormalizedReinforcementStage {
  sortOrder: number;
  titleEn: string | null;
  titleAr: string | null;
  descriptionEn: string | null;
  descriptionAr: string | null;
  proofType: ReinforcementProofType;
  requiresApproval: boolean;
  metadata?: unknown;
}

export interface ReinforcementAssignmentSummary {
  total: number;
  notCompleted: number;
  inProgress: number;
  underReview: number;
  completed: number;
  cancelled: number;
}

export class ReinforcementTaskInvalidScopeException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'reinforcement.task.invalid_scope',
      message: 'Reinforcement task target scope is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class ReinforcementTaskDuplicateTargetException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'reinforcement.task.duplicate_target',
      message: 'Reinforcement task target is duplicated',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class ReinforcementTaskCancelledException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'reinforcement.task.cancelled',
      message: 'Reinforcement task is cancelled',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

const SOURCE_ALIASES: Record<string, ReinforcementSource> = {
  teacher: ReinforcementSource.TEACHER,
  parent: ReinforcementSource.PARENT,
  system: ReinforcementSource.SYSTEM,
};

const STATUS_ALIASES: Record<string, ReinforcementTaskStatus> = {
  not_completed: ReinforcementTaskStatus.NOT_COMPLETED,
  notcompleted: ReinforcementTaskStatus.NOT_COMPLETED,
  pending: ReinforcementTaskStatus.NOT_COMPLETED,
  in_progress: ReinforcementTaskStatus.IN_PROGRESS,
  inprogress: ReinforcementTaskStatus.IN_PROGRESS,
  under_review: ReinforcementTaskStatus.UNDER_REVIEW,
  underreview: ReinforcementTaskStatus.UNDER_REVIEW,
  completed: ReinforcementTaskStatus.COMPLETED,
  cancel: ReinforcementTaskStatus.CANCELLED,
  cancelled: ReinforcementTaskStatus.CANCELLED,
};

const TARGET_SCOPE_ALIASES: Record<string, ReinforcementTargetScope> = {
  school: ReinforcementTargetScope.SCHOOL,
  stage: ReinforcementTargetScope.STAGE,
  grade: ReinforcementTargetScope.GRADE,
  section: ReinforcementTargetScope.SECTION,
  classroom: ReinforcementTargetScope.CLASSROOM,
  student: ReinforcementTargetScope.STUDENT,
};

const PROOF_TYPE_ALIASES: Record<string, ReinforcementProofType> = {
  image: ReinforcementProofType.IMAGE,
  video: ReinforcementProofType.VIDEO,
  document: ReinforcementProofType.DOCUMENT,
  none: ReinforcementProofType.NONE,
};

const REWARD_TYPE_ALIASES: Record<string, ReinforcementRewardType> = {
  moral: ReinforcementRewardType.MORAL,
  financial: ReinforcementRewardType.FINANCIAL,
  xp: ReinforcementRewardType.XP,
  badge: ReinforcementRewardType.BADGE,
};

export function normalizeReinforcementSource(
  input: ReinforcementSource | string | null | undefined,
  fallback = ReinforcementSource.TEACHER,
): ReinforcementSource {
  return normalizeEnumValue({
    input,
    aliases: SOURCE_ALIASES,
    values: Object.values(ReinforcementSource),
    fallback,
    field: 'source',
  });
}

export function normalizeTaskStatus(
  input: ReinforcementTaskStatus | string | null | undefined,
): ReinforcementTaskStatus {
  return normalizeEnumValue({
    input,
    aliases: STATUS_ALIASES,
    values: Object.values(ReinforcementTaskStatus),
    field: 'status',
  });
}

export function normalizeTargetScope(
  input: ReinforcementTargetScope | string | null | undefined,
): ReinforcementTargetScope {
  return normalizeEnumValue({
    input,
    aliases: TARGET_SCOPE_ALIASES,
    values: Object.values(ReinforcementTargetScope),
    field: 'scopeType',
    invalidScope: true,
  });
}

export function normalizeProofType(
  input: ReinforcementProofType | string | null | undefined,
  fallback = ReinforcementProofType.NONE,
): ReinforcementProofType {
  return normalizeEnumValue({
    input,
    aliases: PROOF_TYPE_ALIASES,
    values: Object.values(ReinforcementProofType),
    fallback,
    field: 'proofType',
  });
}

export function normalizeRewardType(
  input: ReinforcementRewardType | string | null | undefined,
): ReinforcementRewardType | null {
  if (input === undefined || input === null || String(input).trim() === '') {
    return null;
  }

  return normalizeEnumValue({
    input,
    aliases: REWARD_TYPE_ALIASES,
    values: Object.values(ReinforcementRewardType),
    field: 'rewardType',
  });
}

export function buildScopeKey(params: {
  schoolId: string;
  scopeType: ReinforcementTargetScope;
  scopeId?: string | null;
}): string {
  if (params.scopeType === ReinforcementTargetScope.SCHOOL) {
    return params.schoolId;
  }

  const scopeId = normalizeOptionalString(params.scopeId);
  if (!scopeId) {
    throw new ReinforcementTaskInvalidScopeException({
      field: 'scopeId',
      scopeType: params.scopeType,
    });
  }

  return scopeId;
}

export function assertValidTargetScope(params: {
  schoolId: string;
  scopeType: ReinforcementTargetScope;
  scopeId?: string | null;
}): void {
  if (params.scopeType === ReinforcementTargetScope.SCHOOL) {
    const scopeId = normalizeOptionalString(params.scopeId);
    if (scopeId && scopeId !== params.schoolId) {
      throw new ReinforcementTaskInvalidScopeException({
        scopeType: params.scopeType,
        scopeId,
      });
    }
    return;
  }

  if (!normalizeOptionalString(params.scopeId)) {
    throw new ReinforcementTaskInvalidScopeException({
      scopeType: params.scopeType,
      field: 'scopeId',
    });
  }
}

export function normalizeTaskTarget(params: {
  schoolId: string;
  target: ReinforcementTargetInput;
}): NormalizedReinforcementTarget {
  const scopeType = normalizeTargetScope(params.target.scopeType);
  assertValidTargetScope({
    schoolId: params.schoolId,
    scopeType,
    scopeId: params.target.scopeId,
  });
  const scopeKey = buildScopeKey({
    schoolId: params.schoolId,
    scopeType,
    scopeId: params.target.scopeId,
  });

  return {
    scopeType,
    scopeKey,
    stageId:
      scopeType === ReinforcementTargetScope.STAGE ? scopeKey : null,
    gradeId:
      scopeType === ReinforcementTargetScope.GRADE ? scopeKey : null,
    sectionId:
      scopeType === ReinforcementTargetScope.SECTION ? scopeKey : null,
    classroomId:
      scopeType === ReinforcementTargetScope.CLASSROOM ? scopeKey : null,
    studentId:
      scopeType === ReinforcementTargetScope.STUDENT ? scopeKey : null,
  };
}

export function assertNoDuplicateTargets(
  targets: NormalizedReinforcementTarget[],
): void {
  const seen = new Set<string>();

  for (const target of targets) {
    const key = `${target.scopeType}:${target.scopeKey}`;
    if (seen.has(key)) {
      throw new ReinforcementTaskDuplicateTargetException({
        scopeType: target.scopeType,
        scopeKey: target.scopeKey,
      });
    }
    seen.add(key);
  }
}

export function normalizeTaskStages(params: {
  stages?: ReinforcementStageInput[] | null;
  taskTitleEn?: string | null;
  taskTitleAr?: string | null;
}): NormalizedReinforcementStage[] {
  if (!params.stages || params.stages.length === 0) {
    return [
      buildDefaultStage({
        taskTitleEn: params.taskTitleEn,
        taskTitleAr: params.taskTitleAr,
      }),
    ];
  }

  return [...params.stages]
    .map((stage, index) => ({
      stage,
      originalIndex: index,
      sortKey: stage.sortOrder ?? index + 1,
    }))
    .sort((left, right) => {
      if (left.sortKey !== right.sortKey) return left.sortKey - right.sortKey;
      return left.originalIndex - right.originalIndex;
    })
    .map(({ stage }, index) => {
      const titleEn = normalizeNullableText(stage.titleEn);
      const titleAr = normalizeNullableText(stage.titleAr);
      if (!titleEn && !titleAr) {
        throw new ValidationDomainException('Task stage title is required', {
          field: 'stages.titleEn',
          aliases: ['titleAr'],
        });
      }

      return {
        sortOrder: index + 1,
        titleEn,
        titleAr,
        descriptionEn: normalizeNullableText(stage.descriptionEn),
        descriptionAr: normalizeNullableText(stage.descriptionAr),
        proofType: normalizeProofType(stage.proofType),
        requiresApproval: stage.requiresApproval ?? true,
        ...(stage.metadata === undefined ? {} : { metadata: stage.metadata }),
      };
    });
}

export function buildDefaultStage(params: {
  taskTitleEn?: string | null;
  taskTitleAr?: string | null;
}): NormalizedReinforcementStage {
  const titleEn = normalizeNullableText(params.taskTitleEn) ?? 'Task stage';
  const titleAr = normalizeNullableText(params.taskTitleAr) ?? titleEn;

  return {
    sortOrder: 1,
    titleEn,
    titleAr,
    descriptionEn: null,
    descriptionAr: null,
    proofType: ReinforcementProofType.NONE,
    requiresApproval: true,
  };
}

export function calculateAssignmentProgressSummary(
  assignments: Array<{ status: ReinforcementTaskStatus | string }>,
): ReinforcementAssignmentSummary {
  const summary: ReinforcementAssignmentSummary = {
    total: assignments.length,
    notCompleted: 0,
    inProgress: 0,
    underReview: 0,
    completed: 0,
    cancelled: 0,
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

  return summary;
}

export function assertTaskCancelable(task: {
  id: string;
  status: ReinforcementTaskStatus | string;
}): void {
  if (normalizeTaskStatus(task.status) === ReinforcementTaskStatus.CANCELLED) {
    throw new ReinforcementTaskCancelledException({ taskId: task.id });
  }
}

export function buildDuplicateTaskPayload<TTask extends {
  titleEn: string | null;
  titleAr: string | null;
  dueDate: Date | null;
  academicYearId: string;
  termId: string;
}>(params: {
  sourceTask: TTask;
  overrides?: {
    titleEn?: string | null;
    titleAr?: string | null;
    dueDate?: string | null;
    academicYearId?: string | null;
    yearId?: string | null;
    termId?: string | null;
  };
}): {
  titleEn: string | null;
  titleAr: string | null;
  dueDate: Date | null;
  academicYearId: string;
  termId: string;
} {
  return {
    titleEn:
      params.overrides && hasOwn(params.overrides, 'titleEn')
        ? normalizeNullableText(params.overrides.titleEn)
        : params.sourceTask.titleEn,
    titleAr:
      params.overrides && hasOwn(params.overrides, 'titleAr')
        ? normalizeNullableText(params.overrides.titleAr)
        : params.sourceTask.titleAr,
    dueDate:
      params.overrides && hasOwn(params.overrides, 'dueDate')
        ? parseOptionalDate(params.overrides.dueDate, 'dueDate')
        : params.sourceTask.dueDate,
    academicYearId:
      params.overrides?.academicYearId ??
      params.overrides?.yearId ??
      params.sourceTask.academicYearId,
    termId: params.overrides?.termId ?? params.sourceTask.termId,
  };
}

export function parseOptionalDate(
  value: string | null | undefined,
  field: string,
): Date | null {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationDomainException('Date value is invalid', {
      field,
      value,
    });
  }

  return date;
}

export function normalizeNullableText(value: unknown): string | null {
  const normalized = normalizeOptionalString(value);
  return normalized && normalized.length > 0 ? normalized : null;
}

export function hasOwn<T extends object>(
  value: T,
  key: PropertyKey,
): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeEnumValue<TEnum extends string>(params: {
  input: TEnum | string | null | undefined;
  aliases: Record<string, TEnum>;
  values: TEnum[];
  fallback?: TEnum;
  field: string;
  invalidScope?: boolean;
}): TEnum {
  const normalized = normalizeOptionalString(params.input);
  if (!normalized) {
    if (params.fallback) return params.fallback;
    if (params.invalidScope) {
      throw new ReinforcementTaskInvalidScopeException({ field: params.field });
    }
    throw new ValidationDomainException('Enum value is required', {
      field: params.field,
    });
  }

  const aliasKey = normalized.replace(/[-\s]/g, '_').toLowerCase();
  const alias = params.aliases[aliasKey] ?? params.aliases[aliasKey.replace(/_/g, '')];
  if (alias) return alias;

  const enumValue = normalized.toUpperCase() as TEnum;
  if (params.values.includes(enumValue)) return enumValue;

  if (params.invalidScope) {
    throw new ReinforcementTaskInvalidScopeException({
      field: params.field,
      value: params.input,
    });
  }

  throw new ValidationDomainException('Enum value is invalid', {
    field: params.field,
    value: params.input,
  });
}
