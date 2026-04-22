import { SetMetadata } from '@nestjs/common';

export const PLATFORM_SCOPE_METADATA = 'moazez:platform_scope';

/**
 * Marker decorator for services/methods that intentionally bypass the
 * Prisma schoolScope extension. Wrap the actual Prisma call with
 * platformBypassScope(...) and annotate the caller with @PlatformScope()
 * so code review can audit every cross-tenant read.
 */
export const PlatformScope = (): ClassDecorator & MethodDecorator =>
  SetMetadata(PLATFORM_SCOPE_METADATA, true) as ClassDecorator & MethodDecorator;
