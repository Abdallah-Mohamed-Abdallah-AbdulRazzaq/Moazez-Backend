import {
  AuditOutcome,
  Prisma,
  ReinforcementTaskStatus,
} from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { ReinforcementScope } from '../../reinforcement-context';
import {
  assertNoDuplicateTargets,
  buildDuplicateTaskPayload,
  hasOwn,
  normalizeNullableText,
  normalizeReinforcementSource,
  normalizeRewardType,
  normalizeTargetScope,
  normalizeTaskStages,
  normalizeTaskStatus,
  normalizeTaskTarget,
  parseOptionalDate,
  ReinforcementTaskInvalidScopeException,
} from '../domain/reinforcement-task-domain';
import {
  CreateReinforcementTaskDto,
  DuplicateReinforcementTaskDto,
  ListReinforcementTasksQueryDto,
} from '../dto/reinforcement-task.dto';
import {
  CreateTaskWithChildrenInput,
  ListTasksFilters,
  NormalizedTargetForWrite,
  ReinforcementTasksRepository,
  ReinforcementTaskRecord,
  TermOptionRecord,
} from '../infrastructure/reinforcement-tasks.repository';

export function resolveTaskAcademicYearId(input: {
  academicYearId?: string | null;
  yearId?: string | null;
}): string {
  const academicYearId = input.academicYearId ?? input.yearId;
  if (!academicYearId) {
    throw new ValidationDomainException('Academic year is required', {
      field: 'academicYearId',
      aliases: ['yearId'],
    });
  }

  return academicYearId;
}

export async function validateTaskAcademicContext(params: {
  repository: ReinforcementTasksRepository;
  academicYearId: string;
  termId: string;
}): Promise<{ term: TermOptionRecord }> {
  const [academicYear, term] = await Promise.all([
    params.repository.findAcademicYear(params.academicYearId),
    params.repository.findTerm(params.termId),
  ]);

  if (!academicYear) {
    throw new NotFoundDomainException('Academic year not found', {
      academicYearId: params.academicYearId,
    });
  }

  if (!term || term.academicYearId !== params.academicYearId) {
    throw new NotFoundDomainException('Term not found', {
      academicYearId: params.academicYearId,
      termId: params.termId,
    });
  }

  return { term };
}

export function assertTermWritableForReinforcement(
  term: Pick<TermOptionRecord, 'id' | 'isActive'>,
): void {
  if (!term.isActive) {
    throw new ValidationDomainException('Term is not active for task changes', {
      termId: term.id,
    });
  }
}

export async function validateTaskSubject(
  repository: ReinforcementTasksRepository,
  subjectId?: string | null,
): Promise<void> {
  if (!subjectId) return;
  const subject = await repository.findSubject(subjectId);
  if (!subject) {
    throw new NotFoundDomainException('Subject not found', { subjectId });
  }
}

export async function normalizeAndValidateTargets(params: {
  scope: ReinforcementScope;
  repository: ReinforcementTasksRepository;
  targets: Array<{ scopeType: string; scopeId?: string | null }>;
}): Promise<NormalizedTargetForWrite[]> {
  const normalized = params.targets.map((target) =>
    normalizeTaskTarget({
      schoolId: params.scope.schoolId,
      target,
    }),
  );
  assertNoDuplicateTargets(normalized);

  const resolved: NormalizedTargetForWrite[] = [];
  for (const target of normalized) {
    const resource = await params.repository.findTargetResource(target);
    if (!resource) {
      throw new NotFoundDomainException('Reinforcement target not found', {
        scopeType: target.scopeType,
        scopeKey: target.scopeKey,
      });
    }
    resolved.push(resource);
  }

  return resolved;
}

