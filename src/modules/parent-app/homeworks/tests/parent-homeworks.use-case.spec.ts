import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentAppChildNotFoundException } from '../../shared/parent-app-errors';
import type { ParentAppAccessibleChild } from '../../shared/parent-app.types';
import {
  GetParentChildHomeworkUseCase,
  ListParentChildHomeworksUseCase,
} from '../application/parent-homeworks.use-cases';
import { ParentHomeworksReadAdapter } from '../infrastructure/parent-homeworks-read.adapter';

describe('Parent Homeworks use-cases', () => {
  it('rejects unowned children through ParentAppAccessService', async () => {
    const { listUseCase, accessService, readAdapter } = createUseCases();
    accessService.assertParentOwnsStudent.mockRejectedValue(
      new ParentAppChildNotFoundException({ studentId: 'student-2' }),
    );

    await expect(listUseCase.execute('student-2')).rejects.toMatchObject({
      code: 'parent_app.child.not_found',
    });
    expect(readAdapter.listHomeworks).not.toHaveBeenCalled();
  });

  it('lists visible homework targets for the owned child only', async () => {
    const { listUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.listHomeworks.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 25,
    });

    await listUseCase.execute('student-1', {
      status: 'waiting',
      search: 'math',
    });

    expect(readAdapter.listHomeworks).toHaveBeenCalledWith({
      child: childFixture(),
      query: { status: 'waiting', search: 'math' },
    });
  });

  it('returns safe 404 for inaccessible child homework detail', async () => {
    const { getUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.findHomework.mockResolvedValue(null);

    await expect(
      getUseCase.execute('student-1', 'homework-1'),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });
});

function createUseCases(): {
  listUseCase: ListParentChildHomeworksUseCase;
  getUseCase: GetParentChildHomeworkUseCase;
  accessService: jest.Mocked<ParentAppAccessService>;
  readAdapter: jest.Mocked<ParentHomeworksReadAdapter>;
} {
  const accessService = {
    assertParentOwnsStudent: jest.fn(),
  } as unknown as jest.Mocked<ParentAppAccessService>;
  const readAdapter = {
    listHomeworks: jest.fn(),
    findHomework: jest.fn(),
  } as unknown as jest.Mocked<ParentHomeworksReadAdapter>;

  return {
    listUseCase: new ListParentChildHomeworksUseCase(
      accessService,
      readAdapter,
    ),
    getUseCase: new GetParentChildHomeworkUseCase(accessService, readAdapter),
    accessService,
    readAdapter,
  };
}

function createUseCasesWithValidAccess(): ReturnType<typeof createUseCases> {
  const created = createUseCases();
  created.accessService.assertParentOwnsStudent.mockResolvedValue(
    childFixture(),
  );
  return created;
}

function childFixture(): ParentAppAccessibleChild {
  return {
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    termId: 'term-1',
  };
}
