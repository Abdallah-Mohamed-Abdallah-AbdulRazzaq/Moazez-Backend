import { randomUUID } from 'node:crypto';
import { UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import {
  ApproveAcademicContentUseCase,
  RequestAcademicContentChangesUseCase,
  SubmitAcademicContentUseCase,
} from '../application/academic-content-workflow.use-cases';
import { AcademicContentWorkflowRepository } from '../infrastructure/academic-content-workflow.repository';

describe('ACC-6B workflow application boundary', () => {
  const contentId = randomUUID();
  const schoolId = randomUUID();
  const organizationId = randomUUID();
  const actorId = randomUUID();
  const repository = {
    submit: jest.fn().mockResolvedValue({}),
    decide: jest.fn().mockResolvedValue({}),
  };
  const submit = new SubmitAcademicContentUseCase(
    repository as unknown as AcademicContentWorkflowRepository,
  );
  const approve = new ApproveAcademicContentUseCase(
    repository as unknown as AcademicContentWorkflowRepository,
  );
  const request = new RequestAcademicContentChangesUseCase(
    repository as unknown as AcademicContentWorkflowRepository,
  );

  function asActor<T>(
    permissions: string[],
    action: () => T,
    userType = UserType.SCHOOL_USER,
  ): T {
    return runWithRequestContext(createRequestContext(), () => {
      setActor({ id: actorId, userType });
      setActiveMembership({
        membershipId: randomUUID(),
        schoolId,
        organizationId,
        roleId: randomUUID(),
        permissions,
      });
      return action();
    });
  }

  beforeEach(() => jest.clearAllMocks());

  it('requires manage for submit and approve for decisions, including app actor rejection', async () => {
    expect(() =>
      asActor(['academics.academic_content.view'], () =>
        submit.execute(contentId),
      ),
    ).toThrow();
    expect(() =>
      asActor(['academics.academic_content.manage'], () =>
        approve.execute(contentId),
      ),
    ).toThrow();
    expect(() =>
      asActor(['academics.academic_content.approve'], () =>
        submit.execute(contentId),
      ),
    ).toThrow();
    expect(() =>
      asActor(['academics.academic_content.settings.manage'], () =>
        request.execute(contentId, { note: 'Fix' }),
      ),
    ).toThrow();
    expect(() =>
      asActor(
        ['academics.academic_content.approve'],
        () => approve.execute(contentId),
        UserType.TEACHER,
      ),
    ).toThrow();
    await asActor(['academics.academic_content.manage'], () =>
      submit.execute(contentId),
    );
    await asActor(['academics.academic_content.approve'], () =>
      approve.execute(contentId),
    );
    expect(repository.submit).toHaveBeenCalledTimes(1);
    expect(repository.decide).toHaveBeenCalledWith({
      contentId,
      schoolId,
      organizationId,
      actorId,
      decision: 'approve',
      note: null,
    });
  });

  it('rejects approve mutation fields and malformed request-changes notes', async () => {
    expect(() =>
      asActor(['academics.academic_content.approve'], () =>
        approve.execute(contentId, { note: 'Invented' }),
      ),
    ).toThrow();
    for (const body of [
      null,
      {},
      { note: null },
      { note: 4 },
      { note: '' },
      { note: '  ' },
      { note: 'x'.repeat(4001) },
      { note: 'Fix', status: 'APPROVED' },
    ])
      expect(() =>
        asActor(['academics.academic_content.approve'], () =>
          request.execute(contentId, body),
        ),
      ).toThrow();
    expect(repository.decide).not.toHaveBeenCalled();
    await asActor(['academics.academic_content.approve'], () =>
      request.execute(contentId, { note: '  Fix topic  ' }),
    );
    expect(repository.decide).toHaveBeenCalledWith({
      contentId,
      schoolId,
      organizationId,
      actorId,
      decision: 'request-changes',
      note: 'Fix topic',
    });
    await asActor(['academics.academic_content.approve'], () =>
      request.execute(contentId, { note: `  ${'x'.repeat(4000)}  ` }),
    );
    expect(repository.decide).toHaveBeenLastCalledWith({
      contentId,
      schoolId,
      organizationId,
      actorId,
      decision: 'request-changes',
      note: 'x'.repeat(4000),
    });
  });
});
