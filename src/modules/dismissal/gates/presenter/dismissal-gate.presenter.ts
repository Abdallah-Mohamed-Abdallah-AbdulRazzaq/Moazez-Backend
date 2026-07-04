import { DismissalGateResponseDto } from '../dto/dismissal-gate.dto';
import { DismissalGateRecord } from '../infrastructure/dismissal-gates.repository';
import { presentGateStatus } from '../../shared/dismissal.types';

function toNumber(value: { toNumber(): number } | null | undefined): number | null {
  return value ? value.toNumber() : null;
}

export function presentDismissalGate(
  gate: DismissalGateRecord,
): DismissalGateResponseDto {
  return {
    id: gate.id,
    code: gate.code,
    name: gate.name,
    campus: gate.campus ?? null,
    status: presentGateStatus(gate.status),
    isActive: gate.isActive,
    sortOrder: gate.sortOrder,
    location: {
      latitude: toNumber(gate.latitude),
      longitude: toNumber(gate.longitude),
    },
    waitingZones: gate.waitingZones,
    notes: gate.notes ?? null,
    createdAt: gate.createdAt.toISOString(),
    updatedAt: gate.updatedAt.toISOString(),
  };
}
