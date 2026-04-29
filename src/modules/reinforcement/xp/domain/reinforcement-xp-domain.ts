import { HttpStatus } from '@nestjs/common';
import {
  ReinforcementRewardType,
  ReinforcementSubmissionStatus,
  ReinforcementTargetScope,
  XpSourceType,
} from '@prisma/client';
import {
  DomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';

export interface XpPolicyLike {
  id?: string | null;
  scopeType: ReinforcementTargetScope | string;
  scopeKey: string;
  dailyCap: number | null;
  weeklyCap: number | null;
  cooldownMinutes: number | null;
  allowedReasons?: unknown;
  startsAt: Date | string | null;
  endsAt: Date | string | null;
  isActive: boolean;
  updatedAt?: Date | string;
}

export interface XpScopeCandidate {
  scopeType: ReinforcementTargetScope;
  scopeKey: string;
}

export interface XpResolvedScope {
  scopeType: ReinforcementTargetScope;
  scopeKey: string;
  stageId: string | null;
  gradeId: string | null;
  sectionId: string | null;
  classroomId: string | null;
  studentId: string | null;
}

export interface XpCapUsage {
  dailyXp: number;
  weeklyXp: number;
  dailyCap: number | null;
  weeklyCap: number | null;
}

export class XpPolicyConflictException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'reinforcement.policy.conflict',
      message: 'An active XP policy already exists for this scope',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class XpDuplicateSourceException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'reinforcement.xp.duplicate_source',
      message: 'XP has already been granted for this source',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class XpDailyCapReachedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'reinforcement.xp.daily_cap_reached',
      message: 'Daily XP cap reached',
      httpStatus: HttpStatus.TOO_MANY_REQUESTS,
      details,
    });
  }
}

export class XpCooldownException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'reinforcement.xp.cooldown',
      message: 'XP cooldown is still in effect',
      httpStatus: HttpStatus.TOO_MANY_REQUESTS,
      details,
    });
  }
}

const TARGET_SCOPE_ALIASES: Record<string, ReinforcementTargetScope> = {
  school: ReinforcementTargetScope.SCHOOL,
  stage: ReinforcementTargetScope.STAGE,
  grade: ReinforcementTargetScope.GRADE,
  section: ReinforcementTargetScope.SECTION,
  classroom: ReinforcementTargetScope.CLASSROOM,
  class: ReinforcementTargetScope.CLASSROOM,
  student: ReinforcementTargetScope.STUDENT,
};

const XP_SOURCE_ALIASES: Record<string, XpSourceType> = {
  reinforcement_task: XpSourceType.REINFORCEMENT_TASK,
  reinforcementtask: XpSourceType.REINFORCEMENT_TASK,
  reinforcement_review: XpSourceType.REINFORCEMENT_TASK,
  manual_bonus: XpSourceType.MANUAL_BONUS,
  manualbonus: XpSourceType.MANUAL_BONUS,
  behavior: XpSourceType.BEHAVIOR,
  grade: XpSourceType.GRADE,
  attendance: XpSourceType.ATTENDANCE,
  system: XpSourceType.SYSTEM,
};

export const XP_SCOPE_PRIORITY: ReinforcementTargetScope[] = [
  ReinforcementTargetScope.STUDENT,
  ReinforcementTargetScope.CLASSROOM,
  ReinforcementTargetScope.SECTION,
  ReinforcementTargetScope.GRADE,
  ReinforcementTargetScope.STAGE,
  ReinforcementTargetScope.SCHOOL,
];

export function normalizeXpPolicyScope(
  input: ReinforcementTargetScope | string | null | undefined,
  fallback = ReinforcementTargetScope.SCHOOL,
): ReinforcementTargetScope {
  return normalizeEnumValue({
    input,
    aliases: TARGET_SCOPE_ALIASES,
    values: Object.values(ReinforcementTargetScope),
    fallback,
    field: 'scopeType',
  });
}

export function normalizeXpSourceType(
  input: XpSourceType | string | null | undefined,
): XpSourceType {
  return normalizeEnumValue({
    input,
    aliases: XP_SOURCE_ALIASES,
    values: Object.values(XpSourceType),
    field: 'sourceType',
  });
}

export function buildXpScopeKey(params: {
  schoolId: string;
  scopeType: ReinforcementTargetScope;
  scopeId?: string | null;
}): string {
  if (params.scopeType === ReinforcementTargetScope.SCHOOL) {
    if (params.scopeId && params.scopeId !== params.schoolId) {
      throw new ValidationDomainException(
        'School XP policy scope must use the current school',
        { scopeId: params.scopeId },
      );
    }

    return params.schoolId;
  }

  const scopeId = normalizeNullableText(params.scopeId);
  if (!scopeId) {
    throw new ValidationDomainException('XP policy scope requires scopeId', {
      scopeType: params.scopeType,
      field: 'scopeId',
    });
  }

  return scopeId;
}

