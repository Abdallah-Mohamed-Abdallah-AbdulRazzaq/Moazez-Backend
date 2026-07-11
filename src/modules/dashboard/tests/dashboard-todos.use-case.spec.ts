import {
  DashboardTodoPriority as PrismaDashboardTodoPriority,
  DashboardTodoStatus as PrismaDashboardTodoStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../common/context/request-context';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { CreateDashboardTodoUseCase } from '../application/create-dashboard-todo.use-case';
import { DeleteDashboardTodoUseCase } from '../application/delete-dashboard-todo.use-case';
import { ListDashboardTodosUseCase } from '../application/list-dashboard-todos.use-case';
import { UpdateDashboardTodoUseCase } from '../application/update-dashboard-todo.use-case';
import { DashboardLightModeDropdownRepository } from '../infrastructure/dashboard-light-mode-dropdown.repository';
import {
  DashboardTodoSnapshot,
  DashboardTodosRepository,
} from '../infrastructure/dashboard-todos.repository';

describe('Dashboard todo use cases', () => {
  it('lists only the current owner and school scope with safe defaults', async () => {
    const todosRepository = todosRepositoryMock();
    todosRepository.listOwnedTodos.mockResolvedValue([todoSnapshot()]);
    todosRepository.countOwnedTodos.mockResolvedValue({
      total: 1,
      pending: 1,
      completed: 0,
    });
    const dropdownRepository = dropdownRepositoryMock();
    const useCase = new ListDashboardTodosUseCase(
      todosRepository as any,
      dropdownRepository as any,
    );

    const response = await withDashboardScope(() =>
      useCase.execute({ date: '2026-07-09' }),
    );

    expect(todosRepository.listOwnedTodos).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: 'school-1', actorId: 'user-1' }),
      expect.objectContaining({ limit: 50, status: undefined }),
    );
    expect(response).toMatchObject({
      date: '2026-07-09',
      todos: [
        {
          todoId: 'todo-1',
          title: 'Review attendance',
          status: 'pending',
          priority: 'normal',
        },
      ],
      summary: { total: 1, pending: 1, completed: 0 },
      filters: { date: '2026-07-09', status: 'all', limit: 50 },
      meta: { source: 'dashboard_todos', version: 'v1', scope: 'owner' },
    });
    expectNoInternalLeaks(response);
  });

  it('uses the school profile timezone when listing without a date', async () => {
    const todosRepository = todosRepositoryMock();
    todosRepository.listOwnedTodos.mockResolvedValue([]);
    todosRepository.countOwnedTodos.mockResolvedValue({
      total: 0,
      pending: 0,
      completed: 0,
    });
    const useCase = new ListDashboardTodosUseCase(
      todosRepository as any,
      dropdownRepositoryMock() as any,
    );

    const response = await withDashboardScope(() => useCase.execute());

    expect(response.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(response.filters).toMatchObject({ status: 'all', limit: 50 });
  });

  it('creates a trimmed pending todo with normal priority by default', async () => {
    const todosRepository = todosRepositoryMock();
    todosRepository.createOwnedTodo.mockResolvedValue(
      todoSnapshot({
        title: 'Review attendance',
        notes: 'Check pending sessions',
      }),
    );
    const useCase = new CreateDashboardTodoUseCase(todosRepository as any);

    const response = await withDashboardScope(() =>
      useCase.execute({
        date: '2026-07-09',
        title: '  Review attendance  ',
        notes: '  Check pending sessions  ',
      }),
    );

    expect(todosRepository.createOwnedTodo).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: 'school-1', actorId: 'user-1' }),
      expect.objectContaining({
        title: 'Review attendance',
        notes: 'Check pending sessions',
        priority: PrismaDashboardTodoPriority.NORMAL,
        sortOrder: 0,
      }),
    );
    expect(response.todo).toMatchObject({
      status: 'pending',
      priority: 'normal',
      title: 'Review attendance',
    });
    expectNoInternalLeaks(response);
  });

  it('updates fields and sets or clears completedAt with status transitions', async () => {
    const todosRepository = todosRepositoryMock();
    const existing = todoSnapshot();
    const completed = todoSnapshot({
      status: PrismaDashboardTodoStatus.COMPLETED,
      completedAt: new Date('2026-07-09T12:00:00.000Z'),
      title: 'Updated',
      notes: null,
      priority: PrismaDashboardTodoPriority.HIGH,
      sortOrder: 10,
      date: new Date('2026-07-10T00:00:00.000Z'),
    });
    todosRepository.findOwnedTodo
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(completed)
      .mockResolvedValueOnce(completed)
      .mockResolvedValueOnce(
        todoSnapshot({
          status: PrismaDashboardTodoStatus.PENDING,
          completedAt: null,
        }),
      );
    const useCase = new UpdateDashboardTodoUseCase(todosRepository as any);

    const completedResponse = await withDashboardScope(() =>
      useCase.execute('todo-1', {
        title: '  Updated  ',
        notes: null,
        priority: 'high',
        sortOrder: 10,
        date: '2026-07-10',
        status: 'completed',
      }),
    );
    expect(todosRepository.updateOwnedTodo).toHaveBeenCalledWith(
      expect.anything(),
      'todo-1',
      expect.objectContaining({
        title: 'Updated',
        notes: null,
        priority: PrismaDashboardTodoPriority.HIGH,
        sortOrder: 10,
        status: PrismaDashboardTodoStatus.COMPLETED,
        completedAt: expect.any(Date),
      }),
    );
    expect(completedResponse.todo).toMatchObject({
      status: 'completed',
      completedAt: '2026-07-09T12:00:00.000Z',
    });

    const pendingResponse = await withDashboardScope(() =>
      useCase.execute('todo-1', { status: 'pending' }),
    );
    expect(todosRepository.updateOwnedTodo).toHaveBeenLastCalledWith(
      expect.anything(),
      'todo-1',
      expect.objectContaining({
        status: PrismaDashboardTodoStatus.PENDING,
        completedAt: null,
      }),
    );
    expect(pendingResponse.todo.completedAt).toBeNull();
  });

  it.each(['unknown todo', 'cross-owner todo', 'cross-school todo'])(
    'returns not found for %s updates and deletes',
    async () => {
      const todosRepository = todosRepositoryMock();
      todosRepository.findOwnedTodo.mockResolvedValue(null);
      const updateUseCase = new UpdateDashboardTodoUseCase(
        todosRepository as any,
      );
      const deleteUseCase = new DeleteDashboardTodoUseCase(
        todosRepository as any,
      );

      await withDashboardScope(async () => {
        await expect(
          updateUseCase.execute('other-todo', { title: 'Updated' }),
        ).rejects.toBeInstanceOf(NotFoundDomainException);
        await expect(
          deleteUseCase.execute('other-todo'),
        ).rejects.toBeInstanceOf(NotFoundDomainException);
      });
    },
  );

  it('soft-deletes owned todos after checking ownership', async () => {
    const todosRepository = todosRepositoryMock();
    todosRepository.findOwnedTodo.mockResolvedValue(todoSnapshot());
    const useCase = new DeleteDashboardTodoUseCase(todosRepository as any);

    const response = await withDashboardScope(() => useCase.execute('todo-1'));

    expect(todosRepository.softDeleteOwnedTodo).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: 'school-1', actorId: 'user-1' }),
      'todo-1',
      expect.any(Date),
    );
    expect(response).toMatchObject({ deleted: true, todoId: 'todo-1' });
    expectNoInternalLeaks(response);
  });
});

