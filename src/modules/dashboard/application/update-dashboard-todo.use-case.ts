import { BadRequestException, Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { requireDashboardScope } from '../dashboard-context';
import {
  DashboardTodoStatus,
  UpdateDashboardTodoDto,
  UpdateDashboardTodoResponseDto,
} from '../dto/dashboard-todos.dto';
import {
  DashboardTodosRepository,
  UpdateDashboardTodoRecord,
} from '../infrastructure/dashboard-todos.repository';
import { presentUpdatedDashboardTodo } from '../presenters/dashboard-todos.presenter';
import {
  hasOwnProperty,
  normalizeDashboardTodoNotes,
  normalizeDashboardTodoTitle,
  toDashboardTodoDate,
  toPrismaDashboardTodoPriority,
  toPrismaDashboardTodoStatus,
} from './dashboard-todo.helpers';

@Injectable()
export class UpdateDashboardTodoUseCase {
  constructor(
    private readonly dashboardTodosRepository: DashboardTodosRepository,
  ) {}

  async execute(
    todoId: string,
    input: UpdateDashboardTodoDto,
  ): Promise<UpdateDashboardTodoResponseDto> {
    if (!hasUpdate(input)) {
      throw new BadRequestException('At least one todo field must be provided');
    }

    const scope = requireDashboardScope();
    const existing = await this.dashboardTodosRepository.findOwnedTodo(
      scope,
      todoId,
    );
    if (!existing) {
      throw new NotFoundDomainException('Dashboard todo was not found');
    }

    const data = buildUpdateRecord(input, existing.completedAt);
    await this.dashboardTodosRepository.updateOwnedTodo(scope, todoId, data);
    const updated = await this.dashboardTodosRepository.findOwnedTodo(
      scope,
      todoId,
    );
    if (!updated) {
      throw new NotFoundDomainException('Dashboard todo was not found');
    }

    return presentUpdatedDashboardTodo(new Date(), updated);
  }
}

function hasUpdate(input: UpdateDashboardTodoDto): boolean {
  return ['date', 'title', 'notes', 'status', 'priority', 'sortOrder'].some(
    (property) => hasOwnProperty(input, property),
  );
}

function buildUpdateRecord(
  input: UpdateDashboardTodoDto,
  currentCompletedAt: Date | null,
): UpdateDashboardTodoRecord {
  const data: UpdateDashboardTodoRecord = {};

  if (hasOwnProperty(input, 'date') && input.date !== undefined) {
    data.date = toDashboardTodoDate(input.date);
  }
  if (hasOwnProperty(input, 'title') && input.title !== undefined) {
    data.title = normalizeDashboardTodoTitle(input.title);
  }
  if (hasOwnProperty(input, 'notes')) {
    data.notes = normalizeDashboardTodoNotes(input.notes);
  }
  if (hasOwnProperty(input, 'priority') && input.priority !== undefined) {
    data.priority = toPrismaDashboardTodoPriority(input.priority);
  }
  if (hasOwnProperty(input, 'sortOrder') && input.sortOrder !== undefined) {
    if (!Number.isInteger(input.sortOrder)) {
      throw new BadRequestException('Todo sort order must be an integer');
    }
    data.sortOrder = input.sortOrder;
  }
  if (hasOwnProperty(input, 'status') && input.status !== undefined) {
    const status = input.status as DashboardTodoStatus;
    data.status = toPrismaDashboardTodoStatus(status);
    if (status === 'completed' && !currentCompletedAt) {
      data.completedAt = new Date();
    }
    if (status === 'pending') {
      data.completedAt = null;
    }
  }

  return data;
}
