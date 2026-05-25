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
  ActivateCurriculumUseCase,
  ArchiveCurriculumUseCase,
  CreateCurriculumLessonUseCase,
  CreateCurriculumUnitUseCase,
  CreateCurriculumUseCase,
  DeleteCurriculumLessonUseCase,
  DeleteCurriculumUnitUseCase,
  DeleteCurriculumUseCase,
  GetCurriculumUseCase,
  ListCurriculaUseCase,
  ReorderCurriculumLessonUseCase,
  ReorderCurriculumUnitUseCase,
  UpdateCurriculumLessonUseCase,
  UpdateCurriculumUnitUseCase,
  UpdateCurriculumUseCase,
} from '../application/curriculum.use-cases';
import {
  CreateCurriculumDto,
  CreateCurriculumLessonDto,
  CreateCurriculumUnitDto,
  ListCurriculaQueryDto,
  ReorderCurriculumNodeDto,
  UpdateCurriculumDto,
  UpdateCurriculumLessonDto,
  UpdateCurriculumUnitDto,
} from '../dto/curriculum.dto';
import {
  CurriculaListResponseDto,
  CurriculumDetailResponseDto,
  CurriculumLessonResponseDto,
  CurriculumResponseDto,
  CurriculumUnitResponseDto,
  DeleteCurriculumNodeResponseDto,
} from '../dto/curriculum-response.dto';

@ApiTags('academics-curriculum')
@ApiBearerAuth()
@Controller('academics/curriculum')
export class CurriculumController {
  constructor(
    private readonly listCurriculaUseCase: ListCurriculaUseCase,
    private readonly createCurriculumUseCase: CreateCurriculumUseCase,
    private readonly getCurriculumUseCase: GetCurriculumUseCase,
    private readonly updateCurriculumUseCase: UpdateCurriculumUseCase,
    private readonly activateCurriculumUseCase: ActivateCurriculumUseCase,
    private readonly archiveCurriculumUseCase: ArchiveCurriculumUseCase,
    private readonly deleteCurriculumUseCase: DeleteCurriculumUseCase,
    private readonly createUnitUseCase: CreateCurriculumUnitUseCase,
    private readonly updateUnitUseCase: UpdateCurriculumUnitUseCase,
    private readonly reorderUnitUseCase: ReorderCurriculumUnitUseCase,
    private readonly deleteUnitUseCase: DeleteCurriculumUnitUseCase,
    private readonly createLessonUseCase: CreateCurriculumLessonUseCase,
    private readonly updateLessonUseCase: UpdateCurriculumLessonUseCase,
    private readonly reorderLessonUseCase: ReorderCurriculumLessonUseCase,
    private readonly deleteLessonUseCase: DeleteCurriculumLessonUseCase,
  ) {}

  @Get()
  @RequiredPermissions('academics.curriculum.view')
  @ApiOperation({ summary: 'List curricula' })
  @ApiOkResponse({ type: CurriculaListResponseDto })
  listCurricula(
    @Query() query: ListCurriculaQueryDto,
  ): Promise<CurriculaListResponseDto> {
    return this.listCurriculaUseCase.execute(query);
  }

  @Post()
  @RequiredPermissions('academics.curriculum.manage')
  @ApiOperation({ summary: 'Create a curriculum' })
  @ApiBody({ type: CreateCurriculumDto })
  @ApiOkResponse({ type: CurriculumDetailResponseDto })
  createCurriculum(
    @Body() dto: CreateCurriculumDto,
  ): Promise<CurriculumDetailResponseDto> {
    return this.createCurriculumUseCase.execute(dto);
  }

  @Get(':curriculumId')
  @RequiredPermissions('academics.curriculum.view')
  @ApiOperation({ summary: 'Get curriculum detail' })
  @ApiParam({ name: 'curriculumId', format: 'uuid' })
  @ApiOkResponse({ type: CurriculumDetailResponseDto })
  getCurriculum(
    @Param('curriculumId', new ParseUUIDPipe()) curriculumId: string,
  ): Promise<CurriculumDetailResponseDto> {
    return this.getCurriculumUseCase.execute(curriculumId);
  }

  @Patch(':curriculumId')
  @RequiredPermissions('academics.curriculum.manage')
  @ApiOperation({ summary: 'Update curriculum metadata' })
  @ApiParam({ name: 'curriculumId', format: 'uuid' })
  @ApiBody({ type: UpdateCurriculumDto })
  @ApiOkResponse({ type: CurriculumDetailResponseDto })
  updateCurriculum(
    @Param('curriculumId', new ParseUUIDPipe()) curriculumId: string,
    @Body() dto: UpdateCurriculumDto,
  ): Promise<CurriculumDetailResponseDto> {
    return this.updateCurriculumUseCase.execute(curriculumId, dto);
  }

