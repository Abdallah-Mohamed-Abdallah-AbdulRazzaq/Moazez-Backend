import {
  AttendancePoliciesListResponseDto,
  AttendancePolicyResponseDto,
  AttendancePolicyScopeIdsResponseDto,
} from '../dto/attendance-policy.dto';
import { AttendancePolicyRecord } from '../infrastructure/attendance-policies.repository';

function formatDateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function presentScopeIds(
  policy: AttendancePolicyRecord,
): AttendancePolicyScopeIdsResponseDto | null {
  if (policy.scopeKey === 'school') {
    return null;
  }

  return {
    stageId: policy.stageId,
    gradeId: policy.gradeId,
    sectionId: policy.sectionId,
    classroomId: policy.classroomId,
  };
}

export function presentAttendancePolicy(
  policy: AttendancePolicyRecord,
): AttendancePolicyResponseDto {
  const effectiveFrom = formatDateOnly(policy.effectiveFrom);
  const effectiveTo = formatDateOnly(policy.effectiveTo);

  return {
    id: policy.id,
    academicYearId: policy.academicYearId,
    yearId: policy.academicYearId,
    termId: policy.termId,
    nameAr: policy.nameAr,
    nameEn: policy.nameEn,
    descriptionAr: policy.descriptionAr,
    descriptionEn: policy.descriptionEn,
    notes: policy.notes,
    scopeType: policy.scopeType,
    scopeKey: policy.scopeKey,
    scopeIds: presentScopeIds(policy),
    mode: policy.mode,
    dailyComputationStrategy: policy.dailyComputationStrategy,
    selectedPeriodIds: [],
    lateThresholdMinutes: null,
    earlyLeaveThresholdMinutes: null,
    autoAbsentAfterMinutes: null,
    absentIfMissedPeriodsCount: null,
    requireExcuseAttachment: policy.requireExcuseAttachment,
    requireAttachmentForExcuse: policy.requireExcuseAttachment,
    requireExcuseReason: false,
    allowParentExcuseRequests: policy.allowParentExcuseRequests,
    allowExcuses: policy.allowParentExcuseRequests,
    notifyGuardiansOnAbsence: policy.notifyGuardiansOnAbsence,
    notifyTeachers: false,
    notifyStudents: false,
    notifyGuardians: policy.notifyGuardiansOnAbsence,
    notifyOnAbsent: policy.notifyGuardiansOnAbsence,
    notifyOnLate: false,
    notifyOnEarlyLeave: false,
    effectiveFrom,
    effectiveTo,
    effectiveStartDate: effectiveFrom,
    effectiveEndDate: effectiveTo,
    isActive: policy.isActive,
    createdAt: policy.createdAt.toISOString(),
    updatedAt: policy.updatedAt.toISOString(),
  };
}

export function presentAttendancePolicies(
  policies: AttendancePolicyRecord[],
): AttendancePoliciesListResponseDto {
  return {
    items: policies.map((policy) => presentAttendancePolicy(policy)),
  };
}
