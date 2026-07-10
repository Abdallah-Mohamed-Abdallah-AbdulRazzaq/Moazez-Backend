import { HttpStatus } from '@nestjs/common';
import { UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActor,
  type RequestActor,
} from '../../../common/context/request-context';
import {
  ScopeMissingException,
  TokenInvalidException,
} from '../../iam/auth/domain/auth.exceptions';
import { HomeworkCoreAccessGuard } from './homework-core-access.guard';

describe('HomeworkCoreAccessGuard', () => {
  const guard = new HomeworkCoreAccessGuard();

  it('permits exactly school and organization users', () => {
    const allowed = new Set<UserType>([
      UserType.SCHOOL_USER,
      UserType.ORGANIZATION_USER,
    ]);

    for (const userType of Object.values(UserType)) {
      const evaluate = () =>
        runWithRequestContext(createRequestContext(), () => {
          setActor({ id: `actor-${userType}`, userType });
          return guard.canActivate();
        });

      if (allowed.has(userType)) {
        expect(evaluate()).toBe(true);
      } else {
        expect(evaluate).toThrow(ScopeMissingException);
      }
    }
  });

  it('fails closed when the authenticated actor is missing', () => {
    expect(() => guard.canActivate()).toThrow(TokenInvalidException);
    expect(() =>
      runWithRequestContext(createRequestContext(), () => guard.canActivate()),
    ).toThrow(TokenInvalidException);
  });

  it('fails closed when actor identity is malformed', () => {
    expect(() =>
      runWithRequestContext(createRequestContext(), () => {
        setActor({
          id: '   ',
          userType: UserType.SCHOOL_USER,
        });
        return guard.canActivate();
      }),
    ).toThrow(TokenInvalidException);
  });

  it.each([
    ['missing', undefined],
    ['unknown', 'UNKNOWN_ACTOR'],
  ])('fails closed when user type is %s', (_label, userType) => {
    expect(() =>
      runWithRequestContext(createRequestContext(), () => {
        setActor({
          id: 'actor-with-invalid-user-type',
          userType,
        } as unknown as RequestActor);
        return guard.canActivate();
      }),
    ).toThrow(ScopeMissingException);
  });

  it('uses the canonical forbidden contract without policy details', () => {
    try {
      runWithRequestContext(createRequestContext(), () => {
        setActor({ id: 'teacher-actor', userType: UserType.TEACHER });
        guard.canActivate();
      });
      throw new Error('Expected HomeworkCoreAccessGuard to reject TEACHER');
    } catch (error) {
      expect(error).toBeInstanceOf(ScopeMissingException);
      expect(error).toMatchObject({
        code: 'auth.scope.missing',
        httpStatus: HttpStatus.FORBIDDEN,
        details: undefined,
      });
    }
  });

  it('does not mutate the trusted request context', () => {
    const context = createRequestContext('homework-guard-request');
    const actor = {
      id: 'school-user-actor',
      userType: UserType.SCHOOL_USER,
    };
    context.actor = actor;

    runWithRequestContext(context, () => {
      expect(guard.canActivate()).toBe(true);
      expect(context.actor).toBe(actor);
      expect(context).toEqual({
        requestId: 'homework-guard-request',
        actor,
        bypass: {
          bypassSchoolScope: false,
          includeSoftDeleted: false,
        },
      });
    });
  });
});
