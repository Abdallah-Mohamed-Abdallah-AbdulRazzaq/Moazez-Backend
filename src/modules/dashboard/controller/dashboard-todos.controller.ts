import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../common/decorators/required-permissions.decorator';
import { SchoolManagementOnly } from '../../../common/decorators/school-management-only.decorator';
import { CreateDashboardTodoUseCase } from '../application/create-dashboard-todo.use-case';
import { DeleteDashboardTodoUseCase } from '../application/delete-dashboard-todo.use-case';
import { ListDashboardTodosUseCase } from '../application/list-dashboard-todos.use-case';
import { UpdateDashboardTodoUseCase } from '../application/update-dashboard-todo.use-case';
import {
  CreateDashboardTodoDto,
  CreateDashboardTodoResponseDto,
  DashboardTodosResponseDto,
  DeleteDashboardTodoResponseDto,
  ListDashboardTodosQueryDto,
  UpdateDashboardTodoDto,
  UpdateDashboardTodoResponseDto,
} from '../dto/dashboard-todos.dto';

@ApiTags('dashboard')
@ApiBearerAuth()
@SchoolManagementOnly()
@Controller('dashboard')
export class DashboardTodosController {
  constructor(
    private readonly createDashboardTodoUseCase: CreateDashboardTodoUseCase,
    private readonly deleteDashboardTodoUseCase: DeleteDashboardTodoUseCase,
    private readonly listDashboardTodosUseCase: ListDashboardTodosUseCase,
    private readonly updateDashboardTodoUseCase: UpdateDashboardTodoUseCase,
  ) {}

  @Get('light-mode-dropdown/todos')
  @RequiredPermissions('dashboard.todos.view')
  listLightModeDropdownTodos(
    @Query() query: ListDashboardTodosQueryDto,
  ): Promise<DashboardTodosResponseDto> {
    return this.listDashboardTodosUseCase.execute(query);
  }

  @Post('light-mode-dropdown/todos')
  @RequiredPermissions('dashboard.todos.manage')
  createLightModeDropdownTodo(
    @Body() body: CreateDashboardTodoDto,
  ): Promise<CreateDashboardTodoResponseDto> {
    return this.createDashboardTodoUseCase.execute(body);
  }

  @Patch('light-mode-dropdown/todos/:todoId')
  @RequiredPermissions('dashboard.todos.manage')
  updateLightModeDropdownTodo(
    @Param('todoId') todoId: string,
    @Body() body: UpdateDashboardTodoDto,
  ): Promise<UpdateDashboardTodoResponseDto> {
    return this.updateDashboardTodoUseCase.execute(todoId, body);
  }

  @Delete('light-mode-dropdown/todos/:todoId')
  @RequiredPermissions('dashboard.todos.manage')
  deleteLightModeDropdownTodo(
    @Param('todoId') todoId: string,
  ): Promise<DeleteDashboardTodoResponseDto> {
    return this.deleteDashboardTodoUseCase.execute(todoId);
  }
}
