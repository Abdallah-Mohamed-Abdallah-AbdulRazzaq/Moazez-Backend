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
  Put,
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
import { CreateTimetableEntryUseCase } from '../application/create-timetable-entry.use-case';
import { CreateTimetablePeriodUseCase } from '../application/create-timetable-period.use-case';
import { DeleteTimetableEntryUseCase } from '../application/delete-timetable-entry.use-case';
import { DeleteTimetablePeriodUseCase } from '../application/delete-timetable-period.use-case';
import { GetTimetableConfigUseCase } from '../application/get-timetable-config.use-case';
import { GetTimetableEntryUseCase } from '../application/get-timetable-entry.use-case';
import { GetTimetablePreviewUseCase } from '../application/get-timetable-preview.use-case';
import { GetTimetablePublicationUseCase } from '../application/get-timetable-publication.use-case';
import { ListTimetableConflictsUseCase } from '../application/list-timetable-conflicts.use-case';
import { ListTimetableEntriesUseCase } from '../application/list-timetable-entries.use-case';
import { ListTimetablePeriodsUseCase } from '../application/list-timetable-periods.use-case';
import { PublishTimetableUseCase } from '../application/publish-timetable.use-case';
import { UpdateTimetableEntryUseCase } from '../application/update-timetable-entry.use-case';
import { UpdateTimetablePeriodUseCase } from '../application/update-timetable-period.use-case';
import { UpsertTimetableConfigUseCase } from '../application/upsert-timetable-config.use-case';
import {
  CreateTimetableEntryDto,
  CreateTimetablePeriodDto,
  GetTimetableConfigQueryDto,
  ListTimetableEntriesQueryDto,
  PublishTimetableDto,
  TimetableConfigIdQueryDto,
  UpdateTimetableEntryDto,
  UpdateTimetablePeriodDto,
  UpsertTimetableConfigDto,
} from '../dto/timetable.dto';
import {
  DeleteTimetableEntryResponseDto,
  DeleteTimetablePeriodResponseDto,
  TimetableConfigEnvelopeDto,
  TimetableConflictsListResponseDto,
  TimetableEntriesListResponseDto,
  TimetableEntryResponseDto,
  TimetablePeriodResponseDto,
  TimetablePeriodsListResponseDto,
  TimetablePublicationResponseDto,
  TimetablePreviewResponseDto,
} from '../dto/timetable-response.dto';

@ApiTags('academics-timetable')
@ApiBearerAuth()
@Controller('academics/timetable')
export class TimetableController {
  constructor(
    private readonly getConfigUseCase: GetTimetableConfigUseCase,
    private readonly upsertConfigUseCase: UpsertTimetableConfigUseCase,
    private readonly listPeriodsUseCase: ListTimetablePeriodsUseCase,
    private readonly createPeriodUseCase: CreateTimetablePeriodUseCase,
    private readonly updatePeriodUseCase: UpdateTimetablePeriodUseCase,
    private readonly deletePeriodUseCase: DeleteTimetablePeriodUseCase,
    private readonly listEntriesUseCase: ListTimetableEntriesUseCase,
    private readonly getEntryUseCase: GetTimetableEntryUseCase,
    private readonly createEntryUseCase: CreateTimetableEntryUseCase,
    private readonly updateEntryUseCase: UpdateTimetableEntryUseCase,
    private readonly deleteEntryUseCase: DeleteTimetableEntryUseCase,
    private readonly getPreviewUseCase: GetTimetablePreviewUseCase,
    private readonly listConflictsUseCase: ListTimetableConflictsUseCase,
    private readonly getPublicationUseCase: GetTimetablePublicationUseCase,
    private readonly publishTimetableUseCase: PublishTimetableUseCase,
  ) {}

  @Get('config')
  @RequiredPermissions('academics.structure.view')
  @ApiOperation({ summary: 'Get a timetable config for an academic scope' })
  @ApiOkResponse({ type: TimetableConfigEnvelopeDto })
  getConfig(
    @Query() query: GetTimetableConfigQueryDto,
  ): Promise<TimetableConfigEnvelopeDto> {
    return this.getConfigUseCase.execute(query);
  }

  @Put('config')
  @RequiredPermissions('academics.structure.manage')
  @ApiOperation({ summary: 'Create or update a draft timetable config' })
  @ApiBody({ type: UpsertTimetableConfigDto })
  @ApiOkResponse({ type: TimetableConfigEnvelopeDto })
  upsertConfig(
    @Body() dto: UpsertTimetableConfigDto,
  ): Promise<TimetableConfigEnvelopeDto> {
    return this.upsertConfigUseCase.execute(dto);
  }

  @Get('periods')
  @RequiredPermissions('academics.structure.view')
  @ApiOperation({ summary: 'List periods for a timetable config' })
  @ApiOkResponse({ type: TimetablePeriodsListResponseDto })
  listPeriods(
    @Query() query: TimetableConfigIdQueryDto,
  ): Promise<TimetablePeriodsListResponseDto> {
    return this.listPeriodsUseCase.execute(query);
  }

  @Post('periods')
  @RequiredPermissions('academics.structure.manage')
  @ApiOperation({ summary: 'Create a timetable period' })
  @ApiBody({ type: CreateTimetablePeriodDto })
  @ApiOkResponse({ type: TimetablePeriodResponseDto })
  createPeriod(
    @Body() dto: CreateTimetablePeriodDto,
  ): Promise<TimetablePeriodResponseDto> {
    return this.createPeriodUseCase.execute(dto);
  }

