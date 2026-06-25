import { AttendanceMode } from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';

export interface EffectivePolicyPeriodSelection {
  id: string;
  selectedPeriodIds: string[];
}

export function normalizeRollCallPeriodId(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function assertPeriodAllowedByEffectivePolicyForNewSession(params: {
  mode: AttendanceMode;
  periodId?: string | null;
  effectivePolicy: EffectivePolicyPeriodSelection | null;
}): void {
  if (params.mode !== AttendanceMode.PERIOD || !params.effectivePolicy) {
    return;
  }

  const selectedPeriodIds = normalizeSelectedPeriodIds(
    params.effectivePolicy.selectedPeriodIds,
  );
  if (selectedPeriodIds.length === 0) {
    return;
  }

  const periodId = normalizeRollCallPeriodId(params.periodId);
  if (!periodId) {
    throw new ValidationDomainException(
      'Period attendance sessions require periodId when the effective policy selects periods',
      {
        field: 'periodId',
        mode: params.mode,
        policyId: params.effectivePolicy.id,
      },
    );
  }

  if (!selectedPeriodIds.includes(periodId)) {
    throw new ValidationDomainException(
      'Period is not allowed by the effective attendance policy',
      {
        field: 'periodId',
        mode: params.mode,
        policyId: params.effectivePolicy.id,
        periodId,
      },
    );
  }
}

function normalizeSelectedPeriodIds(selectedPeriodIds: string[]): string[] {
  return selectedPeriodIds
    .map((periodId) => periodId.trim())
    .filter((periodId) => periodId.length > 0);
}
