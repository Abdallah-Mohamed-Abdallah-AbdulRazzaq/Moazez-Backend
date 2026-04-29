import {
  AuditOutcome,
  Prisma,
  ReinforcementTargetScope,
  XpSourceType,
} from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { ReinforcementScope } from '../../reinforcement-context';
import {
  assertAllowedXpReason,
  assertNoPolicyConflict,
  assertPolicyCapsValid,
  assertPolicyDateRangeValid,
  assertXpCapsNotExceeded,
  assertXpCooldownNotViolated,
  buildEffectiveScopeCandidates,
  buildXpScopeKey,
  calculateXpCapUsage,
  getCalendarDayWindow,
  getCalendarWeekWindow,
  isUniqueConstraintError,
  normalizeNullableText,
  normalizeXpPolicyScope,
  normalizeXpSourceType,
  parseOptionalIsoDate,
  selectEffectiveXpPolicy,
  XpPolicyConflictException,
  XpPolicyLike,
  XpResolvedScope,
} from '../domain/reinforcement-xp-domain';
import {
  CreateXpPolicyDto,
  GetEffectiveXpPolicyQueryDto,
  GetXpSummaryQueryDto,
  ListXpLedgerQueryDto,
  ListXpPoliciesQueryDto,
  UpdateXpPolicyDto,
} from '../dto/reinforcement-xp.dto';
import {
  ReinforcementXpRepository,
  XpEnrollmentPlacementRecord,
  XpLedgerFilters,
  XpPolicyFilters,
  XpPolicyRecord,
  XpTermRecord,
} from '../infrastructure/reinforcement-xp.repository';

type ScopeQuery = {
  scopeType?: string;
  scopeId?: string;
  stageId?: string;
  gradeId?: string;
  sectionId?: string;
  classroomId?: string;
  studentId?: string;
};

