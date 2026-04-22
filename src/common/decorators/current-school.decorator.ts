import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { getRequestContext } from '../context/request-context';

/**
 * Resolves the active school id from the request-scoped context. Returns null
 * when the caller has no school-bound membership (e.g. PLATFORM_USER).
 */
export const CurrentSchool = createParamDecorator(
  (_data: unknown, _ctx: ExecutionContext): string | null | undefined =>
    getRequestContext()?.activeMembership?.schoolId,
);
