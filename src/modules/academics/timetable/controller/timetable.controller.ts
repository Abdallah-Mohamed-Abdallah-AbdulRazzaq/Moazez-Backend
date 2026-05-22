import {
  Body,
  Controller,
  Delete,
  Get,
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
import { CreateTimetablePeriodUseCase } from '../application/create-timetable-period.use-case';
import { DeleteTimetablePeriodUseCase } from '../application/delete-timetable-period.use-case';
import { GetTimetableConfigUseCase } from '../application/get-timetable-config.use-case';
import { GetTimetablePreviewUseCase } from '../application/get-timetable-preview.use-case';
import { ListTimetableConflictsUseCase } from '../application/list-timetable-conflicts.use-case';
import { ListTimetablePeriodsUseCase } from '../application/list-timetable-periods.use-case';
import { UpdateTimetablePeriodUseCase } from '../application/update-timetable-period.use-case';
import { UpsertTimetableConfigUseCase } from '../application/upsert-timetable-config.use-case';
import {
  CreateTimetablePeriodDto,
  GetTimetableConfigQueryDto,
  TimetableConfigIdQueryDto,
  UpdateTimetablePeriodDto,
  UpsertTimetableConfigDto,
} from '../dto/timetable.dto';
import {
  DeleteTimetablePeriodResponseDto,
  TimetableConfigEnvelopeDto,
  TimetableConflictsListResponseDto,
  TimetablePeriodResponseDto,
  TimetablePeriodsListResponseDto,
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
    private readonly getPreviewUseCase: GetTimetablePreviewUseCase,
    private readonly listConflictsUseCase: ListTimetableConflictsUseCase,
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
}
