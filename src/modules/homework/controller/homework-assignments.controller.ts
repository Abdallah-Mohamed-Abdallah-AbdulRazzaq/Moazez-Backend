import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../common/decorators/required-permissions.decorator';
import {
  CancelHomeworkAssignmentUseCase,
  CloseHomeworkAssignmentUseCase,
  CreateHomeworkAssignmentUseCase,
  GetHomeworkAssignmentUseCase,
  ListHomeworkAssignmentsUseCase,
  ListHomeworkTargetsUseCase,
  PublishHomeworkAssignmentUseCase,
  ResolveHomeworkTargetsUseCase,
  UpdateHomeworkAssignmentUseCase,
} from '../application/homework-assignments.use-cases';
import {
  CreateHomeworkAssignmentDto,
  ListHomeworkAssignmentsQueryDto,
  UpdateHomeworkAssignmentDto,
} from '../dto/homework-assignment.dto';
import {
  HomeworkAssignmentResponseDto,
  HomeworkAssignmentsListResponseDto,
  HomeworkTargetsListResponseDto,
} from '../dto/homework-assignment-response.dto';

@ApiTags('Homework')
@ApiBearerAuth()
@Controller('homework/assignments')
export class HomeworkAssignmentsController {
  constructor(
    private readonly listAssignmentsUseCase: ListHomeworkAssignmentsUseCase,
    private readonly getAssignmentUseCase: GetHomeworkAssignmentUseCase,
    private readonly createAssignmentUseCase: CreateHomeworkAssignmentUseCase,
    private readonly updateAssignmentUseCase: UpdateHomeworkAssignmentUseCase,
    private readonly publishAssignmentUseCase: PublishHomeworkAssignmentUseCase,
    private readonly closeAssignmentUseCase: CloseHomeworkAssignmentUseCase,
    private readonly cancelAssignmentUseCase: CancelHomeworkAssignmentUseCase,
    private readonly listTargetsUseCase: ListHomeworkTargetsUseCase,
    private readonly resolveTargetsUseCase: ResolveHomeworkTargetsUseCase,
  ) {}

  @Get()
  @RequiredPermissions('homework.assignments.view')
  @ApiOperation({ summary: 'List homework assignments' })
  @ApiOkResponse({ type: HomeworkAssignmentsListResponseDto })
  listAssignments(
    @Query() query: ListHomeworkAssignmentsQueryDto,
  ): Promise<HomeworkAssignmentsListResponseDto> {
    return this.listAssignmentsUseCase.execute(query);
  }

  @Post()
  @RequiredPermissions('homework.assignments.manage')
  @ApiOperation({ summary: 'Create a draft homework assignment' })
  @ApiBody({ type: CreateHomeworkAssignmentDto })
  @ApiOkResponse({ type: HomeworkAssignmentResponseDto })
  createAssignment(
    @Body() dto: CreateHomeworkAssignmentDto,
  ): Promise<HomeworkAssignmentResponseDto> {
    return this.createAssignmentUseCase.execute(dto);
  }

  @Get(':homeworkId')
  @RequiredPermissions('homework.assignments.view')
  @ApiOperation({ summary: 'Get a homework assignment' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiOkResponse({ type: HomeworkAssignmentResponseDto })
  getAssignment(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
  ): Promise<HomeworkAssignmentResponseDto> {
    return this.getAssignmentUseCase.execute(homeworkId);
  }

  @Patch(':homeworkId')
  @RequiredPermissions('homework.assignments.manage')
  @ApiOperation({ summary: 'Update a draft homework assignment' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiBody({ type: UpdateHomeworkAssignmentDto })
  @ApiOkResponse({ type: HomeworkAssignmentResponseDto })
  updateAssignment(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Body() dto: UpdateHomeworkAssignmentDto,
  ): Promise<HomeworkAssignmentResponseDto> {
    return this.updateAssignmentUseCase.execute(homeworkId, dto);
  }

  @Post(':homeworkId/publish')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('homework.assignments.manage')
  @ApiOperation({ summary: 'Publish a homework assignment' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiOkResponse({ type: HomeworkAssignmentResponseDto })
  publishAssignment(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
  ): Promise<HomeworkAssignmentResponseDto> {
    return this.publishAssignmentUseCase.execute(homeworkId);
  }

  @Post(':homeworkId/close')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('homework.assignments.manage')
  @ApiOperation({ summary: 'Close a published homework assignment' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiOkResponse({ type: HomeworkAssignmentResponseDto })
  closeAssignment(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
  ): Promise<HomeworkAssignmentResponseDto> {
    return this.closeAssignmentUseCase.execute(homeworkId);
  }

  @Post(':homeworkId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('homework.assignments.manage')
  @ApiOperation({ summary: 'Cancel a draft or published homework assignment' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiOkResponse({ type: HomeworkAssignmentResponseDto })
  cancelAssignment(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
  ): Promise<HomeworkAssignmentResponseDto> {
    return this.cancelAssignmentUseCase.execute(homeworkId);
  }

  @Get(':homeworkId/targets')
  @RequiredPermissions('homework.targets.view')
  @ApiOperation({ summary: 'List homework assignment targets' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiOkResponse({ type: HomeworkTargetsListResponseDto })
  listTargets(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
  ): Promise<HomeworkTargetsListResponseDto> {
    return this.listTargetsUseCase.execute(homeworkId);
  }

  @Post(':homeworkId/targets/resolve')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('homework.targets.manage')
  @ApiOperation({ summary: 'Resolve draft homework targets' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiOkResponse({ type: HomeworkAssignmentResponseDto })
  resolveTargets(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
  ): Promise<HomeworkAssignmentResponseDto> {
    return this.resolveTargetsUseCase.execute(homeworkId);
  }
}