export async function buildCreateTaskMutationInput(params: {
  scope: ReinforcementScope;
  repository: ReinforcementTasksRepository;
  command: CreateReinforcementTaskDto;
}): Promise<CreateTaskWithChildrenInput> {
  const academicYearId = resolveTaskAcademicYearId(params.command);
  const { term } = await validateTaskAcademicContext({
    repository: params.repository,
    academicYearId,
    termId: params.command.termId,
  });
  assertTermWritableForReinforcement(term);
  await validateTaskSubject(params.repository, params.command.subjectId);

  const titleEn = normalizeNullableText(params.command.titleEn);
  const titleAr = normalizeNullableText(params.command.titleAr);
  if (!titleEn && !titleAr) {
    throw new ValidationDomainException('Task title is required', {
      field: 'titleEn',
      aliases: ['titleAr'],
    });
  }

  const targets = await normalizeAndValidateTargets({
    scope: params.scope,
    repository: params.repository,
    targets: params.command.targets,
  });
  const stages = normalizeTaskStages({
    stages: params.command.stages,
    taskTitleEn: titleEn,
    taskTitleAr: titleAr,
  });
  const enrollments = dedupeEnrollmentsByStudent(
    await params.repository.resolveEnrollmentsForTargets({
    academicYearId,
    termId: params.command.termId,
    targets,
    }),
  );

  return {
    schoolId: params.scope.schoolId,
    task: {
      academicYearId,
      termId: params.command.termId,
      subjectId: params.command.subjectId ?? null,
      titleEn,
      titleAr,
      descriptionEn: normalizeNullableText(params.command.descriptionEn),
      descriptionAr: normalizeNullableText(params.command.descriptionAr),
      source: normalizeReinforcementSource(params.command.source),
      status: ReinforcementTaskStatus.NOT_COMPLETED,
      rewardType: normalizeRewardType(params.command.rewardType),
      rewardValue: toDecimal(params.command.rewardValue),
      rewardLabelEn: normalizeNullableText(params.command.rewardLabelEn),
      rewardLabelAr: normalizeNullableText(params.command.rewardLabelAr),
      dueDate: parseOptionalDate(params.command.dueDate, 'dueDate'),
      assignedById: params.command.assignedById ?? params.scope.actorId,
      assignedByName: normalizeNullableText(params.command.assignedByName),
      createdById: params.scope.actorId,
      metadata: toJsonInput(params.command.metadata),
    },
    targets,
    stages,
    assignments: enrollments.map((enrollment) => ({
      studentId: enrollment.studentId,
      enrollmentId: enrollment.id,
    })),
  };
}

export async function buildDuplicateTaskMutationInput(params: {
  scope: ReinforcementScope;
  repository: ReinforcementTasksRepository;
  sourceTask: ReinforcementTaskRecord;
  command?: DuplicateReinforcementTaskDto;
}): Promise<CreateTaskWithChildrenInput> {
  const duplicate = buildDuplicateTaskPayload({
    sourceTask: params.sourceTask,
    overrides: params.command,
  });

  const { term } = await validateTaskAcademicContext({
    repository: params.repository,
    academicYearId: duplicate.academicYearId,
    termId: duplicate.termId,
  });
  assertTermWritableForReinforcement(term);
  await validateTaskSubject(params.repository, params.sourceTask.subjectId);

  const targets = params.sourceTask.targets.map((target) => ({
    scopeType: target.scopeType,
    scopeKey: target.scopeKey,
    stageId: target.stageId,
    gradeId: target.gradeId,
    sectionId: target.sectionId,
    classroomId: target.classroomId,
    studentId: target.studentId,
  }));

  const enrollments = dedupeEnrollmentsByStudent(
    await params.repository.resolveEnrollmentsForTargets({
    academicYearId: duplicate.academicYearId,
    termId: duplicate.termId,
    targets,
    }),
  );

  return {
    schoolId: params.scope.schoolId,
    task: {
      academicYearId: duplicate.academicYearId,
      termId: duplicate.termId,
      subjectId: params.sourceTask.subjectId,
      titleEn: duplicate.titleEn,
      titleAr: duplicate.titleAr,
      descriptionEn: params.sourceTask.descriptionEn,
      descriptionAr: params.sourceTask.descriptionAr,
      source: params.sourceTask.source,
      status: ReinforcementTaskStatus.NOT_COMPLETED,
      rewardType: params.sourceTask.rewardType,
      rewardValue: params.sourceTask.rewardValue,
      rewardLabelEn: params.sourceTask.rewardLabelEn,
      rewardLabelAr: params.sourceTask.rewardLabelAr,
      dueDate: duplicate.dueDate,
      assignedById: params.scope.actorId,
      assignedByName: params.sourceTask.assignedByName,
      createdById: params.scope.actorId,
      metadata: toJsonInput(params.sourceTask.metadata),
    },
    targets,
    stages: params.sourceTask.stages.map((stage) => ({
      sortOrder: stage.sortOrder,
      titleEn: stage.titleEn,
      titleAr: stage.titleAr,
      descriptionEn: stage.descriptionEn,
      descriptionAr: stage.descriptionAr,
      proofType: stage.proofType,
      requiresApproval: stage.requiresApproval,
      metadata: stage.metadata,
    })),
    assignments: enrollments.map((enrollment) => ({
      studentId: enrollment.studentId,
      enrollmentId: enrollment.id,
    })),
  };
}