  @Post(':curriculumId/activate')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('academics.curriculum.manage')
  @ApiOperation({ summary: 'Activate a draft curriculum' })
  @ApiParam({ name: 'curriculumId', format: 'uuid' })
  @ApiOkResponse({ type: CurriculumResponseDto })
  activateCurriculum(
    @Param('curriculumId', new ParseUUIDPipe()) curriculumId: string,
  ): Promise<CurriculumDetailResponseDto> {
    return this.activateCurriculumUseCase.execute(curriculumId);
  }

  @Post(':curriculumId/archive')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('academics.curriculum.manage')
  @ApiOperation({ summary: 'Archive a curriculum' })
  @ApiParam({ name: 'curriculumId', format: 'uuid' })
  @ApiOkResponse({ type: CurriculumResponseDto })
  archiveCurriculum(
    @Param('curriculumId', new ParseUUIDPipe()) curriculumId: string,
  ): Promise<CurriculumDetailResponseDto> {
    return this.archiveCurriculumUseCase.execute(curriculumId);
  }

  @Delete(':curriculumId')
  @RequiredPermissions('academics.curriculum.manage')
  @ApiOperation({ summary: 'Soft delete a curriculum' })
  @ApiParam({ name: 'curriculumId', format: 'uuid' })
  @ApiOkResponse({ type: DeleteCurriculumNodeResponseDto })
  deleteCurriculum(
    @Param('curriculumId', new ParseUUIDPipe()) curriculumId: string,
  ): Promise<DeleteCurriculumNodeResponseDto> {
    return this.deleteCurriculumUseCase.execute(curriculumId);
  }

  @Post(':curriculumId/units')
  @RequiredPermissions('academics.curriculum.manage')
  @ApiOperation({ summary: 'Create a curriculum unit' })
  @ApiParam({ name: 'curriculumId', format: 'uuid' })
  @ApiBody({ type: CreateCurriculumUnitDto })
  @ApiOkResponse({ type: CurriculumUnitResponseDto })
  createUnit(
    @Param('curriculumId', new ParseUUIDPipe()) curriculumId: string,
    @Body() dto: CreateCurriculumUnitDto,
  ): Promise<CurriculumUnitResponseDto> {
    return this.createUnitUseCase.execute(curriculumId, dto);
  }

  @Patch(':curriculumId/units/:unitId')
  @RequiredPermissions('academics.curriculum.manage')
  @ApiOperation({ summary: 'Update a curriculum unit' })
  @ApiParam({ name: 'curriculumId', format: 'uuid' })
  @ApiParam({ name: 'unitId', format: 'uuid' })
  @ApiBody({ type: UpdateCurriculumUnitDto })
  @ApiOkResponse({ type: CurriculumUnitResponseDto })
  updateUnit(
    @Param('curriculumId', new ParseUUIDPipe()) curriculumId: string,
    @Param('unitId', new ParseUUIDPipe()) unitId: string,
    @Body() dto: UpdateCurriculumUnitDto,
  ): Promise<CurriculumUnitResponseDto> {
    return this.updateUnitUseCase.execute(curriculumId, unitId, dto);
  }

  @Patch(':curriculumId/units/:unitId/reorder')
  @RequiredPermissions('academics.curriculum.manage')
  @ApiOperation({ summary: 'Reorder a curriculum unit' })
  @ApiParam({ name: 'curriculumId', format: 'uuid' })
  @ApiParam({ name: 'unitId', format: 'uuid' })
  @ApiBody({ type: ReorderCurriculumNodeDto })
  @ApiOkResponse({ type: CurriculumUnitResponseDto })
  reorderUnit(
    @Param('curriculumId', new ParseUUIDPipe()) curriculumId: string,
    @Param('unitId', new ParseUUIDPipe()) unitId: string,
    @Body() dto: ReorderCurriculumNodeDto,
  ): Promise<CurriculumUnitResponseDto> {
    return this.reorderUnitUseCase.execute(curriculumId, unitId, dto);
  }