export function assertPolicyCapsValid(input: {
  dailyCap?: number | null;
  weeklyCap?: number | null;
  cooldownMinutes?: number | null;
}): void {
  assertNonNegativeInteger('dailyCap', input.dailyCap);
  assertNonNegativeInteger('weeklyCap', input.weeklyCap);
  assertNonNegativeInteger('cooldownMinutes', input.cooldownMinutes);

  if (
    input.dailyCap !== undefined &&
    input.dailyCap !== null &&
    input.weeklyCap !== undefined &&
    input.weeklyCap !== null &&
    input.weeklyCap < input.dailyCap
  ) {
    throw new ValidationDomainException(
      'Weekly XP cap must be greater than or equal to daily XP cap',
      {
        dailyCap: input.dailyCap,
        weeklyCap: input.weeklyCap,
      },
    );
  }
}

export function assertPolicyDateRangeValid(input: {
  startsAt?: Date | null;
  endsAt?: Date | null;
}): void {
  if (input.startsAt && input.endsAt && input.startsAt > input.endsAt) {
    throw new ValidationDomainException(
      'XP policy start date must be before or equal to end date',
      {
        startsAt: input.startsAt.toISOString(),
        endsAt: input.endsAt.toISOString(),
      },
    );
  }
}

export function assertNoPolicyConflict(
  conflict: { id: string } | null | undefined,
): void {
  if (conflict) {
    throw new XpPolicyConflictException({ policyId: conflict.id });
  }
}

export function assertXpGrantAmount(value: unknown): number {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new ValidationDomainException('XP amount must be a positive integer', {
      field: 'amount',
      value,
    });
  }

  return amount;
}

export function resolveXpAmountFromReinforcementSubmission(input: {
  overrideAmount?: number | null;
  task?: {
    rewardType?: ReinforcementRewardType | string | null;
    rewardValue?: unknown;
  } | null;
}): number {
  if (input.overrideAmount !== undefined && input.overrideAmount !== null) {
    return assertXpGrantAmount(input.overrideAmount);
  }

  const rewardType = input.task?.rewardType;
  if (
    rewardType === ReinforcementRewardType.XP ||
    String(rewardType ?? '').toUpperCase() === ReinforcementRewardType.XP
  ) {
    return assertXpGrantAmount(decimalToNumber(input.task?.rewardValue));
  }

  throw new ValidationDomainException(
    'No XP amount is available for this reinforcement submission',
    { field: 'amount' },
  );
}

export function assertSubmissionEligibleForXpGrant(submission: {
  id: string;
  status: ReinforcementSubmissionStatus | string;
}): void {
  const status = String(submission.status).toUpperCase();
  if (status !== ReinforcementSubmissionStatus.APPROVED) {
    throw new ValidationDomainException(
      'Submission must be approved before XP can be granted',
      { submissionId: submission.id, status: submission.status },
    );
  }
}

export function assertManualBonusPayload(input: {
  amount?: number | null;
  reason?: string | null;
}): { amount: number; reason: string } {
  const reason = normalizeNullableText(input.reason);
  if (!reason) {
    throw new ValidationDomainException('Manual XP bonus reason is required', {
      field: 'reason',
    });
  }

  return {
    amount: assertXpGrantAmount(input.amount),
    reason,
  };
}

export function calculateXpCapUsage(input: {
  dailyXp: number;
  weeklyXp: number;
  policy: Pick<XpPolicyLike, 'dailyCap' | 'weeklyCap'> | null;
}): XpCapUsage {
  return {
    dailyXp: input.dailyXp,
    weeklyXp: input.weeklyXp,
    dailyCap: input.policy?.dailyCap ?? null,
    weeklyCap: input.policy?.weeklyCap ?? null,
  };
}

export function assertXpCapsNotExceeded(input: {
  amount: number;
  usage: XpCapUsage;
}): void {
  if (
    input.usage.dailyCap !== null &&
    input.usage.dailyXp + input.amount > input.usage.dailyCap
  ) {
    throw new XpDailyCapReachedException({
      dailyCap: input.usage.dailyCap,
      currentXp: input.usage.dailyXp,
      requestedAmount: input.amount,
    });
  }

  if (
    input.usage.weeklyCap !== null &&
    input.usage.weeklyXp + input.amount > input.usage.weeklyCap
  ) {
    throw new ValidationDomainException('Weekly XP cap reached', {
      weeklyCap: input.usage.weeklyCap,
      currentXp: input.usage.weeklyXp,
      requestedAmount: input.amount,
    });
  }
}

