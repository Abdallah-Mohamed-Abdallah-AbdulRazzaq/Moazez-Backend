import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import {
  getRequestContext,
  RequestActor,
} from '../context/request-context';

/**
 * Resolves the authenticated actor from the request-scoped context populated
 * by JwtAuthGuard. Returns undefined on public routes.
 */
export const CurrentActor = createParamDecorator(
  (_data: unknown, _ctx: ExecutionContext): RequestActor | undefined =>
    getRequestContext()?.actor,
);
