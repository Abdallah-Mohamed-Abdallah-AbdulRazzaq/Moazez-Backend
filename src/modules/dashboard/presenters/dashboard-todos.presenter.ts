import {
  CreateDashboardTodoResponseDto,
  DashboardTodoDto,
  DashboardTodoListStatus,
  DashboardTodosResponseDto,
  DeleteDashboardTodoResponseDto,
  UpdateDashboardTodoResponseDto,
} from '../dto/dashboard-todos.dto';
import {
  DashboardTodoCounts,
  DashboardTodoSnapshot,
} from '../infrastructure/dashboard-todos.repository';

export interface DashboardTodosPresentationInput {
  generatedAt: Date;
  date: string;
  todos: DashboardTodoSnapshot[];
  counts: DashboardTodoCounts;
  filters: {
    status: DashboardTodoListStatus;
    limit: number;
  };
}

export function presentDashboardTodos(
  input: DashboardTodosPresentationInput,
): DashboardTodosResponseDto {
  return {
    generatedAt: input.generatedAt.toISOString(),
    date: input.date,
    todos: input.todos.map(presentDashboardTodo),
    summary: input.counts,
    filters: {
      date: input.date,
      status: input.filters.status,
      limit: input.filters.limit,
    },
    meta: {
      source: 'dashboard_todos',
      version: 'v1',
      scope: 'owner',
    },
  };
}

export function presentDashboardTodo(
  todo: DashboardTodoSnapshot,
): DashboardTodoDto {
  return {
    todoId: todo.id,
    date: todo.date.toISOString().slice(0, 10),
    title: todo.title,
    notes: todo.notes,
    status: todo.status.toLowerCase() as DashboardTodoDto['status'],
    priority: todo.priority.toLowerCase() as DashboardTodoDto['priority'],
    sortOrder: todo.sortOrder,
    completedAt: todo.completedAt?.toISOString() ?? null,
    createdAt: todo.createdAt.toISOString(),
    updatedAt: todo.updatedAt.toISOString(),
  };
}

export function presentCreatedDashboardTodo(
  generatedAt: Date,
  todo: DashboardTodoSnapshot,
): CreateDashboardTodoResponseDto {
  return {
    generatedAt: generatedAt.toISOString(),
    todo: presentDashboardTodo(todo),
  };
}

export function presentUpdatedDashboardTodo(
  generatedAt: Date,
  todo: DashboardTodoSnapshot,
): UpdateDashboardTodoResponseDto {
  return {
    generatedAt: generatedAt.toISOString(),
    todo: presentDashboardTodo(todo),
  };
}

export function presentDeletedDashboardTodo(
  generatedAt: Date,
  todoId: string,
): DeleteDashboardTodoResponseDto {
  return {
    generatedAt: generatedAt.toISOString(),
    deleted: true,
    todoId,
  };
}
