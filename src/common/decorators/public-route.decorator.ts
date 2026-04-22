import { SetMetadata } from '@nestjs/common';

export const PUBLIC_ROUTE_METADATA = 'moazez:public_route';

/**
 * Marks a controller handler as publicly accessible (no auth required).
 * The global JwtAuthGuard introduced in Day 8 checks this metadata and
 * skips token verification for annotated handlers.
 */
export const PublicRoute = (): MethodDecorator & ClassDecorator =>
  SetMetadata(PUBLIC_ROUTE_METADATA, true) as MethodDecorator & ClassDecorator;
