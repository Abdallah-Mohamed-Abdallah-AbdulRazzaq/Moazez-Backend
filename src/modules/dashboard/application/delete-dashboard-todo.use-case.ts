import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { requireDashboardScope } from '../dashboard-context';
import { DeleteDashboardTodoResponseDto } from '../dto/dashboard-todos.dto';
import { DashboardTodosRepository } from '../infrastructure/dashboard-todos.repository';
import { presentDeletedDashboardTodo } from '../presenters/dashboard-todos.presenter';

@Injectable()
export class DeleteDashboardTodoUseCase {
  constructor(
    private readonly dashboardTodosRepository: DashboardTodosRepository,
  ) {}

  async execute(todoId: string): Promise<DeleteDashboardTodoResponseDto> {
    const scope = requireDashboardScope();
    const todo = await this.dashboardTodosRepository.findOwnedTodo(
      scope,
      todoId,
    );
    if (!todo) {
      throw new NotFoundDomainException('Dashboard todo was not found');
    }

    const generatedAt = new Date();
    await this.dashboardTodosRepository.softDeleteOwnedTodo(
      scope,
      todoId,
      generatedAt,
    );

    return presentDeletedDashboardTodo(generatedAt, todo.id);
  }
}
