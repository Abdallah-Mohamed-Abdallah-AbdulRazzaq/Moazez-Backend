import {
  AttendanceMode,
  AttendanceScopeType,
  AttendanceSessionStatus,
  AttendanceStatus,
  DailyComputationStrategy,
} from '@prisma/client';

export interface DerivedDailyAbsenceEvidence {
  entryId: string;
  studentId: string;
  enrollmentId: string | null;
  status: AttendanceStatus;
  entryUpdatedAt: Date;
  sessionId: string;
  date: string;
  scopeType: AttendanceScopeType;
  scopeKey: string;
  stageId: string | null;
  gradeId: string | null;
  sectionId: string | null;
  classroomId: string | null;
  mode: AttendanceMode;
  periodId: string | null;
  periodKey: string;
  policyId: string | null;
  sessionStatus: AttendanceSessionStatus;
  sessionSubmittedAt: Date | null;
  sessionUpdatedAt: Date;
  policy: {
    id: string;
    dailyComputationStrategy: DailyComputationStrategy;
    selectedPeriodIds: string[];
    absentIfMissedPeriodsCount: number | null;
    updatedAt: Date;
  } | null;
}

export interface DerivedDailyAbsenceRow {
  date: string;
  studentId: string;
  scopeType: AttendanceScopeType;
  scopeKey: string;
  scopeIds: {
    stageId: string | null;
    gradeId: string | null;
    sectionId: string | null;
    classroomId: string | null;
  };
  policyId: string;
  missedPeriodCount: number;
  requiredMissedPeriodsCount: number;
  missedPeriodIds: string[];
  evidencePeriodCount: number;
  sourcePeriodIds: string[];
  derivedStatus: AttendanceStatus;
  source: DailyComputationStrategy;
  reportOnly: true;
}

type EvidenceGroup = {
  date: string;
  studentId: string;
  scopeType: AttendanceScopeType;
  scopeKey: string;
  scopeIds: DerivedDailyAbsenceRow['scopeIds'];
  policyId: string;
  requiredMissedPeriodsCount: number;
  evidenceByPeriodId: Map<string, DerivedDailyAbsenceEvidence>;
};

export function buildDerivedDailyAbsenceRows(
  evidence: DerivedDailyAbsenceEvidence[],
): DerivedDailyAbsenceRow[] {
  const groups = new Map<string, EvidenceGroup>();

  for (const item of evidence) {
    if (!isDerivableEvidence(item)) {
      continue;
    }

    const periodId = item.periodId;
    const policy = item.policy;
    if (!periodId || !policy || policy.absentIfMissedPeriodsCount === null) {
      continue;
    }

    const groupKey = [
      item.date,
      item.scopeType,
      item.scopeKey,
      policy.id,
      item.studentId,
    ].join('|');
    const group =
      groups.get(groupKey) ??
      createEvidenceGroup(item, policy.id, policy.absentIfMissedPeriodsCount);
    const existing = group.evidenceByPeriodId.get(periodId);

    if (!existing || compareEvidenceRecency(item, existing) > 0) {
      group.evidenceByPeriodId.set(periodId, item);
    }

    groups.set(groupKey, group);
  }

  return [...groups.values()]
    .flatMap((group) => buildRowForGroup(group))
    .sort(compareRows);
}

function isDerivableEvidence(evidence: DerivedDailyAbsenceEvidence): boolean {
  const policy = evidence.policy;
  if (!policy) return false;
  if (evidence.sessionStatus !== AttendanceSessionStatus.SUBMITTED) return false;
  if (evidence.mode !== AttendanceMode.PERIOD) return false;
  if (!evidence.periodId) return false;
  if (!evidence.policyId || evidence.policyId !== policy.id) return false;
  if (
    policy.dailyComputationStrategy !==
    DailyComputationStrategy.DERIVED_FROM_PERIODS
  ) {
    return false;
  }
  if (policy.selectedPeriodIds.length === 0) return false;
  if (policy.absentIfMissedPeriodsCount === null) return false;

  return policy.selectedPeriodIds.includes(evidence.periodId);
}

function createEvidenceGroup(
  evidence: DerivedDailyAbsenceEvidence,
  policyId: string,
  requiredMissedPeriodsCount: number,
): EvidenceGroup {
  return {
    date: evidence.date,
    studentId: evidence.studentId,
    scopeType: evidence.scopeType,
    scopeKey: evidence.scopeKey,
    scopeIds: {
      stageId: evidence.stageId,
      gradeId: evidence.gradeId,
      sectionId: evidence.sectionId,
      classroomId: evidence.classroomId,
    },
    policyId,
    requiredMissedPeriodsCount,
    evidenceByPeriodId: new Map(),
  };
}

function buildRowForGroup(group: EvidenceGroup): DerivedDailyAbsenceRow[] {
  const periodEvidence = [...group.evidenceByPeriodId.values()];
  const missedPeriodIds = periodEvidence
    .filter((evidence) => evidence.status === AttendanceStatus.ABSENT)
    .map((evidence) => evidence.periodId)
    .filter((periodId): periodId is string => Boolean(periodId))
    .sort();

  if (missedPeriodIds.length < group.requiredMissedPeriodsCount) {
    return [];
  }

  return [
    {
      date: group.date,
      studentId: group.studentId,
      scopeType: group.scopeType,
      scopeKey: group.scopeKey,
      scopeIds: group.scopeIds,
      policyId: group.policyId,
      missedPeriodCount: missedPeriodIds.length,
      requiredMissedPeriodsCount: group.requiredMissedPeriodsCount,
      missedPeriodIds,
      evidencePeriodCount: periodEvidence.length,
      sourcePeriodIds: periodEvidence
        .map((evidence) => evidence.periodId)
        .filter((periodId): periodId is string => Boolean(periodId))
        .sort(),
      derivedStatus: AttendanceStatus.ABSENT,
      source: DailyComputationStrategy.DERIVED_FROM_PERIODS,
      reportOnly: true,
    },
  ];
}

function compareEvidenceRecency(
  left: DerivedDailyAbsenceEvidence,
  right: DerivedDailyAbsenceEvidence,
): number {
  return (
    compareDates(left.entryUpdatedAt, right.entryUpdatedAt) ||
    compareNullableDates(left.sessionSubmittedAt, right.sessionSubmittedAt) ||
    compareDates(left.sessionUpdatedAt, right.sessionUpdatedAt) ||
    left.entryId.localeCompare(right.entryId) ||
    left.sessionId.localeCompare(right.sessionId)
  );
}

function compareDates(left: Date, right: Date): number {
  return left.getTime() - right.getTime();
}

function compareNullableDates(left: Date | null, right: Date | null): number {
  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;
  return compareDates(left, right);
}

function compareRows(
  left: DerivedDailyAbsenceRow,
  right: DerivedDailyAbsenceRow,
): number {
  return (
    left.date.localeCompare(right.date) ||
    left.scopeType.localeCompare(right.scopeType) ||
    left.scopeKey.localeCompare(right.scopeKey) ||
    left.studentId.localeCompare(right.studentId) ||
    left.policyId.localeCompare(right.policyId)
  );
}
