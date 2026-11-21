import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseFilters,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { SchoolManagementOnly } from '../../../common/decorators/school-management-only.decorator';
import { ResultReleaseService } from '../application/result-release.service';
import {
  releaseInputs,
  type ReleaseInput,
} from '../domain/result-release.contract';
import { ResultBodyPipe } from '../dto/result-authoring.dto';
import {
  ResultEndpoint,
  resultOpenApiSchema,
} from '../dto/result-openapi.contract';
import {
  candidateAudienceInput,
  releaseOutputs,
  ResultReviewsQueryDto,
} from '../dto/result-release.dto';
import { ResultErrorFilter } from './result-error.filter';

@SchoolManagementOnly()
@ApiTags('official-results')
@ApiBearerAuth()
@UseFilters(ResultErrorFilter)
@Controller('official-results')
export class ResultReleaseController {
  constructor(private readonly release: ResultReleaseService) {}

  @Post('candidates')
  @HttpCode(202)
  @ApiBody({ schema: resultOpenApiSchema(releaseInputs.capture) })
  @ResultEndpoint(
    'captureOfficialResultsCandidates',
    'reviews.submit',
    releaseOutputs.operation,
    202,
    'REQUIRED',
  )
  async capture(
    @Body(new ResultBodyPipe(releaseInputs.capture))
    input: ReleaseInput<'capture'>,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.release.capture('SCHOOL', input, key) };
  }

  @Get('candidates/:id')
  @ResultEndpoint(
    'getOfficialResultsCandidate',
    'sheets.view',
    releaseOutputs.candidate,
  )
  async detail(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.release.detail('SCHOOL', id) };
  }

  @Get('reviews')
  @ResultEndpoint(
    'listOfficialResultsReviews',
    'reviews.approve',
    releaseOutputs.reviews,
  )
  async list(@Query() query: ResultReviewsQueryDto) {
    return { data: await this.release.list(query) };
  }

  @Post('reviews/decisions')
  @HttpCode(200)
  @ApiBody({ schema: resultOpenApiSchema(releaseInputs.decide) })
  @ResultEndpoint(
    'decideOfficialResultsReview',
    'reviews.approve',
    releaseOutputs.decision,
    200,
    'REQUIRED',
  )
  async decide(
    @Body(new ResultBodyPipe(releaseInputs.decide))
    input: ReleaseInput<'decide'>,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.release.decide(input, key) };
  }

  @Post('candidates/:id/preview')
  @HttpCode(200)
  @ApiBody({ schema: resultOpenApiSchema(candidateAudienceInput) })
  @ResultEndpoint(
    'previewOfficialResultsCandidate',
    'sheets.view',
    releaseOutputs.preview,
    200,
  )
  async preview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ResultBodyPipe(candidateAudienceInput))
    input: { audience: 'STUDENT' | 'PARENT' },
  ) {
    return {
      data: await this.release.previewCandidate('SCHOOL', id, input.audience),
    };
  }

  @Post('publication-batches')
  @HttpCode(202)
  @ApiBody({ schema: resultOpenApiSchema(releaseInputs.publish) })
  @ResultEndpoint(
    'publishOfficialResultsBatch',
    'publications.publish',
    releaseOutputs.operation,
    202,
    'REQUIRED',
  )
  async publish(
    @Body(new ResultBodyPipe(releaseInputs.publish))
    input: ReleaseInput<'publish'>,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.release.publish('SCHOOL', input, key) };
  }

  @Post('corrections')
  @ApiBody({ schema: resultOpenApiSchema(releaseInputs.correction) })
  @ResultEndpoint(
    'requestOfficialResultsCorrection',
    'corrections.request',
    releaseOutputs.correction,
    201,
    'REQUIRED',
  )
  async correction(
    @Body(new ResultBodyPipe(releaseInputs.correction))
    input: ReleaseInput<'correction'>,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.release.correction('SCHOOL', input, key) };
  }

  @Get('publications/:id')
  @ResultEndpoint(
    'getOfficialResultsPublication',
    'sheets.view',
    releaseOutputs.publication,
  )
  async publication(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.release.publication('SCHOOL', id) };
  }

  @Post('publications/:id/revoke')
  @HttpCode(200)
  @ApiBody({ schema: resultOpenApiSchema(releaseInputs.revoke) })
  @ResultEndpoint(
    'revokeOfficialResultsPublication',
    'publications.revoke',
    releaseOutputs.publication,
    200,
    'REQUIRED',
  )
  async revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ResultBodyPipe(releaseInputs.revoke))
    input: ReleaseInput<'revoke'>,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.release.revoke(id, input, key) };
  }

  @Post('slots/:slotId/publication-topology/preview')
  @HttpCode(200)
  @ApiBody({ schema: resultOpenApiSchema(releaseInputs.topologyPreview) })
  @ResultEndpoint(
    'previewOfficialResultsPublicationTopology',
    'publications.publish',
    releaseOutputs.topologyPreview,
    200,
    undefined,
    ['publications.correct'],
  )
  async topologyPreview(
    @Param('slotId', ParseUUIDPipe) slotId: string,
    @Body(new ResultBodyPipe(releaseInputs.topologyPreview))
    input: ReleaseInput<'topologyPreview'>,
  ) {
    return { data: await this.release.topologyPreview(slotId, input) };
  }

  @Post('slots/:slotId/publication-topology/replace')
  @HttpCode(200)
  @ApiBody({ schema: resultOpenApiSchema(releaseInputs.topologyReplace) })
  @ResultEndpoint(
    'replaceOfficialResultsPublicationTopology',
    'publications.publish',
    releaseOutputs.composition,
    200,
    'REQUIRED',
    ['publications.correct'],
  )
  async topologyReplace(
    @Param('slotId', ParseUUIDPipe) slotId: string,
    @Body(new ResultBodyPipe(releaseInputs.topologyReplace))
    input: ReleaseInput<'topologyReplace'>,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.release.topologyReplace(slotId, input, key) };
  }
}

