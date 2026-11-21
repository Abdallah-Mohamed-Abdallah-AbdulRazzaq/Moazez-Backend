import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseFilters,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod/v4';
import { ResultFamilyService } from '../application/result-family.service';
import { ResultBodyPipe } from '../dto/result-authoring.dto';
import { ResultPeriodsQueryDto } from '../dto/result-configuration.dto';
import {
  familyOutputs,
  ResultFamilyHistoryQueryDto,
} from '../dto/result-family.dto';
import { ResultEndpoint } from '../dto/result-openapi.contract';
import { ResultErrorFilter } from './result-error.filter';

const emptyQuery = new ResultBodyPipe(z.strictObject({}));

@ApiTags('student-official-results')
@ApiBearerAuth()
@UseFilters(ResultErrorFilter)
@Controller('student/official-results')
export class StudentOfficialResultsController {
  constructor(private readonly results: ResultFamilyService) {}

  @Get('periods')
  @ResultEndpoint(
    'studentListOfficialResultPeriods',
    'results.view',
    familyOutputs.periods,
  )
  async periods(@Query() query: ResultPeriodsQueryDto) {
    return { data: await this.results.periods('STUDENT', undefined, query) };
  }

  @Get('periods/:reportingPeriodId/result')
  @ResultEndpoint(
    'studentGetOfficialResult',
    'results.view',
    familyOutputs.result,
  )
  async result(
    @Param('reportingPeriodId', ParseUUIDPipe) periodId: string,
    @Query(emptyQuery) _query: unknown,
  ) {
    return {
      data: await this.results.result('STUDENT', undefined, { periodId }),
    };
  }

  @Get('periods/:reportingPeriodId/groups/:groupId')
  @ResultEndpoint(
    'studentGetOfficialResultGroup',
    'results.view',
    familyOutputs.result,
  )
  async group(
    @Param('reportingPeriodId', ParseUUIDPipe) periodId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Query(emptyQuery) _query: unknown,
  ) {
    return {
      data: await this.results.result('STUDENT', undefined, {
        periodId,
        groupId,
      }),
    };
  }

  @Get('periods/:reportingPeriodId/history')
  @ResultEndpoint(
    'studentListOfficialResultHistory',
    'results.view',
    familyOutputs.history,
  )
  async history(
    @Param('reportingPeriodId', ParseUUIDPipe) periodId: string,
    @Query() query: ResultFamilyHistoryQueryDto,
  ) {
    return {
      data: await this.results.history('STUDENT', undefined, periodId, query),
    };
  }

  @Get('publications/:publicationId')
  @ResultEndpoint(
    'studentGetOfficialResultPublication',
    'results.view',
    familyOutputs.result,
  )
  async publication(
    @Param('publicationId', ParseUUIDPipe) publicationId: string,
    @Query(emptyQuery) _query: unknown,
  ) {
    return {
      data: await this.results.result('STUDENT', undefined, {
        publicationId,
        includeHistory: true,
      }),
    };
  }
}

@ApiTags('parent-official-results')
@ApiBearerAuth()
@UseFilters(ResultErrorFilter)
@Controller('parent/children/:studentId/official-results')
export class ParentOfficialResultsController {
  constructor(private readonly results: ResultFamilyService) {}

  @Get('periods')
  @ResultEndpoint(
    'parentListOfficialResultPeriods',
    'results.view',
    familyOutputs.periods,
  )
  async periods(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query() query: ResultPeriodsQueryDto,
  ) {
    return { data: await this.results.periods('PARENT', studentId, query) };
  }

  @Get('periods/:reportingPeriodId/result')
  @ResultEndpoint(
    'parentGetOfficialResult',
    'results.view',
    familyOutputs.result,
  )
  async result(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('reportingPeriodId', ParseUUIDPipe) periodId: string,
    @Query(emptyQuery) _query: unknown,
  ) {
    return {
      data: await this.results.result('PARENT', studentId, { periodId }),
    };
  }

  @Get('periods/:reportingPeriodId/groups/:groupId')
  @ResultEndpoint(
    'parentGetOfficialResultGroup',
    'results.view',
    familyOutputs.result,
  )
  async group(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('reportingPeriodId', ParseUUIDPipe) periodId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Query(emptyQuery) _query: unknown,
  ) {
    return {
      data: await this.results.result('PARENT', studentId, {
        periodId,
        groupId,
      }),
    };
  }

  @Get('periods/:reportingPeriodId/history')
  @ResultEndpoint(
    'parentListOfficialResultHistory',
    'results.view',
    familyOutputs.history,
  )
  async history(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('reportingPeriodId', ParseUUIDPipe) periodId: string,
    @Query() query: ResultFamilyHistoryQueryDto,
  ) {
    return {
      data: await this.results.history('PARENT', studentId, periodId, query),
    };
  }

  @Get('publications/:publicationId')
  @ResultEndpoint(
    'parentGetOfficialResultPublication',
    'results.view',
    familyOutputs.result,
  )
  async publication(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('publicationId', ParseUUIDPipe) publicationId: string,
    @Query(emptyQuery) _query: unknown,
  ) {
    return {
      data: await this.results.result('PARENT', studentId, {
        publicationId,
        includeHistory: true,
      }),
    };
  }
}