export function resolveXpAcademicYearId(input: {
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

export async function validateXpAcademicContext(params: {
  repository: ReinforcementXpRepository;
  academicYearId: string;
  termId: string;
}): Promise<{ term: XpTermRecord }> {
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

export function normalizePolicyFilters(
  query: ListXpPoliciesQueryDto,
): XpPolicyFilters {
  return {
    ...(query.academicYearId ?? query.yearId
      ? { academicYearId: query.academicYearId ?? query.yearId }
      : {}),
    ...(query.termId ? { termId: query.termId } : {}),
    ...(query.scopeType
      ? { scopeType: normalizeXpPolicyScope(query.scopeType) }
      : {}),
    ...(query.scopeKey ? { scopeKey: query.scopeKey } : {}),
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    includeDeleted: query.includeDeleted ?? false,
  };
}

export async function resolvePolicyScope(params: {
  scope: ReinforcementScope;
  repository: ReinforcementXpRepository;
  scopeType: string;
  scopeId?: string | null;
}): Promise<XpResolvedScope> {
  const scopeType = normalizeXpPolicyScope(params.scopeType);
  const scopeKey = buildXpScopeKey({
    schoolId: params.scope.schoolId,
    scopeType,
    scopeId: params.scopeId,
  });
  const resource = await params.repository.findScopeResource({
    schoolId: params.scope.schoolId,
    scopeType,
    scopeKey,
  });

  if (!resource) {
    throw new NotFoundDomainException('XP policy scope resource not found', {
      scopeType,
      scopeKey,
    });
  }

  return resource;
}

export async function resolveEffectiveXpRequestScope(params: {
  scope: ReinforcementScope;
  repository: ReinforcementXpRepository;
  query: ScopeQuery;
  academicYearId: string;
  termId: string;
}): Promise<XpResolvedScope> {
  const scopeType = inferScopeType(params.query);
  const scopeKey = buildXpScopeKey({
    schoolId: params.scope.schoolId,
    scopeType,
    scopeId: resolveScopeIdForType(scopeType, params.query),
  });

  const resource = await params.repository.findScopeResource({
    schoolId: params.scope.schoolId,
    scopeType,
    scopeKey,
  });
  if (!resource) {
    throw new NotFoundDomainException('XP scope resource not found', {
      scopeType,
      scopeKey,
    });
  }

  const resolved =
    scopeType === ReinforcementTargetScope.STUDENT
      ? await enrichStudentScopeWithEnrollment({
          repository: params.repository,
          academicYearId: params.academicYearId,
          termId: params.termId,
          resource,
        })
      : resource;

  assertOptionalScopeParents(params.query, resolved);
  return resolved;
}

export function buildCreateXpPolicyData(params: {
  schoolId: string;
  academicYearId: string;
  termId: string;
  scope: XpResolvedScope;
  command: CreateXpPolicyDto;
}): Prisma.XpPolicyUncheckedCreateInput {
  const startsAt = parseOptionalIsoDate(params.command.startsAt, 'startsAt');
  const endsAt = parseOptionalIsoDate(params.command.endsAt, 'endsAt');
  assertPolicyCapsValid(params.command);
  assertPolicyDateRangeValid({ startsAt, endsAt });

  return {
    schoolId: params.schoolId,
    academicYearId: params.academicYearId,
    termId: params.termId,
    scopeType: params.scope.scopeType,
    scopeKey: params.scope.scopeKey,
    dailyCap: params.command.dailyCap ?? null,
    weeklyCap: params.command.weeklyCap ?? null,
    cooldownMinutes: params.command.cooldownMinutes ?? null,
    allowedReasons: toNullableJson(params.command.allowedReasons),
    startsAt,
    endsAt,
    isActive: params.command.isActive ?? true,
  };
}

export function buildUpdateXpPolicyData(params: {
  existing: XpPolicyRecord;
  command: UpdateXpPolicyDto;
}): Prisma.XpPolicyUncheckedUpdateInput {
  const nextDailyCap = hasOwn(params.command, 'dailyCap')
    && params.command.dailyCap !== undefined
    ? (params.command.dailyCap ?? null)
    : params.existing.dailyCap;
  const nextWeeklyCap = hasOwn(params.command, 'weeklyCap')
    && params.command.weeklyCap !== undefined
    ? (params.command.weeklyCap ?? null)
    : params.existing.weeklyCap;
  const nextCooldownMinutes = hasOwn(params.command, 'cooldownMinutes')
    && params.command.cooldownMinutes !== undefined
    ? (params.command.cooldownMinutes ?? null)
    : params.existing.cooldownMinutes;
  const nextStartsAt = hasOwn(params.command, 'startsAt')
    && params.command.startsAt !== undefined
    ? parseOptionalIsoDate(params.command.startsAt, 'startsAt')
    : params.existing.startsAt;
  const nextEndsAt = hasOwn(params.command, 'endsAt')
    && params.command.endsAt !== undefined
    ? parseOptionalIsoDate(params.command.endsAt, 'endsAt')
    : params.existing.endsAt;

  assertPolicyCapsValid({
    dailyCap: nextDailyCap,
    weeklyCap: nextWeeklyCap,
    cooldownMinutes: nextCooldownMinutes,
  });
  assertPolicyDateRangeValid({
    startsAt: nextStartsAt,
    endsAt: nextEndsAt,
  });

  const data: Prisma.XpPolicyUncheckedUpdateInput = {};
  if (params.command.dailyCap !== undefined) data.dailyCap = nextDailyCap;
  if (params.command.weeklyCap !== undefined) data.weeklyCap = nextWeeklyCap;
  if (params.command.cooldownMinutes !== undefined) {
    data.cooldownMinutes = nextCooldownMinutes;
  }
  if (params.command.allowedReasons !== undefined) {
    data.allowedReasons = toNullableJson(params.command.allowedReasons);
  }
  if (params.command.startsAt !== undefined) data.startsAt = nextStartsAt;
  if (params.command.endsAt !== undefined) data.endsAt = nextEndsAt;
  if (params.command.isActive !== undefined) data.isActive = params.command.isActive;

  return data;
}

export async function assertActivePolicyConflictFree(params: {
  repository: ReinforcementXpRepository;
  policy: {
    academicYearId: string;
    termId: string;
    scopeType: ReinforcementTargetScope;
    scopeKey: string;
    isActive: boolean;
  };
  excludeId?: string;
}): Promise<void> {
  if (!params.policy.isActive) return;

  const conflict = await params.repository.checkActivePolicyConflict({
    academicYearId: params.policy.academicYearId,
    termId: params.policy.termId,
    scopeType: params.policy.scopeType,
    scopeKey: params.policy.scopeKey,
    excludeId: params.excludeId,
  });
  assertNoPolicyConflict(conflict);
}

export async function findEffectivePolicyForScope(params: {
  repository: ReinforcementXpRepository;
  schoolId: string;
  academicYearId: string;
  termId: string;
  scope: XpResolvedScope;
  now: Date;
}): Promise<XpPolicyRecord | null> {
  const candidates = buildEffectiveScopeCandidates(params.scope, params.schoolId);
  const policies = await params.repository.findEffectivePolicyCandidates({
    academicYearId: params.academicYearId,
    termId: params.termId,
    candidates,
    now: params.now,
  });

  return selectEffectiveXpPolicy(policies, candidates, params.now);
}

export function normalizeLedgerFilters(
  query: ListXpLedgerQueryDto,
): XpLedgerFilters {
  return {
    ...(query.academicYearId ?? query.yearId
      ? { academicYearId: query.academicYearId ?? query.yearId }
      : {}),
    ...(query.termId ? { termId: query.termId } : {}),
    ...(query.studentId ? { studentId: query.studentId } : {}),
    ...(query.classroomId ? { classroomId: query.classroomId } : {}),
    ...(query.sectionId ? { sectionId: query.sectionId } : {}),
    ...(query.gradeId ? { gradeId: query.gradeId } : {}),
    ...(query.stageId ? { stageId: query.stageId } : {}),
    ...(query.sourceType
      ? { sourceType: normalizeXpSourceType(query.sourceType) }
      : {}),
    ...(query.sourceId ? { sourceId: query.sourceId } : {}),
    ...(query.occurredFrom
      ? { occurredFrom: parseOptionalIsoDate(query.occurredFrom, 'occurredFrom') ?? undefined }
      : {}),
    ...(query.occurredTo
      ? { occurredTo: parseOptionalIsoDate(query.occurredTo, 'occurredTo') ?? undefined }
      : {}),
    ...(query.limit ? { limit: query.limit } : {}),
    ...(query.offset ? { offset: query.offset } : {}),
  };
}

export function normalizeSummaryLedgerFilters(params: {
  query: GetXpSummaryQueryDto;
  academicYearId: string;
  scope: XpResolvedScope;
}): XpLedgerFilters {
  return {
    academicYearId: params.academicYearId,
    termId: params.query.termId,
    ...(params.scope.studentId ? { studentId: params.scope.studentId } : {}),
    ...(params.scope.classroomId
      ? { classroomId: params.scope.classroomId }
      : {}),
    ...(params.scope.sectionId ? { sectionId: params.scope.sectionId } : {}),
    ...(params.scope.gradeId ? { gradeId: params.scope.gradeId } : {}),
    ...(params.scope.stageId ? { stageId: params.scope.stageId } : {}),
    ...(params.query.occurredFrom
      ? {
          occurredFrom:
            parseOptionalIsoDate(
              params.query.occurredFrom,
              'occurredFrom',
            ) ?? undefined,
        }
      : {}),
    ...(params.query.occurredTo
      ? {
          occurredTo:
            parseOptionalIsoDate(params.query.occurredTo, 'occurredTo') ??
            undefined,
        }
      : {}),
  };
}

export function scopeFromEnrollment(params: {
  studentId: string;
  enrollment: XpEnrollmentPlacementRecord | null;
}): XpResolvedScope {
  if (!params.enrollment) {
    return {
      scopeType: ReinforcementTargetScope.STUDENT,
      scopeKey: params.studentId,
      stageId: null,
      gradeId: null,
      sectionId: null,
      classroomId: null,
      studentId: params.studentId,
    };
  }

  return {
    scopeType: ReinforcementTargetScope.STUDENT,
    scopeKey: params.studentId,
    stageId: params.enrollment.classroom.section.grade.stageId,
    gradeId: params.enrollment.classroom.section.gradeId,
    sectionId: params.enrollment.classroom.sectionId,
    classroomId: params.enrollment.classroomId,
    studentId: params.studentId,
  };
}

export async function enforceXpPolicyForGrant(params: {
  repository: ReinforcementXpRepository;
  policy: XpPolicyLike | null;
  academicYearId: string;
  termId: string;
  studentId: string;
  amount: number;
  reason?: string | null;
  sourceType: XpSourceType;
  now: Date;
}) {
  if (!params.policy) {
    return calculateXpCapUsage({
      dailyXp: 0,
      weeklyXp: 0,
      policy: null,
    });
  }

  const day = getCalendarDayWindow(params.now);
  const week = getCalendarWeekWindow(params.now);
  const [dailyXp, weeklyXp, latest] = await Promise.all([
    params.repository.sumXpForPeriod({
      academicYearId: params.academicYearId,
      termId: params.termId,
      studentId: params.studentId,
      from: day.from,
      to: day.to,
    }),
    params.repository.sumXpForPeriod({
      academicYearId: params.academicYearId,
      termId: params.termId,
      studentId: params.studentId,
      from: week.from,
      to: week.to,
    }),
    params.repository.findLatestXpForCooldown({
      academicYearId: params.academicYearId,
      termId: params.termId,
      studentId: params.studentId,
      beforeOrAt: params.now,
    }),
  ]);

  const usage = calculateXpCapUsage({
    dailyXp,
    weeklyXp,
    policy: params.policy,
  });
  assertAllowedXpReason({
    policy: params.policy,
    reason: params.reason,
    sourceType: params.sourceType,
  });
  assertXpCapsNotExceeded({ amount: params.amount, usage });
  assertXpCooldownNotViolated({
    policy: params.policy,
    latestOccurredAt: latest?.occurredAt ?? null,
    now: params.now,
  });

  return usage;
}

export function translatePolicyConflict(error: unknown): never {
  if (isUniqueConstraintError(error)) {
    throw new XpPolicyConflictException();
  }

  throw error;
}

export function buildPolicyAuditEntry(params: {
  scope: ReinforcementScope;
  action: string;
  policy: XpPolicyRecord;
  before?: XpPolicyRecord | null;
}) {
  const entry = {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'reinforcement',
    action: params.action,
    resourceType: 'xp_policy',
    resourceId: params.policy.id,
    outcome: AuditOutcome.SUCCESS,
    after: summarizePolicyForAudit(params.policy),
  };

  return params.before
    ? { ...entry, before: summarizePolicyForAudit(params.before) }
    : entry;
}

export function buildLedgerAuditEntry(params: {
  scope: ReinforcementScope;
  action: string;
  ledger: {
    id: string;
    sourceType: XpSourceType | string;
    sourceId: string;
    studentId: string;
    enrollmentId: string | null;
    assignmentId: string | null;
    policyId: string | null;
    amount: number;
  };
  capUsage?: {
    dailyXp: number;
    weeklyXp: number;
    dailyCap: number | null;
    weeklyCap: number | null;
  };
}) {
  return {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'reinforcement',
    action: params.action,
    resourceType: 'xp_ledger',
    resourceId: params.ledger.id,
    outcome: AuditOutcome.SUCCESS,
    after: {
      sourceType: params.ledger.sourceType,
      sourceId: params.ledger.sourceId,
      studentId: params.ledger.studentId,
      enrollmentId: params.ledger.enrollmentId,
      assignmentId: params.ledger.assignmentId,
      policyId: params.ledger.policyId,
      amount: params.ledger.amount,
      ...(params.capUsage ? { capUsage: params.capUsage } : {}),
    },
  };
}

export function toJsonInput(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : (value as Prisma.InputJsonValue);
}

function summarizePolicyForAudit(policy: XpPolicyRecord) {
  return {
    academicYearId: policy.academicYearId,
    termId: policy.termId,
    scopeType: policy.scopeType,
    scopeKey: policy.scopeKey,
    dailyCap: policy.dailyCap,
    weeklyCap: policy.weeklyCap,
    cooldownMinutes: policy.cooldownMinutes,
    startsAt: policy.startsAt?.toISOString() ?? null,
    endsAt: policy.endsAt?.toISOString() ?? null,
    isActive: policy.isActive,
  };
}

async function enrichStudentScopeWithEnrollment(params: {
  repository: ReinforcementXpRepository;
  academicYearId: string;
  termId: string;
  resource: XpResolvedScope;
}): Promise<XpResolvedScope> {
  if (!params.resource.studentId) return params.resource;

  const enrollment = await params.repository.resolveEnrollmentForStudent({
    studentId: params.resource.studentId,
    academicYearId: params.academicYearId,
    termId: params.termId,
  });

  return scopeFromEnrollment({
    studentId: params.resource.studentId,
    enrollment,
  });
}

function inferScopeType(query: ScopeQuery): ReinforcementTargetScope {
  if (query.scopeType) return normalizeXpPolicyScope(query.scopeType);
  if (query.studentId) return ReinforcementTargetScope.STUDENT;
  if (query.classroomId) return ReinforcementTargetScope.CLASSROOM;
  if (query.sectionId) return ReinforcementTargetScope.SECTION;
  if (query.gradeId) return ReinforcementTargetScope.GRADE;
  if (query.stageId) return ReinforcementTargetScope.STAGE;
  return ReinforcementTargetScope.SCHOOL;
}

function resolveScopeIdForType(
  scopeType: ReinforcementTargetScope,
  query: ScopeQuery,
): string | null | undefined {
  if (query.scopeId) return query.scopeId;
  switch (scopeType) {
    case ReinforcementTargetScope.STUDENT:
      return query.studentId;
    case ReinforcementTargetScope.CLASSROOM:
      return query.classroomId;
    case ReinforcementTargetScope.SECTION:
      return query.sectionId;
    case ReinforcementTargetScope.GRADE:
      return query.gradeId;
    case ReinforcementTargetScope.STAGE:
      return query.stageId;
    case ReinforcementTargetScope.SCHOOL:
      return null;
  }
}

function assertOptionalScopeParents(
  query: ScopeQuery,
  resolved: XpResolvedScope,
): void {
  assertOptionalScopeParent('studentId', query.studentId, resolved.studentId);
  assertOptionalScopeParent(
    'classroomId',
    query.classroomId,
    resolved.classroomId,
  );
  assertOptionalScopeParent('sectionId', query.sectionId, resolved.sectionId);
  assertOptionalScopeParent('gradeId', query.gradeId, resolved.gradeId);
  assertOptionalScopeParent('stageId', query.stageId, resolved.stageId);
}

function assertOptionalScopeParent(
  field: keyof ScopeQuery,
  provided: string | undefined,
  actual: string | null,
): void {
  if (!provided) return;
  if (actual && provided === actual) return;

  throw new ValidationDomainException(
    'XP scope parent ids do not match the selected scope',
    { field },
  );
}

function toNullableJson(
  value: unknown,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
  return value === undefined || value === null
    ? Prisma.JsonNull
    : (value as Prisma.InputJsonValue);
}

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}