  @Delete(':curriculumId/units/:unitId')
  @RequiredPermissions('academics.curriculum.manage')
  @ApiOperation({ summary: 'Soft delete a curriculum unit' })
  @ApiParam({ name: 'curriculumId', format: 'uuid' })
  @ApiParam({ name: 'unitId', format: 'uuid' })
  @ApiOkResponse({ type: DeleteCurriculumNodeResponseDto })
  deleteUnit(
    @Param('curriculumId', new ParseUUIDPipe()) curriculumId: string,
    @Param('unitId', new ParseUUIDPipe()) unitId: string,
  ): Promise<DeleteCurriculumNodeResponseDto> {
    return this.deleteUnitUseCase.execute(curriculumId, unitId);
  }

  @Post(':curriculumId/units/:unitId/lessons')
  @RequiredPermissions('academics.curriculum.manage')
  @ApiOperation({ summary: 'Create a curriculum lesson' })
  @ApiParam({ name: 'curriculumId', format: 'uuid' })
  @ApiParam({ name: 'unitId', format: 'uuid' })
  @ApiBody({ type: CreateCurriculumLessonDto })
  @ApiOkResponse({ type: CurriculumLessonResponseDto })
  createLesson(
    @Param('curriculumId', new ParseUUIDPipe()) curriculumId: string,
    @Param('unitId', new ParseUUIDPipe()) unitId: string,
    @Body() dto: CreateCurriculumLessonDto,
  ): Promise<CurriculumLessonResponseDto> {
    return this.createLessonUseCase.execute(curriculumId, unitId, dto);
  }

  @Patch(':curriculumId/units/:unitId/lessons/:lessonId')
  @RequiredPermissions('academics.curriculum.manage')
  @ApiOperation({ summary: 'Update a curriculum lesson' })
  @ApiParam({ name: 'curriculumId', format: 'uuid' })
  @ApiParam({ name: 'unitId', format: 'uuid' })
  @ApiParam({ name: 'lessonId', format: 'uuid' })
  @ApiBody({ type: UpdateCurriculumLessonDto })
  @ApiOkResponse({ type: CurriculumLessonResponseDto })
  updateLesson(
    @Param('curriculumId', new ParseUUIDPipe()) curriculumId: string,
    @Param('unitId', new ParseUUIDPipe()) unitId: string,
    @Param('lessonId', new ParseUUIDPipe()) lessonId: string,
    @Body() dto: UpdateCurriculumLessonDto,
  ): Promise<CurriculumLessonResponseDto> {
    return this.updateLessonUseCase.execute(
      curriculumId,
      unitId,
      lessonId,
      dto,
    );
  }

  @Patch(':curriculumId/units/:unitId/lessons/:lessonId/reorder')
  @RequiredPermissions('academics.curriculum.manage')
  @ApiOperation({ summary: 'Reorder a curriculum lesson' })
  @ApiParam({ name: 'curriculumId', format: 'uuid' })
  @ApiParam({ name: 'unitId', format: 'uuid' })
  @ApiParam({ name: 'lessonId', format: 'uuid' })
  @ApiBody({ type: ReorderCurriculumNodeDto })
  @ApiOkResponse({ type: CurriculumLessonResponseDto })
  reorderLesson(
    @Param('curriculumId', new ParseUUIDPipe()) curriculumId: string,
    @Param('unitId', new ParseUUIDPipe()) unitId: string,
    @Param('lessonId', new ParseUUIDPipe()) lessonId: string,
    @Body() dto: ReorderCurriculumNodeDto,
  ): Promise<CurriculumLessonResponseDto> {
    return this.reorderLessonUseCase.execute(
      curriculumId,
      unitId,
      lessonId,
      dto,
    );
  }

  @Delete(':curriculumId/units/:unitId/lessons/:lessonId')
  @RequiredPermissions('academics.curriculum.manage')
  @ApiOperation({ summary: 'Soft delete a curriculum lesson' })
  @ApiParam({ name: 'curriculumId', format: 'uuid' })
  @ApiParam({ name: 'unitId', format: 'uuid' })
  @ApiParam({ name: 'lessonId', format: 'uuid' })
  @ApiOkResponse({ type: DeleteCurriculumNodeResponseDto })
  deleteLesson(
    @Param('curriculumId', new ParseUUIDPipe()) curriculumId: string,
    @Param('unitId', new ParseUUIDPipe()) unitId: string,
    @Param('lessonId', new ParseUUIDPipe()) lessonId: string,
  ): Promise<DeleteCurriculumNodeResponseDto> {
    return this.deleteLessonUseCase.execute(curriculumId, unitId, lessonId);
  }
}