export function assertXpCooldownNotViolated(input: {
  policy: Pick<XpPolicyLike, 'cooldownMinutes'> | null;
  latestOccurredAt?: Date | null;
  now: Date;
}): void {
  const cooldownMinutes = input.policy?.cooldownMinutes ?? null;
  if (!cooldownMinutes || !input.latestOccurredAt) return;

  const cooldownMs = cooldownMinutes * 60 * 1000;
  const elapsedMs =
    input.now.getTime() - input.latestOccurredAt.getTime();
  if (elapsedMs < cooldownMs) {
    throw new XpCooldownException({
      cooldownMinutes,
      latestOccurredAt: input.latestOccurredAt.toISOString(),
      retryAfterSeconds: Math.ceil((cooldownMs - elapsedMs) / 1000),
    });
  }
}

export function assertAllowedXpReason(input: {
  policy: Pick<XpPolicyLike, 'allowedReasons'> | null;
  reason?: string | null;
  sourceType: XpSourceType;
}): void {
  const allowed = normalizeAllowedReasons(input.policy?.allowedReasons);
  if (!allowed) return;

  const reason = normalizeNullableText(input.reason);
  const accepted = [input.sourceType, input.sourceType.toLowerCase()];
  if (reason) accepted.push(reason, reason.toLowerCase());

  if (!accepted.some((candidate) => allowed.has(candidate.toLowerCase()))) {
    throw new ValidationDomainException(
      'XP reason is not allowed by the effective policy',
      {
        reason,
        sourceType: input.sourceType,
      },
    );
  }
}

export function buildXpLedgerPayload(input: {
  schoolId: string;
  academicYearId: string;
  termId: string;
  studentId: string;
  enrollmentId?: string | null;
  assignmentId?: string | null;
  policyId?: string | null;
  sourceType: XpSourceType;
  sourceId: string;
  amount: number;
  reason?: string | null;
  reasonAr?: string | null;
  actorUserId?: string | null;
  occurredAt: Date;
  metadata?: unknown;
}) {
  return {
    schoolId: input.schoolId,
    academicYearId: input.academicYearId,
    termId: input.termId,
    studentId: input.studentId,
    enrollmentId: input.enrollmentId ?? null,
    assignmentId: input.assignmentId ?? null,
    policyId: input.policyId ?? null,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    amount: input.amount,
    reason: normalizeNullableText(input.reason),
    reasonAr: normalizeNullableText(input.reasonAr),
    actorUserId: input.actorUserId ?? null,
    occurredAt: input.occurredAt,
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  };
}

export function buildEffectiveScopeCandidates(
  scope: XpResolvedScope,
  schoolId: string,
): XpScopeCandidate[] {
  const candidates: XpScopeCandidate[] = [];

  if (scope.studentId) {
    candidates.push({
      scopeType: ReinforcementTargetScope.STUDENT,
      scopeKey: scope.studentId,
    });
  }
  if (scope.classroomId) {
    candidates.push({
      scopeType: ReinforcementTargetScope.CLASSROOM,
      scopeKey: scope.classroomId,
    });
  }
  if (scope.sectionId) {
    candidates.push({
      scopeType: ReinforcementTargetScope.SECTION,
      scopeKey: scope.sectionId,
    });
  }
  if (scope.gradeId) {
    candidates.push({
      scopeType: ReinforcementTargetScope.GRADE,
      scopeKey: scope.gradeId,
    });
  }
  if (scope.stageId) {
    candidates.push({
      scopeType: ReinforcementTargetScope.STAGE,
      scopeKey: scope.stageId,
    });
  }

  candidates.push({
    scopeType: ReinforcementTargetScope.SCHOOL,
    scopeKey: schoolId,
  });

  return candidates;
}

