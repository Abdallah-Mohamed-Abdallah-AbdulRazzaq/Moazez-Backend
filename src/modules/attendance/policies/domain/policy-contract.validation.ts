import { DailyComputationStrategy } from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';

export interface AttendancePolicyAdvancedContractConfig {
  dailyComputationStrategy: DailyComputationStrategy;
  selectedPeriodIds: string[];
  lateThresholdMinutes: number | null;
  earlyLeaveThresholdMinutes: number | null;
  autoAbsentAfterMinutes: number | null;
  absentIfMissedPeriodsCount: number | null;
}

export function normalizeSelectedPeriodIds(
  value: string[] | null | undefined,
): string[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new ValidationDomainException(
      'Attendance policy selected periods must be an array',
      { field: 'selectedPeriodIds' },
    );
  }

  const selectedPeriodIds = value.map((periodId, index) => {
    if (typeof periodId !== 'string') {
      throw new ValidationDomainException(
        'Attendance policy selected period ids must be strings',
        { field: 'selectedPeriodIds', index },
      );
    }

    const trimmed = periodId.trim();
    if (trimmed.length === 0) {
      throw new ValidationDomainException(
        'Attendance policy selected period ids must not be empty',
        { field: 'selectedPeriodIds', index },
      );
    }

    return trimmed;
  });

  const uniquePeriodIds = new Set(selectedPeriodIds);
  if (uniquePeriodIds.size !== selectedPeriodIds.length) {
    throw new ValidationDomainException(
      'Attendance policy selected period ids must not include duplicates',
      { field: 'selectedPeriodIds' },
    );
  }

  return selectedPeriodIds;
}

export function normalizeNullableNonNegativeInteger(
  field: string,
  value: number | null | undefined,
): number | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new ValidationDomainException(
      'Attendance policy numeric settings must be non-negative integers',
      { field },
    );
  }

  return value;
}

export function validateAdvancedPolicyContractConfig(
  config: AttendancePolicyAdvancedContractConfig,
): void {
  if (
    config.dailyComputationStrategy !==
    DailyComputationStrategy.DERIVED_FROM_PERIODS
  ) {
    return;
  }

  const missingFields: string[] = [];
  if (config.selectedPeriodIds.length === 0) {
    missingFields.push('selectedPeriodIds');
  }
  if (config.absentIfMissedPeriodsCount === null) {
    missingFields.push('absentIfMissedPeriodsCount');
  }

  if (missingFields.length > 0) {
    throw new ValidationDomainException(
      'Derived period attendance policies require selected periods and missed period count',
      { fields: missingFields },
    );
  }
}
