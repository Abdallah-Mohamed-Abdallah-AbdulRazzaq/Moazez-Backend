import { CanActivate, Injectable } from '@nestjs/common';
import { UserType } from '@prisma/client';
import { getRequestContext } from '../../../common/context/request-context';
import {
  ScopeMissingException,
  TokenInvalidException,
} from '../../iam/auth/domain/auth.exceptions';

const HOMEWORK_CORE_USER_TYPES = new Set<UserType>([
  UserType.ORGANIZATION_USER,
  UserType.SCHOOL_USER,
]);

/** Keeps dashboard/core Homework routes separate from app-facing adapters. */
@Injectable()
export class HomeworkCoreAccessGuard implements CanActivate {
  canActivate(): boolean {
    const actor = getRequestContext()?.actor;
    if (
      !actor ||
      typeof actor !== 'object' ||
      typeof actor.id !== 'string' ||
      actor.id.trim().length === 0
    ) {
      throw new TokenInvalidException();
    }

    if (
      typeof actor.userType !== 'string' ||
      !HOMEWORK_CORE_USER_TYPES.has(actor.userType)
    ) {
      throw new ScopeMissingException();
    }

    return true;
  }
}