export function selectEffectiveXpPolicy<T extends XpPolicyLike>(
  policies: T[],
  candidates: XpScopeCandidate[],
  now: Date,
): T | null {
  const rank = new Map(
    candidates.map((candidate, index) => [
      `${candidate.scopeType}:${candidate.scopeKey}`,
      index,
    ]),
  );

  const matching = policies
    .filter((policy) => xpPolicyIsCurrentlyActive(policy, now))
    .filter((policy) =>
      rank.has(`${normalizeXpPolicyScope(policy.scopeType)}:${policy.scopeKey}`),
    );

  matching.sort((left, right) => {
    const leftRank =
      rank.get(`${normalizeXpPolicyScope(left.scopeType)}:${left.scopeKey}`) ??
      scopePriority(normalizeXpPolicyScope(left.scopeType));
    const rightRank =
      rank.get(`${normalizeXpPolicyScope(right.scopeType)}:${right.scopeKey}`) ??
      scopePriority(normalizeXpPolicyScope(right.scopeType));

    if (leftRank !== rightRank) return leftRank - rightRank;

    return (
      dateTime(right.updatedAt).getTime() - dateTime(left.updatedAt).getTime()
    );
  });

  return matching[0] ?? null;
}

export function xpPolicyIsCurrentlyActive(
  policy: XpPolicyLike,
  now: Date,
): boolean {
  if (!policy.isActive) return false;

  const startsAt = nullableDate(policy.startsAt);
  const endsAt = nullableDate(policy.endsAt);
  if (startsAt && startsAt > now) return false;
  if (endsAt && endsAt < now) return false;

  return true;
}

export function scopePriority(scopeType: ReinforcementTargetScope): number {
  const index = XP_SCOPE_PRIORITY.indexOf(scopeType);
  return index === -1 ? XP_SCOPE_PRIORITY.length : index;
}

export function getCalendarDayWindow(date: Date): { from: Date; to: Date } {
  const from = new Date(date);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from, to };
}

export function getCalendarWeekWindow(date: Date): { from: Date; to: Date } {
  const from = new Date(date);
  from.setHours(0, 0, 0, 0);
  const day = from.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  from.setDate(from.getDate() - daysSinceMonday);
  const to = new Date(from);
  to.setDate(to.getDate() + 7);
  return { from, to };
}

export function summarizeXpLedger<
  T extends {
    sourceType: XpSourceType | string;
    amount: number;
    studentId: string;
    student?: { firstName: string; lastName: string } | null;
  },
>(entries: T[]) {
  const bySourceType = new Map<string, number>();
  const byStudent = new Map<
    string,
    { studentId: string; studentName: string | null; totalXp: number }
  >();

  let totalXp = 0;
  for (const entry of entries) {
    totalXp += entry.amount;
    const sourceType = String(entry.sourceType).toLowerCase();
    bySourceType.set(sourceType, (bySourceType.get(sourceType) ?? 0) + entry.amount);

    const existing = byStudent.get(entry.studentId);
    if (existing) {
      existing.totalXp += entry.amount;
    } else {
      byStudent.set(entry.studentId, {
        studentId: entry.studentId,
        studentName: entry.student
          ? `${entry.student.firstName} ${entry.student.lastName}`.trim()
          : null,
        totalXp: entry.amount,
      });
    }
  }

  const students = [...byStudent.values()];
  const topStudents = students
    .sort((left, right) => {
      if (right.totalXp !== left.totalXp) return right.totalXp - left.totalXp;
      return left.studentId.localeCompare(right.studentId);
    })
    .slice(0, 10);

  return {
    totalXp,
    studentsCount: students.length,
    averageXp: students.length > 0 ? totalXp / students.length : 0,
    bySourceType: [...bySourceType.entries()].map(([sourceType, amount]) => ({
      sourceType,
      amount,
    })),
    topStudents,
  };
}

export function normalizeNullableText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

export function parseOptionalIsoDate(
  value: string | null | undefined,
  field: string,
): Date | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationDomainException('Date value is invalid', {
      field,
      value,
    });
  }

  return parsed;
}

export function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002',
  );
}

function assertNonNegativeInteger(
  field: string,
  value: number | null | undefined,
): void {
  if (value === undefined || value === null) return;
  if (!Number.isInteger(value) || value < 0) {
    throw new ValidationDomainException(`${field} must be a non-negative integer`, {
      field,
      value,
    });
  }
}

function normalizeAllowedReasons(value: unknown): Set<string> | null {
  if (!value) return null;

  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return new Set(value.map((item) => item.toLowerCase()));
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { reasons?: unknown }).reasons) &&
    (value as { reasons: unknown[] }).reasons.every(
      (item) => typeof item === 'string',
    )
  ) {
    return new Set(
      (value as { reasons: string[] }).reasons.map((item) => item.toLowerCase()),
    );
  }

  return null;
}

function decimalToNumber(value: unknown): number {
  if (value && typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }

  return Number(value);
}

function nullableDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function dateTime(value: Date | string | null | undefined): Date {
  return nullableDate(value) ?? new Date(0);
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
