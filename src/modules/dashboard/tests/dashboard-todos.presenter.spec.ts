import { DashboardTodoPriority, DashboardTodoStatus } from '@prisma/client';
import {
  presentDashboardTodo,
  presentDashboardTodos,
} from '../presenters/dashboard-todos.presenter';

describe('Dashboard todo presenter', () => {
  it('maps Prisma enums to the public lowercase todo contract', () => {
    const todo = presentDashboardTodo(todoSnapshot());

    expect(todo).toEqual({
      todoId: 'todo-1',
      date: '2026-07-09',
      title: 'Review attendance',
      notes: 'Check pending sessions',
      status: 'completed',
      priority: 'high',
      sortOrder: 10,
      completedAt: '2026-07-09T12:00:00.000Z',
      createdAt: '2026-07-09T10:00:00.000Z',
      updatedAt: '2026-07-09T11:00:00.000Z',
    });
    expectNoInternalLeaks(todo);
  });

  it('returns the stable list envelope without raw persistence fields', () => {
    const response = presentDashboardTodos({
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      date: '2026-07-09',
      todos: [todoSnapshot()],
      counts: { total: 1, pending: 0, completed: 1 },
      filters: { status: 'all', limit: 50 },
    });

    expect(response).toMatchObject({
      generatedAt: '2026-07-09T12:00:00.000Z',
      date: '2026-07-09',
      todos: [expect.objectContaining({ todoId: 'todo-1' })],
      summary: { total: 1, pending: 0, completed: 1 },
      filters: { date: '2026-07-09', status: 'all', limit: 50 },
      meta: {
        source: 'dashboard_todos',
        version: 'v1',
        scope: 'owner',
        freshness: {
          dataMode: 'persisted_user_data',
          cacheStatus: 'not_used',
          realtimeStatus: 'not_used',
        },
      },
    });
    expectNoInternalLeaks(response);
  });
});

function todoSnapshot() {
  return {
    id: 'todo-1',
    date: new Date('2026-07-09T00:00:00.000Z'),
    title: 'Review attendance',
    notes: 'Check pending sessions',
    status: DashboardTodoStatus.COMPLETED,
    priority: DashboardTodoPriority.HIGH,
    sortOrder: 10,
    completedAt: new Date('2026-07-09T12:00:00.000Z'),
    createdAt: new Date('2026-07-09T10:00:00.000Z'),
    updatedAt: new Date('2026-07-09T11:00:00.000Z'),
  };
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
    'raw',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}
