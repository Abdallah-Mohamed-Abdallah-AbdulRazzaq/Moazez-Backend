import type { ExecutionContext } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActor,
} from '../context/request-context';
import { PUBLIC_ROUTE_METADATA } from '../decorators/public-route.decorator';
import { REQUIRED_PERMISSIONS_METADATA } from '../decorators/required-permissions.decorator';
import { SCHOOL_MANAGEMENT_ONLY_METADATA } from '../decorators/school-management-only.decorator';
import { ScopeMissingException } from '../../modules/iam/auth/domain/auth.exceptions';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard school-management boundary', () => {
  const executionContext = {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;

  it('permits only organization and school users on marked controllers', () => {
    const guard = createGuard({ schoolManagementOnly: true });

    for (const userType of Object.values(UserType)) {
      const evaluate = () =>
        runWithRequestContext(createRequestContext(), () => {
          setActor({ id: `actor-${userType}`, userType });
          return guard.canActivate(executionContext);
        });

      if (
        userType === UserType.ORGANIZATION_USER ||
        userType === UserType.SCHOOL_USER
      ) {
        expect(evaluate()).toBe(true);
      } else {
        expect(evaluate).toThrow(ScopeMissingException);
      }
    }
  });

  it('does not change unmarked app-facing controller behavior', () => {
    const guard = createGuard({ schoolManagementOnly: false });

    expect(
      runWithRequestContext(createRequestContext(), () => {
        setActor({ id: 'teacher-actor', userType: UserType.TEACHER });
        return guard.canActivate(executionContext);
      }),
    ).toBe(true);
  });

  it('keeps required permission enforcement after the actor boundary', () => {
    const guard = createGuard({
      schoolManagementOnly: true,
      requiredPermissions: ['academics.calendar.view'],
    });

    expect(() =>
      runWithRequestContext(createRequestContext(), () => {
        setActor({ id: 'school-actor', userType: UserType.SCHOOL_USER });
        return guard.canActivate(executionContext);
      }),
    ).toThrow(ScopeMissingException);
  });

  it('uses the canonical safe forbidden contract', () => {
    const guard = createGuard({ schoolManagementOnly: true });

    try {
      runWithRequestContext(createRequestContext(), () => {
        setActor({ id: 'parent-actor', userType: UserType.PARENT });
        guard.canActivate(executionContext);
      });
      throw new Error('Expected the marked core controller to be rejected');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'auth.scope.missing',
        httpStatus: HttpStatus.FORBIDDEN,
        details: undefined,
      });
    }
  });
});

function createGuard(options: {
  schoolManagementOnly: boolean;
  requiredPermissions?: string[];
}): PermissionsGuard {
  const reflector = {
    getAllAndOverride: jest.fn((metadataKey: string) => {
      if (metadataKey === PUBLIC_ROUTE_METADATA) return false;
      if (metadataKey === SCHOOL_MANAGEMENT_ONLY_METADATA) {
        return options.schoolManagementOnly;
      }
      if (metadataKey === REQUIRED_PERMISSIONS_METADATA) {
        return options.requiredPermissions;
      }
      return undefined;
    }),
  } as unknown as Reflector;

  return new PermissionsGuard(reflector);
}