export function normalizeTaskListFilters(
  query: ListReinforcementTasksQueryDto,
): ListTasksFilters {
  const dueDateRange: { dueFrom?: Date; dueTo?: Date } = query.dueDate
    ? dateOnlyRange(query.dueDate, 'dueDate')
    : {};
  const parsedRange = {
    dueFrom: query.dueFrom
      ? parseOptionalDate(query.dueFrom, 'dueFrom') ?? undefined
      : dueDateRange.dueFrom,
    dueTo: query.dueTo
      ? parseOptionalDate(query.dueTo, 'dueTo') ?? undefined
      : dueDateRange.dueTo,
  };

  if (parsedRange.dueFrom && parsedRange.dueTo && parsedRange.dueFrom > parsedRange.dueTo) {
    throw new ValidationDomainException('Invalid due date range', {
      dueFrom: query.dueFrom,
      dueTo: query.dueTo,
    });
  }

  return {
    ...(query.academicYearId ?? query.yearId
      ? { academicYearId: query.academicYearId ?? query.yearId }
      : {}),
    ...(query.termId ? { termId: query.termId } : {}),
    ...(query.status ? { status: normalizeTaskStatus(query.status) } : {}),
    ...(query.source ? { source: normalizeReinforcementSource(query.source) } : {}),
    ...(query.targetScope ?? query.scope
      ? { targetScope: normalizeTargetScope(query.targetScope ?? query.scope) }
      : {}),
    ...(query.targetId ? { targetId: query.targetId } : {}),
    ...(query.classroomId ? { classroomId: query.classroomId } : {}),
    ...(query.sectionId ? { sectionId: query.sectionId } : {}),
    ...(query.gradeId ? { gradeId: query.gradeId } : {}),
    ...(query.stageId ? { stageId: query.stageId } : {}),
    ...(query.studentId ? { studentId: query.studentId } : {}),
    ...(query.subjectId ? { subjectId: query.subjectId } : {}),
    ...parsedRange,
    ...(query.search ?? query.q ? { search: query.search ?? query.q } : {}),
    includeCancelled: query.includeCancelled ?? false,
    ...(query.limit ? { limit: query.limit } : {}),
    ...(query.offset ? { offset: query.offset } : {}),
  };
}

export function ensureKnownTargetScope(scopeType: string): void {
  try {
    normalizeTargetScope(scopeType);
  } catch (error) {
    if (error instanceof ReinforcementTaskInvalidScopeException) throw error;
    throw error;
  }
}

export function buildTaskAuditEntry(params: {
  scope: ReinforcementScope;
  action: string;
  task: ReinforcementTaskRecord;
  before?: ReinforcementTaskRecord | null;
  afterMetadata?: Record<string, unknown>;
}) {
  const entry = {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'reinforcement',
    action: params.action,
    resourceType: 'reinforcement_task',
    resourceId: params.task.id,
    outcome: AuditOutcome.SUCCESS,
    after: {
      ...summarizeTaskForAudit(params.task),
      ...(params.afterMetadata ?? {}),
    },
  };

  return params.before
    ? { ...entry, before: summarizeTaskForAudit(params.before) }
    : entry;
}

export function summarizeTaskForAudit(task: ReinforcementTaskRecord) {
  return {
    academicYearId: task.academicYearId,
    termId: task.termId,
    subjectId: task.subjectId,
    source: task.source,
    status: task.status,
    rewardType: task.rewardType,
    dueDate: task.dueDate?.toISOString() ?? null,
    assignedById: task.assignedById,
    createdById: task.createdById,
    cancelledById: task.cancelledById,
    cancelledAt: task.cancelledAt?.toISOString() ?? null,
    targetCount: task.targets.length,
    stageCount: task.stages.length,
    assignmentCount: task.assignments.length,
  };
}

function toDecimal(value: number | string | null | undefined): Prisma.Decimal | null {
  if (value === undefined || value === null || value === '') return null;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new ValidationDomainException('Reward value is invalid', {
      field: 'rewardValue',
      value,
    });
  }

  return new Prisma.Decimal(numberValue);
}

function toJsonInput(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : (value as Prisma.InputJsonValue);
}

function dedupeEnrollmentsByStudent<T extends { studentId: string }>(
  enrollments: T[],
): T[] {
  const byStudentId = new Map<string, T>();
  for (const enrollment of enrollments) {
    if (!byStudentId.has(enrollment.studentId)) {
      byStudentId.set(enrollment.studentId, enrollment);
    }
  }

  return [...byStudentId.values()];
}

function dateOnlyRange(
  value: string,
  field: string,
): { dueFrom: Date; dueTo: Date } {
  const start = parseOptionalDate(value, field);
  if (!start) {
    throw new ValidationDomainException('Date value is invalid', {
      field,
      value,
    });
  }

  const dueFrom = new Date(start);
  dueFrom.setUTCHours(0, 0, 0, 0);
  const dueTo = new Date(dueFrom);
  dueTo.setUTCDate(dueTo.getUTCDate() + 1);
  dueTo.setUTCMilliseconds(dueTo.getUTCMilliseconds() - 1);

  return { dueFrom, dueTo };
}

export function hasField<T extends object>(value: T, field: keyof T): boolean {
  return hasOwn(value, field);
}
