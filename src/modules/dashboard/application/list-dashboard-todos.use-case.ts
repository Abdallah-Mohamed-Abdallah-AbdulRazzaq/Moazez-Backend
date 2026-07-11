import { Injectable } from '@nestjs/common';
import { requireDashboardScope } from '../dashboard-context';
import {
  DashboardTodoListStatus,
  DashboardTodosResponseDto,
  ListDashboardTodosQueryDto,
} from '../dto/dashboard-todos.dto';
import { DashboardLightModeDropdownRepository } from '../infrastructure/dashboard-light-mode-dropdown.repository';
import { DashboardTodosRepository } from '../infrastructure/dashboard-todos.repository';
import { presentDashboardTodos } from '../presenters/dashboard-todos.presenter';
import {
  normalizeDashboardLightModeDropdownDate,
  resolveDashboardLightModeDropdownTimezone,
} from './get-dashboard-light-mode-dropdown.use-case';
import {
  toDashboardTodoDate,
  toPrismaDashboardTodoStatus,
} from './dashboard-todo.helpers';

const DEFAULT_LIMIT = 50;

@Injectable()
export class ListDashboardTodosUseCase {
  constructor(
    private readonly dashboardTodosRepository: DashboardTodosRepository,
    private readonly dashboardLightModeDropdownRepository: DashboardLightModeDropdownRepository,
  ) {}

  async execute(
    query: ListDashboardTodosQueryDto = new ListDashboardTodosQueryDto(),
  ): Promise<DashboardTodosResponseDto> {
    const scope = requireDashboardScope();
    const generatedAt = new Date();
    const schoolLocation =
      await this.dashboardLightModeDropdownRepository.loadSchoolLocationSnapshot(
        scope,
      );
    const timezone = resolveDashboardLightModeDropdownTimezone(
      query.timezone,
      schoolLocation.profile?.timezone,
    );
    const date = normalizeDashboardLightModeDropdownDate(
      query.date,
      timezone,
      generatedAt,
    );
    const status: DashboardTodoListStatus =
      query.status === 'pending' || query.status === 'completed'
        ? query.status
        : 'all';
    const limit =
      typeof query.limit === 'number' &&
      Number.isInteger(query.limit) &&
      query.limit >= 1 &&
      query.limit <= 100
        ? query.limit
        : DEFAULT_LIMIT;
    const todoDate = toDashboardTodoDate(date);

    const [todos, counts] = await Promise.all([
      this.dashboardTodosRepository.listOwnedTodos(scope, {
        date: todoDate,
        status:
          status === 'all' ? undefined : toPrismaDashboardTodoStatus(status),
        limit,
      }),
      this.dashboardTodosRepository.countOwnedTodos(scope, todoDate),
    ]);

    return presentDashboardTodos({
      generatedAt,
      date,
      todos,
      counts,
      filters: { status, limit },
    });
  }
}
