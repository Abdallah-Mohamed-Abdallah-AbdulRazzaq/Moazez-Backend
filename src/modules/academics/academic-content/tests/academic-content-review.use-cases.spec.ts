import { randomUUID } from 'node:crypto';
import { UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import {
  ListAcademicContentApprovalHistoryUseCase,
  ListAcademicContentReviewQueueUseCase,
} from '../application/academic-content-review.use-cases';
import { AcademicContentReviewRepository } from '../infrastructure/academic-content-review.repository';

describe('ACC-6C review read application boundary', () => {
  const schoolId = randomUUID();
  const contentId = randomUUID();
  const repository = {
    queue: jest
      .fn()
      .mockResolvedValue({ items: [], page: 1, limit: 50, total: 0 }),
    history: jest
      .fn()
      .mockResolvedValue({ items: [], page: 1, limit: 50, total: 0 }),
  };
  const queue = new ListAcademicContentReviewQueueUseCase(
    repository as unknown as AcademicContentReviewRepository,
  );
  const history = new ListAcademicContentApprovalHistoryUseCase(
    repository as unknown as AcademicContentReviewRepository,
  );

  function asActor<T>(
    permissions: string[],
    action: () => T,
    userType = UserType.SCHOOL_USER,
  ): T {
    return runWithRequestContext(createRequestContext(), () => {
      setActor({ id: randomUUID(), userType });
      setActiveMembership({
        membershipId: randomUUID(),
        schoolId,
        organizationId: randomUUID(),
        roleId: randomUUID(),
        permissions,
      });
      return action();
    });
  }

  beforeEach(() => jest.clearAllMocks());

  it('normalizes bounded search and applies default and explicit pagination', async () => {
    await asActor(['academics.academic_content.approve'], () =>
      queue.execute({ search: '  ＡＬＧＥＢＲＡ  ', page: 2, limit: 10 }),
    );
    expect(repository.queue).toHaveBeenCalledWith(schoolId, {
      search: 'ALGEBRA',
      page: 2,
      limit: 10,
    });
    await asActor(['academics.academic_content.view'], () =>
      history.execute(contentId, {}),
    );
    expect(repository.history).toHaveBeenCalledWith({
      schoolId,
      contentId,
      page: 1,
      limit: 50,
    });
    await asActor(['academics.academic_content.approve'], () =>
      queue.execute({ search: '  ' }),
    );
    expect(repository.queue).toHaveBeenLastCalledWith(schoolId, {
      search: '',
      page: 1,
      limit: 50,
    });
  });

  it('rejects normalized overlong search and unsafe offsets before querying', () => {
    expect(() =>
      asActor(['academics.academic_content.approve'], () =>
        queue.execute({ search: 'a'.repeat(121) }),
      ),
    ).toThrow();
    for (const query of [
      { page: 0 },
      { page: 1.5 },
      { limit: 0 },
      { limit: 101 },
      { page: Number.MAX_SAFE_INTEGER, limit: 100 },
    ])
      expect(() =>
        asActor(['academics.academic_content.approve'], () =>
          queue.execute(query),
        ),
      ).toThrow();
    expect(repository.queue).not.toHaveBeenCalled();
  });

  it('keeps approve and view separate and rejects app actors', () => {
    expect(() =>
      asActor(['academics.academic_content.view'], () => queue.execute({})),
    ).toThrow();
    expect(() =>
      asActor(['academics.academic_content.approve'], () =>
        history.execute(contentId, {}),
      ),
    ).toThrow();
    expect(() =>
      asActor(
        ['academics.academic_content.approve'],
        () => queue.execute({}),
        UserType.TEACHER,
      ),
    ).toThrow();
    expect(repository.queue).not.toHaveBeenCalled();
    expect(repository.history).not.toHaveBeenCalled();
  });
});
