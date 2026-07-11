import { Injectable } from '@nestjs/common';
import { requireDashboardScope } from '../dashboard-context';
import {
  CreateDashboardTodoDto,
  CreateDashboardTodoResponseDto,
} from '../dto/dashboard-todos.dto';
import { DashboardTodosRepository } from '../infrastructure/dashboard-todos.repository';
import { presentCreatedDashboardTodo } from '../presenters/dashboard-todos.presenter';
import {
  normalizeDashboardTodoNotes,
  normalizeDashboardTodoTitle,
  toDashboardTodoDate,
  toPrismaDashboardTodoPriority,
} from './dashboard-todo.helpers';

@Injectable()
export class CreateDashboardTodoUseCase {
  constructor(
    private readonly dashboardTodosRepository: DashboardTodosRepository,
  ) {}

  async execute(
    input: CreateDashboardTodoDto,
  ): Promise<CreateDashboardTodoResponseDto> {
    const scope = requireDashboardScope();
    const generatedAt = new Date();
    const todo = await this.dashboardTodosRepository.createOwnedTodo(scope, {
      date: toDashboardTodoDate(input.date),
      title: normalizeDashboardTodoTitle(input.title),
      notes: normalizeDashboardTodoNotes(input.notes),
      priority: toPrismaDashboardTodoPriority(input.priority ?? 'normal'),
      sortOrder:
        typeof input.sortOrder === 'number' && Number.isInteger(input.sortOrder)
          ? input.sortOrder
          : 0,
    });

    return presentCreatedDashboardTodo(generatedAt, todo);
  }
}