@ApiTags('teacher-official-results')
@ApiBearerAuth()
@UseFilters(ResultErrorFilter)
@Controller('teacher/official-results')
export class TeacherResultReleaseController {
  constructor(private readonly release: ResultReleaseService) {}

  @Post('candidates')
  @HttpCode(202)
  @ApiBody({ schema: resultOpenApiSchema(releaseInputs.capture) })
  @ResultEndpoint(
    'teacherCaptureOfficialResultsCandidates',
    'reviews.submit',
    releaseOutputs.operation,
    202,
    'REQUIRED',
  )
  async capture(
    @Body(new ResultBodyPipe(releaseInputs.capture))
    input: ReleaseInput<'capture'>,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.release.capture('TEACHER', input, key) };
  }

  @Get('candidates/:id')
  @ResultEndpoint(
    'teacherGetOfficialResultsCandidate',
    'sheets.view',
    releaseOutputs.candidate,
  )
  async detail(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.release.detail('TEACHER', id) };
  }

  @Post('candidates/:id/preview')
  @HttpCode(200)
  @ApiBody({ schema: resultOpenApiSchema(candidateAudienceInput) })
  @ResultEndpoint(
    'teacherPreviewOfficialResultsCandidate',
    'sheets.view',
    releaseOutputs.preview,
    200,
  )
  async preview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ResultBodyPipe(candidateAudienceInput))
    input: { audience: 'STUDENT' | 'PARENT' },
  ) {
    return {
      data: await this.release.previewCandidate('TEACHER', id, input.audience),
    };
  }

  @Post('publication-batches')
  @HttpCode(202)
  @ApiBody({ schema: resultOpenApiSchema(releaseInputs.publish) })
  @ResultEndpoint(
    'teacherPublishOfficialResultsBatch',
    'publications.publish',
    releaseOutputs.operation,
    202,
    'REQUIRED',
  )
  async publish(
    @Body(new ResultBodyPipe(releaseInputs.publish))
    input: ReleaseInput<'publish'>,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.release.publish('TEACHER', input, key) };
  }

  @Post('corrections')
  @ApiBody({ schema: resultOpenApiSchema(releaseInputs.correction) })
  @ResultEndpoint(
    'teacherRequestOfficialResultsCorrection',
    'corrections.request',
    releaseOutputs.correction,
    201,
    'REQUIRED',
  )
  async correction(
    @Body(new ResultBodyPipe(releaseInputs.correction))
    input: ReleaseInput<'correction'>,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.release.correction('TEACHER', input, key) };
  }

  @Get('publications/:id')
  @ResultEndpoint(
    'teacherGetOfficialResultsPublication',
    'sheets.view',
    releaseOutputs.publication,
  )
  async publication(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.release.publication('TEACHER', id) };
  }
}
