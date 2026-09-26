import { UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../../common/context/request-context';
import { AcademicContentTypeDetailUseCases } from '../application/academic-content-type-detail.use-cases';
import {
  AcademicContentTypeDetailUnitOfWork,
  TypeDetailMutation,
} from '../application/academic-content-type-detail.unit-of-work';

describe('ACC-5B application authorization', () => {
  const mutate = jest.fn().mockResolvedValue({ changed: true, state: {} });
  const useCases = new AcademicContentTypeDetailUseCases({
    mutate,
  } as AcademicContentTypeDetailUnitOfWork);
  const command = {
    objectives: [],
    learningOutcomes: [],
    teachingStrategies: [],
    activities: [],
  };
  const id = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => mutate.mockClear());

  it('rejects missing context, missing permission, and teacher actor', () => {
    expect(() => useCases.replacePreparation(id, command)).toThrow(
      'Academic content management scope is required',
    );
    for (const [userType, permissions] of [
      [UserType.SCHOOL_USER, []],
      [UserType.TEACHER, ['academics.academic_content.manage']],
    ] as const) {
      const context = createRequestContext();
      context.actor = { id, userType };
      context.activeMembership = {
        membershipId: id,
        schoolId: id,
        organizationId: id,
        roleId: id,
        permissions: [...permissions],
      };
      runWithRequestContext(context, () =>
        expect(() => useCases.replacePreparation(id, command)).toThrow(
          'Academic content management scope is required',
        ),
      );
    }
    expect(mutate).not.toHaveBeenCalled();
  });

  it('passes a normalized typed mutation with the active school and actor', async () => {
    const context = createRequestContext();
    context.actor = { id, userType: UserType.SCHOOL_USER };
    context.activeMembership = {
      membershipId: id,
      schoolId: id,
      organizationId: id,
      roleId: id,
      permissions: ['academics.academic_content.manage'],
    };
    await runWithRequestContext(context, () =>
      useCases.replacePreparation(id, { ...command, topic: '  Topic  ' }),
    );
    const call = (
      mutate.mock.calls as unknown as TypeDetailMutation[][]
    )[0]?.[0];
    expect(call?.contentId).toBe(id);
    expect(call?.schoolId).toBe(id);
    expect(call?.actorId).toBe(id);
    expect(call?.detail.type).toBe('TEACHER_PREPARATION');
    if (call?.detail.type === 'TEACHER_PREPARATION')
      expect(call.detail.state.topic).toBe('Topic');
  });
});