function todosRepositoryMock(): jest.Mocked<
  Pick<
    DashboardTodosRepository,
    | 'listOwnedTodos'
    | 'countOwnedTodos'
    | 'createOwnedTodo'
    | 'findOwnedTodo'
    | 'updateOwnedTodo'
    | 'softDeleteOwnedTodo'
  >
> {
  return {
    listOwnedTodos: jest.fn(),
    countOwnedTodos: jest.fn(),
    createOwnedTodo: jest.fn(),
    findOwnedTodo: jest.fn(),
    updateOwnedTodo: jest.fn(),
    softDeleteOwnedTodo: jest.fn(),
  };
}

function dropdownRepositoryMock(): jest.Mocked<
  Pick<DashboardLightModeDropdownRepository, 'loadSchoolLocationSnapshot'>
> {
  return {
    loadSchoolLocationSnapshot: jest.fn().mockResolvedValue({
      schoolName: 'Moazez Academy',
      profile: {
        timezone: 'Africa/Cairo',
        formattedAddress: null,
        city: 'Cairo',
        country: 'Egypt',
      },
    }),
  };
}

function todoSnapshot(
  overrides: Partial<DashboardTodoSnapshot> = {},
): DashboardTodoSnapshot {
  return {
    id: 'todo-1',
    date: new Date('2026-07-09T00:00:00.000Z'),
    title: 'Review attendance',
    notes: 'Check pending sessions',
    status: PrismaDashboardTodoStatus.PENDING,
    priority: PrismaDashboardTodoPriority.NORMAL,
    sortOrder: 0,
    completedAt: null,
    createdAt: new Date('2026-07-09T10:00:00.000Z'),
    updatedAt: new Date('2026-07-09T10:00:00.000Z'),
    ...overrides,
  };
}

async function withDashboardScope<T>(fn: () => Promise<T>): Promise<T> {
  return runWithRequestContext(createRequestContext(), async () => {
    setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
    setActiveMembership({
      membershipId: 'membership-1',
      organizationId: 'organization-1',
      schoolId: 'school-1',
      roleId: 'role-1',
      permissions: ['dashboard.todos.view', 'dashboard.todos.manage'],
    });
    return fn();
  });
}

function expectNoInternalLeaks(body: unknown): void {
  const serialized = JSON.stringify(body);
  for (const forbidden of [
    'schoolId',
    'organizationId',
    'membershipId',
    'roleId',
    'ownerUserId',
    'userId',
    'deletedAt',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}
