import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseFilters,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { AcademicContentEngagementExceptionFilter } from '../../../academics/academic-content/controller/academic-content-engagement-exception.filter';
import {
  AcademicContentAcknowledgementEmptyQueryDto,
  AcademicContentAcknowledgementRequestDto,
  AcademicContentAcknowledgementResponseDto,
} from '../../../academics/academic-content/dto/academic-content-acknowledgement.dto';
import { ParentAcademicContentAcknowledgementUseCase } from '../application/parent-academic-content.use-cases';

@ApiTags('parent-app')
@ApiBearerAuth()
@ApiBadRequestResponse({
  description: 'Strict UUID/body/query validation failed',
})
@ApiUnauthorizedResponse({
  description: 'Valid authenticated session required',
})
@ApiForbiddenResponse({
  description: 'Parent actor and Academic Content view permission required',
})
@ApiNotFoundResponse({
  description: 'Current owned child or eligible exact publication unavailable',
})
@ApiServiceUnavailableResponse({
  description: 'Acknowledgement temporarily unavailable',
})
@UseFilters(AcademicContentEngagementExceptionFilter)
@Controller('parent')
export class ParentAcademicContentAcknowledgementController {
  constructor(
    private readonly acknowledgement: ParentAcademicContentAcknowledgementUseCase,
  ) {}

  @Get('children/:studentId/academic-content/:contentId/acknowledgement')
  @Header('Cache-Control', 'no-store, private, max-age=0')
  @RequiredPermissions('academics.academic_content.view')
  @ApiOkResponse({ type: AcademicContentAcknowledgementResponseDto })
  status(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
    @Query() query: AcademicContentAcknowledgementRequestDto,
  ) {
    return this.acknowledgement.execute(
      studentId,
      contentId,
      query.expectedPublicationId,
      false,
    );
  }

  @Post('children/:studentId/academic-content/:contentId/acknowledgement')
  @HttpCode(200)
  @ApiTooManyRequestsResponse({
    description:
      'Shared School/actor engagement and acknowledgement quota exhausted; Retry-After: 60',
  })
  @Header('Cache-Control', 'no-store, private, max-age=0')
  @RequiredPermissions('academics.academic_content.view')
  @ApiOkResponse({ type: AcademicContentAcknowledgementResponseDto })
  record(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
    @Body() body: AcademicContentAcknowledgementRequestDto,
    @Query() _query: AcademicContentAcknowledgementEmptyQueryDto,
  ) {
    void _query;
    return this.acknowledgement.execute(
      studentId,
      contentId,
      body.expectedPublicationId,
      true,
    );
  }
}
