import type { TeacherAllocationLifecycleSummary } from '../../../academics/teacher-allocation/domain/teacher-allocation-lifecycle-state';
import type { TeacherDirectoryDetailDto } from '../../../teachers/directory/dto/teacher-directory.dto';

export interface OrganizationTeacherTransferResponse {
  teacher: TeacherDirectoryDetailDto;
  transfer: {
    sourceArchived: true;
    effectiveAt: string;
    revokedSessionCount: number;
    reassignmentRequired: boolean;
    integrityReviewRequired: boolean;
    allocationSummary: {
      currentActiveCount: number;
      futureCount: number;
      historicalCount: number;
      currentInactiveCount: number;
      inconsistentCount: number;
      invalidCount: number;
      integrityRiskCount: number;
      integrityReason: string;
    };
  };
}

export function presentOrganizationTeacherTransfer(input: {
  teacher: TeacherDirectoryDetailDto;
  lifecycleAt: Date;
  revokedSessionCount: number;
  allocation: TeacherAllocationLifecycleSummary;
}): OrganizationTeacherTransferResponse {
  return {
    teacher: input.teacher,
    transfer: {
      sourceArchived: true,
      effectiveAt: input.lifecycleAt.toISOString(),
      revokedSessionCount: input.revokedSessionCount,
      reassignmentRequired: input.allocation.reassignmentRequired,
      integrityReviewRequired: input.allocation.integrityRiskCount > 0,
      allocationSummary: {
        currentActiveCount: input.allocation.currentActiveCount,
        futureCount: input.allocation.futureCount,
        historicalCount: input.allocation.historicalCount,
        currentInactiveCount: input.allocation.currentInactiveCount,
        inconsistentCount: input.allocation.inconsistentCount,
        invalidCount: input.allocation.invalidCount,
        integrityRiskCount: input.allocation.integrityRiskCount,
        integrityReason: input.allocation.integrityReason,
      },
    },
  };
}