  @Patch('periods/:periodId')
  @RequiredPermissions('academics.structure.manage')
  @ApiOperation({ summary: 'Update a timetable period' })
  @ApiParam({ name: 'periodId', format: 'uuid' })
  @ApiBody({ type: UpdateTimetablePeriodDto })
  @ApiOkResponse({ type: TimetablePeriodResponseDto })
  updatePeriod(
    @Param('periodId', new ParseUUIDPipe()) periodId: string,
    @Body() dto: UpdateTimetablePeriodDto,
  ): Promise<TimetablePeriodResponseDto> {
    return this.updatePeriodUseCase.execute(periodId, dto);
  }

  @Delete('periods/:periodId')
  @RequiredPermissions('academics.structure.manage')
  @ApiOperation({ summary: 'Delete an unused timetable period' })
  @ApiParam({ name: 'periodId', format: 'uuid' })
  @ApiOkResponse({ type: DeleteTimetablePeriodResponseDto })
  deletePeriod(
    @Param('periodId', new ParseUUIDPipe()) periodId: string,
  ): Promise<DeleteTimetablePeriodResponseDto> {
    return this.deletePeriodUseCase.execute(periodId);
  }

  @Get('entries')
  @RequiredPermissions('academics.structure.view')
  @ApiOperation({ summary: 'List timetable entries for a config' })
  @ApiOkResponse({ type: TimetableEntriesListResponseDto })
  listEntries(
    @Query() query: ListTimetableEntriesQueryDto,
  ): Promise<TimetableEntriesListResponseDto> {
    return this.listEntriesUseCase.execute(query);
  }

  @Get('entries/:entryId')
  @RequiredPermissions('academics.structure.view')
  @ApiOperation({ summary: 'Get a timetable entry' })
  @ApiParam({ name: 'entryId', format: 'uuid' })
  @ApiOkResponse({ type: TimetableEntryResponseDto })
  getEntry(
    @Param('entryId', new ParseUUIDPipe()) entryId: string,
  ): Promise<TimetableEntryResponseDto> {
    return this.getEntryUseCase.execute(entryId);
  }

  @Post('entries')
  @RequiredPermissions('academics.structure.manage')
  @ApiOperation({ summary: 'Create a draft timetable entry' })
  @ApiBody({ type: CreateTimetableEntryDto })
  @ApiOkResponse({ type: TimetableEntryResponseDto })
  createEntry(
    @Body() dto: CreateTimetableEntryDto,
  ): Promise<TimetableEntryResponseDto> {
    return this.createEntryUseCase.execute(dto);
  }

  @Patch('entries/:entryId')
  @RequiredPermissions('academics.structure.manage')
  @ApiOperation({ summary: 'Update a draft timetable entry' })
  @ApiParam({ name: 'entryId', format: 'uuid' })
  @ApiBody({ type: UpdateTimetableEntryDto })
  @ApiOkResponse({ type: TimetableEntryResponseDto })
  updateEntry(
    @Param('entryId', new ParseUUIDPipe()) entryId: string,
    @Body() dto: UpdateTimetableEntryDto,
  ): Promise<TimetableEntryResponseDto> {
    return this.updateEntryUseCase.execute(entryId, dto);
  }

  @Delete('entries/:entryId')
  @RequiredPermissions('academics.structure.manage')
  @ApiOperation({ summary: 'Delete a timetable entry' })
  @ApiParam({ name: 'entryId', format: 'uuid' })
  @ApiOkResponse({ type: DeleteTimetableEntryResponseDto })
  deleteEntry(
    @Param('entryId', new ParseUUIDPipe()) entryId: string,
  ): Promise<DeleteTimetableEntryResponseDto> {
    return this.deleteEntryUseCase.execute(entryId);
  }

  @Get('preview')
  @RequiredPermissions('academics.structure.view')
  @ApiOperation({ summary: 'Preview a timetable config grid' })
  @ApiOkResponse({ type: TimetablePreviewResponseDto })
  preview(
    @Query() query: TimetableConfigIdQueryDto,
  ): Promise<TimetablePreviewResponseDto> {
    return this.getPreviewUseCase.execute(query);
  }

  @Get('conflicts')
  @RequiredPermissions('academics.structure.view')
  @ApiOperation({ summary: 'List persisted and computed timetable conflicts' })
  @ApiOkResponse({ type: TimetableConflictsListResponseDto })
  conflicts(
    @Query() query: TimetableConfigIdQueryDto,
  ): Promise<TimetableConflictsListResponseDto> {
    return this.listConflictsUseCase.execute(query);
  }

  @Get('publication')
  @RequiredPermissions('academics.structure.view')
  @ApiOperation({ summary: 'Get timetable publication state and readiness' })
  @ApiOkResponse({ type: TimetablePublicationResponseDto })
  publication(
    @Query() query: TimetableConfigIdQueryDto,
  ): Promise<TimetablePublicationResponseDto> {
    return this.getPublicationUseCase.execute(query);
  }

  @Post('publish')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('academics.structure.manage')
  @ApiOperation({ summary: 'Publish a draft timetable config' })
  @ApiBody({ type: PublishTimetableDto })
  @ApiOkResponse({ type: TimetablePublicationResponseDto })
  publish(
    @Body() dto: PublishTimetableDto,
  ): Promise<TimetablePublicationResponseDto> {
    return this.publishTimetableUseCase.execute(dto);
  }
}
