import { AttendanceScopeType } from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';

export interface AttendanceScopeIds {
  stageId?: string | null;
  gradeId?: string | null;
  sectionId?: string | null;
  classroomId?: string | null;
}

export interface NormalizedAttendancePolicyScope {
  scopeType: AttendanceScopeType;
  scopeKey: string;
  stageId: string | null;
  gradeId: string | null;
  sectionId: string | null;
  classroomId: string | null;
}

export interface EffectiveScopeCandidate {
  scopeType: AttendanceScopeType;
  scopeKey: string;
}

export const ATTENDANCE_SCOPE_PRIORITY: AttendanceScopeType[] = [
  AttendanceScopeType.CLASSROOM,
  AttendanceScopeType.SECTION,
  AttendanceScopeType.GRADE,
  AttendanceScopeType.STAGE,
  AttendanceScopeType.SCHOOL,
];

export function scopePriority(scopeType: AttendanceScopeType): number {
  const index = ATTENDANCE_SCOPE_PRIORITY.indexOf(scopeType);
  return index === -1 ? ATTENDANCE_SCOPE_PRIORITY.length : index;
}

export function buildScopeKey(
  scopeType: AttendanceScopeType,
  ids: AttendanceScopeIds,
): string {
  switch (scopeType) {
    case AttendanceScopeType.SCHOOL:
      return 'school';
    case AttendanceScopeType.STAGE:
      return `stage:${requireScopeId('stageId', ids.stageId, scopeType)}`;
    case AttendanceScopeType.GRADE:
      return `grade:${requireScopeId('gradeId', ids.gradeId, scopeType)}`;
    case AttendanceScopeType.SECTION:
      return `section:${requireScopeId('sectionId', ids.sectionId, scopeType)}`;
    case AttendanceScopeType.CLASSROOM:
      return `classroom:${requireScopeId(
        'classroomId',
        ids.classroomId,
        scopeType,
      )}`;
  }
}

export function validateNormalizedScope(
  scope: NormalizedAttendancePolicyScope,
): void {
  if (scope.scopeType === AttendanceScopeType.SCHOOL) {
    const hasChildScope =
      Boolean(scope.stageId) ||
      Boolean(scope.gradeId) ||
      Boolean(scope.sectionId) ||
      Boolean(scope.classroomId);

    if (hasChildScope || scope.scopeKey !== 'school') {
      throw new ValidationDomainException(
        'School attendance policy scope must not include child scope ids',
        { scopeType: scope.scopeType, scopeKey: scope.scopeKey },
      );
    }
  }

  buildScopeKey(scope.scopeType, scope);
}

export function buildEffectiveScopeCandidates(
  scope: NormalizedAttendancePolicyScope,
): EffectiveScopeCandidate[] {
  const candidates: EffectiveScopeCandidate[] = [];

  if (scope.classroomId) {
    candidates.push({
      scopeType: AttendanceScopeType.CLASSROOM,
      scopeKey: buildScopeKey(AttendanceScopeType.CLASSROOM, scope),
    });
  }

  if (scope.sectionId) {
    candidates.push({
      scopeType: AttendanceScopeType.SECTION,
      scopeKey: buildScopeKey(AttendanceScopeType.SECTION, scope),
    });
  }

  if (scope.gradeId) {
    candidates.push({
      scopeType: AttendanceScopeType.GRADE,
      scopeKey: buildScopeKey(AttendanceScopeType.GRADE, scope),
    });
  }

  if (scope.stageId) {
    candidates.push({
      scopeType: AttendanceScopeType.STAGE,
      scopeKey: buildScopeKey(AttendanceScopeType.STAGE, scope),
    });
  }

  candidates.push({
    scopeType: AttendanceScopeType.SCHOOL,
    scopeKey: 'school',
  });

  return candidates;
}

export function policyMatchesEffectiveDate(
  policy: { effectiveFrom: Date | null; effectiveTo: Date | null },
  date?: Date,
): boolean {
  if (!date) return true;
  if (policy.effectiveFrom && policy.effectiveFrom > date) return false;
  if (policy.effectiveTo && policy.effectiveTo < date) return false;
  return true;
}

export function selectEffectivePolicy<
  T extends {
    scopeType: AttendanceScopeType;
    scopeKey: string;
    effectiveFrom: Date | null;
    effectiveTo: Date | null;
    updatedAt: Date;
  },
>(policies: T[], candidates: EffectiveScopeCandidate[], date?: Date): T | null {
  const candidateRank = new Map(
    candidates.map((candidate, index) => [
      `${candidate.scopeType}:${candidate.scopeKey}`,
      index,
    ]),
  );

  const matching = policies
    .filter((policy) => policyMatchesEffectiveDate(policy, date))
    .filter((policy) =>
      candidateRank.has(`${policy.scopeType}:${policy.scopeKey}`),
    );

  matching.sort((left, right) => {
    const leftRank =
      candidateRank.get(`${left.scopeType}:${left.scopeKey}`) ??
      scopePriority(left.scopeType);
    const rightRank =
      candidateRank.get(`${right.scopeType}:${right.scopeKey}`) ??
      scopePriority(right.scopeType);

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return right.updatedAt.getTime() - left.updatedAt.getTime();
  });

  return matching[0] ?? null;
}

export function validateEffectiveDateRange(
  effectiveFrom?: Date | null,
  effectiveTo?: Date | null,
): void {
  if (effectiveFrom && effectiveTo && effectiveFrom > effectiveTo) {
    throw new ValidationDomainException(
      'Policy effective start date must be before or equal to end date',
      {
        effectiveFrom: effectiveFrom.toISOString().slice(0, 10),
        effectiveTo: effectiveTo.toISOString().slice(0, 10),
      },
    );
  }
}

function requireScopeId(
  field: keyof AttendanceScopeIds,
  value: string | null | undefined,
  scopeType: AttendanceScopeType,
): string {
  if (!value) {
    throw new ValidationDomainException(
      `${scopeType} attendance policy scope requires ${field}`,
      { scopeType, field },
    );
  }

  return value;
}
