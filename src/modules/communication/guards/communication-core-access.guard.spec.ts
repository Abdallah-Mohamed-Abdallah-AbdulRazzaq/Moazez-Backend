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
import { CommunicationCoreAccessGuard } from './communication-core-access.guard';

describe('CommunicationCoreAccessGuard', () => {
  const guard = new CommunicationCoreAccessGuard();

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

  it('fails closed when request context or actor is missing', () => {
    expect(() => guard.canActivate()).toThrow(TokenInvalidException);
    expect(() =>
      runWithRequestContext(createRequestContext(), () => guard.canActivate()),
    ).toThrow(TokenInvalidException);
  });

  it.each([
    ['blank', '   '],
    ['non-string', 42],
  ])('fails closed when actor id is %s', (_label, id) => {
    expect(() =>
      runWithRequestContext(createRequestContext(), () => {
        setActor({
          id,
          userType: UserType.SCHOOL_USER,
        } as unknown as RequestActor);
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

  it('uses canonical exceptions without policy-detail leakage', () => {
    for (const userType of [
      UserType.TEACHER,
      UserType.PARENT,
      UserType.STUDENT,
      UserType.APPLICANT,
    ]) {
      try {
        runWithRequestContext(createRequestContext(), () => {
          setActor({ id: `actor-${userType}`, userType });
          guard.canActivate();
        });
        throw new Error(`Expected guard to reject ${userType}`);
      } catch (error) {
        expect(error).toBeInstanceOf(ScopeMissingException);
        expect(error).toMatchObject({
          code: 'auth.scope.missing',
          httpStatus: HttpStatus.FORBIDDEN,
          details: undefined,
        });
      }
    }

    try {
      runWithRequestContext(createRequestContext(), () => guard.canActivate());
      throw new Error('Expected guard to reject a missing actor');
    } catch (error) {
      expect(error).toBeInstanceOf(TokenInvalidException);
      expect(error).toMatchObject({
        code: 'auth.token.invalid',
        httpStatus: HttpStatus.UNAUTHORIZED,
        details: undefined,
      });
    }
  });

  it('does not mutate the trusted request context', () => {
    const context = createRequestContext('communication-guard-request');
    const actor = {
      id: 'school-user-actor',
      userType: UserType.SCHOOL_USER,
    };
    context.actor = actor;

    runWithRequestContext(context, () => {
      expect(guard.canActivate()).toBe(true);
      expect(context.actor).toBe(actor);
      expect(context).toEqual({
        requestId: 'communication-guard-request',
        actor,
        bypass: {
          bypassSchoolScope: false,
          includeSoftDeleted: false,
        },
      });
    });
  });
});
