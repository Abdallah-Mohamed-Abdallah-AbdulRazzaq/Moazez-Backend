import { Body, Controller, Headers, Post, UseFilters } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { SchoolManagementOnly } from '../../../common/decorators/school-management-only.decorator';
import { ResultAggregateService } from '../application/result-aggregate.service';
import {
  aggregateInputs,
  type AggregateInput,
} from '../domain/result-aggregate.contract';
import { ResultBodyPipe } from '../dto/result-authoring.dto';
import { aggregateOutputs } from '../dto/result-aggregate.dto';
import {
  ResultEndpoint,
  resultOpenApiSchema,
} from '../dto/result-openapi.contract';
import { ResultErrorFilter } from './result-error.filter';

@SchoolManagementOnly()
@ApiTags('official-results')
@ApiBearerAuth()
@UseFilters(ResultErrorFilter)
@Controller('official-results')
export class ResultAggregateController {
  constructor(private readonly aggregates: ResultAggregateService) {}

  @Post('aggregate-profiles')
  @ApiBody({ schema: resultOpenApiSchema(aggregateInputs.profile) })
  @ResultEndpoint(
    'createOfficialResultsAggregateProfile',
    'aggregates.manage',
    aggregateOutputs.profile,
    201,
    'REQUIRED',
  )
  async profile(
    @Body(new ResultBodyPipe(aggregateInputs.profile))
    input: AggregateInput<'profile'>,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.aggregates.profile(input, key) };
  }

  @Post('aggregate-candidates')
  @ApiBody({ schema: resultOpenApiSchema(aggregateInputs.candidate) })
  @ResultEndpoint(
    'createOfficialResultsAggregateCandidate',
    'aggregates.manage',
    aggregateOutputs.candidate,
    201,
    'REQUIRED',
  )
  async candidate(
    @Body(new ResultBodyPipe(aggregateInputs.candidate))
    input: AggregateInput<'candidate'>,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.aggregates.capture(input, key) };
  }

  @Post('aggregate-publications')
  @ApiBody({ schema: resultOpenApiSchema(aggregateInputs.publish) })
  @ResultEndpoint(
    'publishOfficialResultsAggregate',
    'aggregates.manage',
    aggregateOutputs.publication,
    201,
    'REQUIRED',
    ['publications.publish'],
  )
  async publish(
    @Body(new ResultBodyPipe(aggregateInputs.publish))
    input: AggregateInput<'publish'>,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.aggregates.publish(input, key) };
  }
}
