import {
  Body,
  Controller,
  Delete,
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
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import {
  ActivateLessonPlanUseCase,
  ArchiveLessonPlanUseCase,
  CancelLessonPlanItemUseCase,
  CompleteLessonPlanItemUseCase,
  CreateLessonPlanItemUseCase,
  CreateLessonPlanUseCase,
  DeleteLessonPlanItemUseCase,
  DeleteLessonPlanUseCase,
  GetLessonPlanUseCase,
  ListLessonPlansUseCase,
  ReorderLessonPlanItemUseCase,
  SkipLessonPlanItemUseCase,
  StartLessonPlanItemUseCase,
  UpdateLessonPlanItemUseCase,
  UpdateLessonPlanUseCase,
} from '../application/lesson-plans.use-cases';
import {
  CreateLessonPlanDto,
  CreateLessonPlanItemDto,
  LessonPlanItemStatusNoteDto,
  ListLessonPlansQueryDto,
  ReorderLessonPlanItemDto,
  UpdateLessonPlanDto,
  UpdateLessonPlanItemDto,
} from '../dto/lesson-plans.dto';
import {
  DeleteLessonPlanItemResponseDto,
  DeleteLessonPlanResponseDto,
  LessonPlanDetailResponseDto,
  LessonPlanItemResponseDto,
  LessonPlansListResponseDto,
} from '../dto/lesson-plans-response.dto';

@ApiTags('academics-lesson-plans')
@ApiBearerAuth()
@Controller('academics/lesson-plans')
export class LessonPlansController {
  constructor(
    private readonly listLessonPlansUseCase: ListLessonPlansUseCase,
    private readonly createLessonPlanUseCase: CreateLessonPlanUseCase,
    private readonly getLessonPlanUseCase: GetLessonPlanUseCase,
    private readonly updateLessonPlanUseCase: UpdateLessonPlanUseCase,
    private readonly activateLessonPlanUseCase: ActivateLessonPlanUseCase,
    private readonly archiveLessonPlanUseCase: ArchiveLessonPlanUseCase,
    private readonly deleteLessonPlanUseCase: DeleteLessonPlanUseCase,
    private readonly createLessonPlanItemUseCase: CreateLessonPlanItemUseCase,
    private readonly updateLessonPlanItemUseCase: UpdateLessonPlanItemUseCase,
    private readonly reorderLessonPlanItemUseCase: ReorderLessonPlanItemUseCase,
    private readonly startLessonPlanItemUseCase: StartLessonPlanItemUseCase,
    private readonly completeLessonPlanItemUseCase: CompleteLessonPlanItemUseCase,
    private readonly skipLessonPlanItemUseCase: SkipLessonPlanItemUseCase,
    private readonly cancelLessonPlanItemUseCase: CancelLessonPlanItemUseCase,
    private readonly deleteLessonPlanItemUseCase: DeleteLessonPlanItemUseCase,
  ) {}

  @Get()
  @RequiredPermissions('academics.lesson_plans.view')
  @ApiOperation({ summary: 'List lesson plans' })
  @ApiOkResponse({ type: LessonPlansListResponseDto })
  listLessonPlans(
    @Query() query: ListLessonPlansQueryDto,
  ): Promise<LessonPlansListResponseDto> {
    return this.listLessonPlansUseCase.execute(query);
  }

  @Post()
  @RequiredPermissions('academics.lesson_plans.manage')
  @ApiOperation({ summary: 'Create a lesson plan' })
  @ApiBody({ type: CreateLessonPlanDto })
  @ApiOkResponse({ type: LessonPlanDetailResponseDto })
  createLessonPlan(
    @Body() dto: CreateLessonPlanDto,
  ): Promise<LessonPlanDetailResponseDto> {
    return this.createLessonPlanUseCase.execute(dto);
  }

  @Get(':lessonPlanId')
  @RequiredPermissions('academics.lesson_plans.view')
  @ApiOperation({ summary: 'Get lesson plan detail' })
  @ApiParam({ name: 'lessonPlanId', format: 'uuid' })
  @ApiOkResponse({ type: LessonPlanDetailResponseDto })
  getLessonPlan(
    @Param('lessonPlanId', new ParseUUIDPipe()) lessonPlanId: string,
  ): Promise<LessonPlanDetailResponseDto> {
    return this.getLessonPlanUseCase.execute(lessonPlanId);
  }

  @Patch(':lessonPlanId')
  @RequiredPermissions('academics.lesson_plans.manage')
  @ApiOperation({ summary: 'Update lesson plan metadata' })
  @ApiParam({ name: 'lessonPlanId', format: 'uuid' })
  @ApiBody({ type: UpdateLessonPlanDto })
  @ApiOkResponse({ type: LessonPlanDetailResponseDto })
  updateLessonPlan(
    @Param('lessonPlanId', new ParseUUIDPipe()) lessonPlanId: string,
    @Body() dto: UpdateLessonPlanDto,
  ): Promise<LessonPlanDetailResponseDto> {
    return this.updateLessonPlanUseCase.execute(lessonPlanId, dto);
  }

  @Post(':lessonPlanId/activate')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('academics.lesson_plans.manage')
  @ApiOperation({ summary: 'Activate a draft lesson plan' })
  @ApiParam({ name: 'lessonPlanId', format: 'uuid' })
  @ApiOkResponse({ type: LessonPlanDetailResponseDto })
  activateLessonPlan(
    @Param('lessonPlanId', new ParseUUIDPipe()) lessonPlanId: string,
  ): Promise<LessonPlanDetailResponseDto> {
    return this.activateLessonPlanUseCase.execute(lessonPlanId);
  }

  @Post(':lessonPlanId/archive')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('academics.lesson_plans.manage')
  @ApiOperation({ summary: 'Archive a lesson plan' })
  @ApiParam({ name: 'lessonPlanId', format: 'uuid' })
  @ApiOkResponse({ type: LessonPlanDetailResponseDto })
  archiveLessonPlan(
    @Param('lessonPlanId', new ParseUUIDPipe()) lessonPlanId: string,
  ): Promise<LessonPlanDetailResponseDto> {
    return this.archiveLessonPlanUseCase.execute(lessonPlanId);
  }

  @Delete(':lessonPlanId')
  @RequiredPermissions('academics.lesson_plans.manage')
  @ApiOperation({ summary: 'Soft delete a lesson plan' })
  @ApiParam({ name: 'lessonPlanId', format: 'uuid' })
  @ApiOkResponse({ type: DeleteLessonPlanResponseDto })
  deleteLessonPlan(
    @Param('lessonPlanId', new ParseUUIDPipe()) lessonPlanId: string,
  ): Promise<DeleteLessonPlanResponseDto> {
    return this.deleteLessonPlanUseCase.execute(lessonPlanId);
  }

  @Post(':lessonPlanId/items')
  @RequiredPermissions('academics.lesson_plans.manage')
  @ApiOperation({ summary: 'Create a lesson plan item' })
  @ApiParam({ name: 'lessonPlanId', format: 'uuid' })
  @ApiBody({ type: CreateLessonPlanItemDto })
  @ApiOkResponse({ type: LessonPlanItemResponseDto })
  createLessonPlanItem(
    @Param('lessonPlanId', new ParseUUIDPipe()) lessonPlanId: string,
    @Body() dto: CreateLessonPlanItemDto,
  ): Promise<LessonPlanItemResponseDto> {
    return this.createLessonPlanItemUseCase.execute(lessonPlanId, dto);
  }

  @Patch(':lessonPlanId/items/:itemId')
  @RequiredPermissions('academics.lesson_plans.manage')
  @ApiOperation({ summary: 'Update a lesson plan item' })
  @ApiParam({ name: 'lessonPlanId', format: 'uuid' })
  @ApiParam({ name: 'itemId', format: 'uuid' })
  @ApiBody({ type: UpdateLessonPlanItemDto })
  @ApiOkResponse({ type: LessonPlanItemResponseDto })
  updateLessonPlanItem(
    @Param('lessonPlanId', new ParseUUIDPipe()) lessonPlanId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() dto: UpdateLessonPlanItemDto,
  ): Promise<LessonPlanItemResponseDto> {
    return this.updateLessonPlanItemUseCase.execute(lessonPlanId, itemId, dto);
  }

  @Patch(':lessonPlanId/items/:itemId/reorder')
  @RequiredPermissions('academics.lesson_plans.manage')
  @ApiOperation({ summary: 'Reorder a lesson plan item' })
  @ApiParam({ name: 'lessonPlanId', format: 'uuid' })
  @ApiParam({ name: 'itemId', format: 'uuid' })
  @ApiBody({ type: ReorderLessonPlanItemDto })
  @ApiOkResponse({ type: LessonPlanItemResponseDto })
  reorderLessonPlanItem(
    @Param('lessonPlanId', new ParseUUIDPipe()) lessonPlanId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() dto: ReorderLessonPlanItemDto,
  ): Promise<LessonPlanItemResponseDto> {
    return this.reorderLessonPlanItemUseCase.execute(
      lessonPlanId,
      itemId,
      dto,
    );
  }

  @Post(':lessonPlanId/items/:itemId/start')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('academics.lesson_plans.manage')
  @ApiOperation({ summary: 'Start a lesson plan item' })
  @ApiParam({ name: 'lessonPlanId', format: 'uuid' })
  @ApiParam({ name: 'itemId', format: 'uuid' })
  @ApiOkResponse({ type: LessonPlanItemResponseDto })
  startLessonPlanItem(
    @Param('lessonPlanId', new ParseUUIDPipe()) lessonPlanId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
  ): Promise<LessonPlanItemResponseDto> {
    return this.startLessonPlanItemUseCase.execute(lessonPlanId, itemId);
  }

  @Post(':lessonPlanId/items/:itemId/complete')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('academics.lesson_plans.manage')
  @ApiOperation({ summary: 'Complete a lesson plan item' })
  @ApiParam({ name: 'lessonPlanId', format: 'uuid' })
  @ApiParam({ name: 'itemId', format: 'uuid' })
  @ApiOkResponse({ type: LessonPlanItemResponseDto })
  completeLessonPlanItem(
    @Param('lessonPlanId', new ParseUUIDPipe()) lessonPlanId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
  ): Promise<LessonPlanItemResponseDto> {
    return this.completeLessonPlanItemUseCase.execute(lessonPlanId, itemId);
  }

  @Post(':lessonPlanId/items/:itemId/skip')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('academics.lesson_plans.manage')
  @ApiOperation({ summary: 'Skip a lesson plan item' })
  @ApiParam({ name: 'lessonPlanId', format: 'uuid' })
  @ApiParam({ name: 'itemId', format: 'uuid' })
  @ApiBody({ type: LessonPlanItemStatusNoteDto })
  @ApiOkResponse({ type: LessonPlanItemResponseDto })
  skipLessonPlanItem(
    @Param('lessonPlanId', new ParseUUIDPipe()) lessonPlanId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() dto: LessonPlanItemStatusNoteDto,
  ): Promise<LessonPlanItemResponseDto> {
    return this.skipLessonPlanItemUseCase.execute(lessonPlanId, itemId, dto);
  }

  @Post(':lessonPlanId/items/:itemId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('academics.lesson_plans.manage')
  @ApiOperation({ summary: 'Cancel a lesson plan item' })
  @ApiParam({ name: 'lessonPlanId', format: 'uuid' })
  @ApiParam({ name: 'itemId', format: 'uuid' })
  @ApiBody({ type: LessonPlanItemStatusNoteDto })
  @ApiOkResponse({ type: LessonPlanItemResponseDto })
  cancelLessonPlanItem(
    @Param('lessonPlanId', new ParseUUIDPipe()) lessonPlanId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() dto: LessonPlanItemStatusNoteDto,
  ): Promise<LessonPlanItemResponseDto> {
    return this.cancelLessonPlanItemUseCase.execute(lessonPlanId, itemId, dto);
  }

  @Delete(':lessonPlanId/items/:itemId')
  @RequiredPermissions('academics.lesson_plans.manage')
  @ApiOperation({ summary: 'Soft delete a lesson plan item' })
  @ApiParam({ name: 'lessonPlanId', format: 'uuid' })
  @ApiParam({ name: 'itemId', format: 'uuid' })
  @ApiOkResponse({ type: DeleteLessonPlanItemResponseDto })
  deleteLessonPlanItem(
    @Param('lessonPlanId', new ParseUUIDPipe()) lessonPlanId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
  ): Promise<DeleteLessonPlanItemResponseDto> {
    return this.deleteLessonPlanItemUseCase.execute(lessonPlanId, itemId);
  }
}
