import { CanActivate, Injectable, mixin, type Type } from '@nestjs/common';
import type { UserType } from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';

/** Narrows route surfaces; never grants a permission or substitutes resource access. */
export function answerMediaSurfaceGuard(
  ...types: UserType[]
): Type<CanActivate> {
  @Injectable()
  class SurfaceGuard implements CanActivate {
    canActivate(): boolean {
      const actor = getRequestContext()?.actor;
      if (!actor || !types.includes(actor.userType))
        throw new NotFoundDomainException();
      return true;
    }
  }
  return mixin(SurfaceGuard);
}
