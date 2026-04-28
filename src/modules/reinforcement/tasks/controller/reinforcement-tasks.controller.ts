import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { CancelReinforcementTaskUseCase } from '../application/cancel-reinforcement-task.use-case';
import { CreateReinforcementTaskUseCase } from '../application/create-reinforcement-task.use-case';
import { DuplicateReinforcementTaskUseCase } from '../application/duplicate-reinforcement-task.use-case';
import { GetReinforcementFilterOptionsUseCase } from '../application/get-reinforcement-filter-options.use-case';
import { GetReinforcementTaskUseCase } from '../application/get-reinforcement-task.use-case';
import { ListReinforcementTasksUseCase } from '../application/list-reinforcement-tasks.use-case';
import {
  CancelReinforcementTaskDto,
  CreateReinforcementTaskDto,
  DuplicateReinforcementTaskDto,
  ListReinforcementTasksQueryDto,
  ReinforcementFilterOptionsQueryDto,
} from '../dto/reinforcement-task.dto';

@ApiTags('reinforcement-tasks')
@ApiBearerAuth()
@Controller('reinforcement')
export class ReinforcementTasksController {
  constructor(
    private readonly getReinforcementFilterOptionsUseCase: GetReinforcementFilterOptionsUseCase,
    private readonly listReinforcementTasksUseCase: ListReinforcementTasksUseCase,
    private readonly createReinforcementTaskUseCase: CreateReinforcementTaskUseCase,
    private readonly getReinforcementTaskUseCase: GetReinforcementTaskUseCase,
    private readonly duplicateReinforcementTaskUseCase: DuplicateReinforcementTaskUseCase,
    private readonly cancelReinforcementTaskUseCase: CancelReinforcementTaskUseCase,
  ) {}

  @Get('filter-options')
  @RequiredPermissions('reinforcement.tasks.view')
  getFilterOptions(@Query() query: ReinforcementFilterOptionsQueryDto) {
    return this.getReinforcementFilterOptionsUseCase.execute(query);
  }

  @Get('tasks')
  @RequiredPermissions('reinforcement.tasks.view')
  listTasks(@Query() query: ListReinforcementTasksQueryDto) {
    return this.listReinforcementTasksUseCase.execute(query);
  }

  @Post('tasks')
  @RequiredPermissions('reinforcement.tasks.manage')
  createTask(@Body() dto: CreateReinforcementTaskDto) {
    return this.createReinforcementTaskUseCase.execute(dto);
  }

  @Get('tasks/:taskId')
  @RequiredPermissions('reinforcement.tasks.view')
  getTask(@Param('taskId', new ParseUUIDPipe()) taskId: string) {
    return this.getReinforcementTaskUseCase.execute(taskId);
  }

  @Post('tasks/:taskId/duplicate')
  @RequiredPermissions('reinforcement.tasks.manage')
  duplicateTask(
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @Body() dto: DuplicateReinforcementTaskDto,
  ) {
    return this.duplicateReinforcementTaskUseCase.execute(taskId, dto);
  }

  @Post('tasks/:taskId/cancel')
  @RequiredPermissions('reinforcement.tasks.manage')
  cancelTask(
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @Body() dto: CancelReinforcementTaskDto,
  ) {
    return this.cancelReinforcementTaskUseCase.execute(taskId, dto);
  }
}
