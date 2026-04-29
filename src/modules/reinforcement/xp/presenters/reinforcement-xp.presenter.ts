import { XpSourceType } from '@prisma/client';
import {
  XpLedgerResponseDto,
  XpPolicyResponseDto,
} from '../dto/reinforcement-xp.dto';
import { XpResolvedScope } from '../domain/reinforcement-xp-domain';
import type {
  XpLedgerRecord,
  XpPolicyRecord,
} from '../infrastructure/reinforcement-xp.repository';

export function presentXpPolicy(
  policy: XpPolicyRecord,
  options?: { isDefault?: boolean },
): XpPolicyResponseDto {
  return {
    id: policy.id,
    academicYearId: policy.academicYearId,
    termId: policy.termId,
    scopeType: presentEnum(policy.scopeType),
    scopeKey: policy.scopeKey,
    dailyCap: policy.dailyCap,
    weeklyCap: policy.weeklyCap,
    cooldownMinutes: policy.cooldownMinutes,
    allowedReasons: policy.allowedReasons ?? null,
    startsAt: presentNullableDate(policy.startsAt),
    endsAt: presentNullableDate(policy.endsAt),
    isActive: policy.isActive,
    isDefault: options?.isDefault ?? false,
    createdAt: policy.createdAt.toISOString(),
    updatedAt: policy.updatedAt.toISOString(),
  };
}

export function presentDefaultXpPolicy(params: {
  academicYearId: string;
  termId: string;
  scope: XpResolvedScope;
}): XpPolicyResponseDto {
  return {
    id: null,
    academicYearId: params.academicYearId,
    termId: params.termId,
    scopeType: presentEnum(params.scope.scopeType),
    scopeKey: params.scope.scopeKey,
    dailyCap: null,
    weeklyCap: null,
    cooldownMinutes: null,
    allowedReasons: null,
    startsAt: null,
    endsAt: null,
    isActive: true,
    isDefault: true,
    createdAt: null,
    updatedAt: null,
  };
}

export function presentXpPolicies(policies: XpPolicyRecord[]): {
  items: XpPolicyResponseDto[];
} {
  return {
    items: policies.map((policy) => presentXpPolicy(policy)),
  };
}

export function presentXpLedgerEntry(
  ledger: XpLedgerRecord,
): XpLedgerResponseDto {
  return {
    id: ledger.id,
    academicYearId: ledger.academicYearId,
    termId: ledger.termId,
    studentId: ledger.studentId,
    enrollmentId: ledger.enrollmentId,
    assignmentId: ledger.assignmentId,
    policyId: ledger.policyId,
    sourceType: presentEnum(ledger.sourceType),
    sourceId: ledger.sourceId,
    amount: ledger.amount,
    reason: ledger.reason,
    reasonAr: ledger.reasonAr,
    actorUserId: ledger.actorUserId,
    occurredAt: ledger.occurredAt.toISOString(),
    student: presentLedgerStudent(ledger),
    createdAt: ledger.createdAt.toISOString(),
  };
}

export function presentXpLedger(params: {
  items: XpLedgerRecord[];
  total: number;
  limit?: number | null;
  offset?: number | null;
}) {
  return {
    items: params.items.map((entry) => presentXpLedgerEntry(entry)),
    total: params.total,
    limit: params.limit ?? null,
    offset: params.offset ?? null,
  };
}

export function presentXpSummary(params: {
  academicYearId: string;
  termId: string;
  scope: XpResolvedScope;
  summary: {
    totalXp: number;
    studentsCount: number;
    averageXp: number;
    bySourceType: Array<{ sourceType: string; amount: number }>;
    topStudents: Array<{
      studentId: string;
      studentName: string | null;
      totalXp: number;
    }>;
  };
}) {
  return {
    academicYearId: params.academicYearId,
    termId: params.termId,
    scope: {
      scopeType: presentEnum(params.scope.scopeType),
      scopeKey: params.scope.scopeKey,
      stageId: params.scope.stageId,
      gradeId: params.scope.gradeId,
      sectionId: params.scope.sectionId,
      classroomId: params.scope.classroomId,
      studentId: params.scope.studentId,
    },
    totalXp: params.summary.totalXp,
    studentsCount: params.summary.studentsCount,
    averageXp: Number(params.summary.averageXp.toFixed(2)),
    bySourceType: params.summary.bySourceType,
    topStudents: params.summary.topStudents,
  };
}

export function presentEnum(value: string): string {
  return value.toLowerCase();
}

export function presentSourceType(sourceType: XpSourceType): string {
  return presentEnum(sourceType);
}

function presentLedgerStudent(ledger: XpLedgerRecord) {
  if (!ledger.student) return null;

  const classroom = ledger.enrollment?.classroom ?? null;
  const section = classroom?.section ?? null;
  const grade = section?.grade ?? null;
  const stage = grade?.stage ?? null;

  return {
    id: ledger.student.id,
    firstName: ledger.student.firstName,
    lastName: ledger.student.lastName,
    name: `${ledger.student.firstName} ${ledger.student.lastName}`.trim(),
    enrollmentId: ledger.enrollmentId,
    classroomId: classroom?.id ?? null,
    classroomName: classroom
      ? deriveName(classroom.nameAr, classroom.nameEn)
      : null,
    sectionId: section?.id ?? null,
    sectionName: section ? deriveName(section.nameAr, section.nameEn) : null,
    gradeId: grade?.id ?? null,
    gradeName: grade ? deriveName(grade.nameAr, grade.nameEn) : null,
    stageId: stage?.id ?? null,
    stageName: stage ? deriveName(stage.nameAr, stage.nameEn) : null,
  };
}

function deriveName(nameAr: string, nameEn: string): string {
  return nameEn.trim().length > 0 ? nameEn : nameAr;
}

function presentNullableDate(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}
