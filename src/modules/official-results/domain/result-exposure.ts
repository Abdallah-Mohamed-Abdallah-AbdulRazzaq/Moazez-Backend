import { CanActivate, Injectable } from '@nestjs/common';
import { z } from 'zod/v4';
import { getRequestContext } from '../../../common/context/request-context';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';

const uuid = z.uuid();

// Undefined means all schools. An empty array freezes exposure and pending work.
export function officialResultsPilotSchools(): string[] | undefined {
  const enabled = process.env.OFFICIAL_RESULTS_ENABLED;
  const allowlist = process.env.OFFICIAL_RESULTS_SCHOOL_ALLOWLIST?.trim();
  const privateRuntime = !['production', 'staging'].includes(
    process.env.NODE_ENV ?? 'development',
  );
  if (enabled === 'false' || (enabled !== undefined && enabled !== 'true'))
    return [];
  if (enabled === undefined && !privateRuntime) return [];
  if (!allowlist) return privateRuntime ? undefined : [];
  if (allowlist === '*') return undefined;
  const ids = allowlist.split(',').map((value) => value.trim().toLowerCase());
  if (ids.some((id) => !uuid.safeParse(id).success)) return [];
  return [...new Set(ids)];
}

export function officialResultsExposed(schoolId: string) {
  const allowed = officialResultsPilotSchools();
  return allowed === undefined || allowed.includes(schoolId.toLowerCase());
}

export function officialResultsPilotWhere() {
  const schools = officialResultsPilotSchools();
  return schools ? { schoolId: { in: schools } } : {};
}

@Injectable()
export class ResultExposureGuard implements CanActivate {
  canActivate() {
    const schoolId = getRequestContext()?.activeMembership?.schoolId;
    if (!schoolId || !officialResultsExposed(schoolId))
      throw new NotFoundDomainException();
    return true;
  }
}
